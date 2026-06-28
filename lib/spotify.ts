const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID!
const SCOPES = 'user-read-currently-playing user-read-playback-state'

function getRedirectUri(): string {
  return `${window.location.origin}/callback`
}

function generateVerifier(): string {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function generateChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

export async function startAuth(): Promise<void> {
  const verifier = generateVerifier()
  const challenge = await generateChallenge(verifier)
  localStorage.setItem('sp_verifier', verifier)

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  })

  window.location.href = `https://accounts.spotify.com/authorize?${params}`
}

export async function exchangeCode(code: string): Promise<void> {
  const verifier = localStorage.getItem('sp_verifier')
  if (!verifier) throw new Error('No PKCE verifier in storage')

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
      code_verifier: verifier,
    }),
  })

  if (!res.ok) throw new Error('Token exchange failed')

  const data = await res.json()
  localStorage.setItem('sp_token', data.access_token)
  localStorage.setItem('sp_refresh', data.refresh_token)
  localStorage.setItem('sp_expires', String(Date.now() + data.expires_in * 1000))
  localStorage.removeItem('sp_verifier')
}

async function refreshAccessToken(): Promise<void> {
  const refresh = localStorage.getItem('sp_refresh')
  if (!refresh) throw new Error('No refresh token')

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refresh,
    }),
  })

  if (!res.ok) throw new Error('Token refresh failed')

  const data = await res.json()
  localStorage.setItem('sp_token', data.access_token)
  localStorage.setItem('sp_expires', String(Date.now() + data.expires_in * 1000))
  if (data.refresh_token) localStorage.setItem('sp_refresh', data.refresh_token)
}

async function getValidToken(): Promise<string | null> {
  const token = localStorage.getItem('sp_token')
  const expires = parseInt(localStorage.getItem('sp_expires') ?? '0')
  if (!token) return null

  if (Date.now() > expires - 60_000) {
    try { await refreshAccessToken() } catch { return null }
  }

  return localStorage.getItem('sp_token')
}

export interface NowPlaying {
  title: string
  artist: string
  album: string
  progressMs: number
  durationMs: number
}

export async function getNowPlaying(): Promise<NowPlaying | null> {
  const token = await getValidToken()
  if (!token) return null

  const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 204 || !res.ok) return null

  const data = await res.json()
  if (!data.is_playing || !data.item) return null

  return {
    title: data.item.name,
    artist: data.item.artists?.[0]?.name ?? '',
    album: data.item.album?.name ?? '',
    progressMs: data.progress_ms ?? 0,
    durationMs: data.item.duration_ms ?? 0,
  }
}

export function isLoggedIn(): boolean {
  return !!localStorage.getItem('sp_token')
}

export function logout(): void {
  ['sp_token', 'sp_refresh', 'sp_expires', 'sp_verifier'].forEach((k) =>
    localStorage.removeItem(k)
  )
}
