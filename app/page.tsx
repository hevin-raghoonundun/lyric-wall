'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { parseLrc, getCurrentLineIndex, type LrcLine } from '@/lib/lrc'
import {
  getNowPlaying, isLoggedIn, startAuth, logout, getArtistInfo,
  type NowPlaying, type ArtistInfo,
} from '@/lib/spotify'

interface Song {
  title: string
  artist: string
  artistId: string
  album: string
  albumArt: string
  progressMs: number
  detectedAt: number
}

const POLL_MS = 3000

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return n.toLocaleString()
}

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [song, setSong] = useState<Song | null>(null)
  const [lines, setLines] = useState<LrcLine[]>([])
  const [plain, setPlain] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [polling, setPolling] = useState(false)
  const [lyricsNotFound, setLyricsNotFound] = useState(false)
  const [artistInfo, setArtistInfo] = useState<ArtistInfo | null>(null)
  const [slideY, setSlideY] = useState(0)

  const songRef = useRef<Song | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const lyricsListRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => { songRef.current = song }, [song])
  useEffect(() => { setLoggedIn(isLoggedIn()) }, [])

  const fetchLyrics = useCallback(async (np: NowPlaying) => {
    const params = new URLSearchParams({ title: np.title, artist: np.artist, album: np.album })
    const res = await fetch(`/api/lyrics?${params}`)
    if (!res.ok) {
      setLyricsNotFound(true)
      if (np.artistId) getArtistInfo(np.artistId).then(setArtistInfo)
      return
    }
    const data = await res.json()
    if (data.synced) {
      setLines(parseLrc(data.synced))
    } else if (data.plain) {
      setPlain(data.plain)
    } else {
      setLyricsNotFound(true)
      if (np.artistId) getArtistInfo(np.artistId).then(setArtistInfo)
    }
  }, [])

  const poll = useCallback(async () => {
    const np = await getNowPlaying()
    if (!np) return
    const prev = songRef.current
    const isNew = !prev || prev.title !== np.title || prev.artist !== np.artist
    const newSong: Song = {
      title: np.title,
      artist: np.artist,
      artistId: np.artistId,
      album: np.album,
      albumArt: np.albumArt,
      progressMs: np.progressMs,
      detectedAt: Date.now(),
    }
    setSong(newSong)
    if (isNew) {
      setLines([])
      setPlain(null)
      setCurrent(0)
      setElapsed(np.progressMs / 1000)
      setLyricsNotFound(false)
      setArtistInfo(null)
      await fetchLyrics(np)
    }
  }, [fetchLyrics])

  useEffect(() => {
    if (!loggedIn) return
    setPolling(true)
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => { clearInterval(id); setPolling(false) }
  }, [loggedIn, poll])

  useEffect(() => {
    if (!song) return
    const interval = setInterval(() => {
      setElapsed((Date.now() - song.detectedAt) / 1000 + song.progressMs / 1000)
    }, 100)
    return () => clearInterval(interval)
  }, [song])

  useEffect(() => {
    if (!lines.length) return
    setCurrent(getCurrentLineIndex(lines, elapsed))
  }, [elapsed, lines])

  useEffect(() => {
    const el = lineRefs.current[current]
    const container = containerRef.current
    if (!el || !container) return
    const y = container.clientHeight / 2 - el.offsetTop - el.offsetHeight / 2
    setSlideY(y)
  }, [current])

  const handleLogout = () => {
    logout()
    setLoggedIn(false)
    setSong(null)
    setLines([])
    setPlain(null)
    setLyricsNotFound(false)
    setArtistInfo(null)
  }

  if (!loggedIn) {
    return (
      <main className="h-full flex flex-col items-center justify-center text-white gap-8" style={{ background: '#080808' }}>
        <div className="text-center">
          <p className="text-5xl font-bold mb-3">Lyric Wall</p>
          <p className="text-xl" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Connect Spotify to display live lyrics
          </p>
        </div>
        <button
          onClick={() => startAuth()}
          className="flex items-center gap-3 bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-lg px-8 py-4 rounded-full transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          Login with Spotify
        </button>
      </main>
    )
  }

  return (
    <main className="h-full flex overflow-hidden select-none text-white relative" style={{ background: '#080808' }}>

      {/* Blurred album art background — fades in on song change */}
      {song?.albumArt && (
        <div
          key={song.albumArt}
          className="absolute inset-0 overflow-hidden"
          style={{ animation: 'fadeIn 1.2s ease', zIndex: 0 }}
        >
          <img
            src={song.albumArt}
            alt=""
            style={{
              position: 'absolute',
              top: '-10%',
              left: '-10%',
              width: '120%',
              height: '120%',
              objectFit: 'cover',
              filter: 'blur(50px) saturate(200%) brightness(0.18)',
              pointerEvents: 'none',
            }}
          />
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)' }} />
        </div>
      )}

      {/* Content layer */}
      <div className="relative flex h-full w-full overflow-hidden" style={{ zIndex: 1 }}>

        {/* LEFT PANEL — album art + song info */}
        <div
          className="flex-shrink-0 flex flex-col justify-between"
          style={{ width: '38%', padding: '48px 40px', borderRight: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex-1 flex items-center justify-center">
            {song?.albumArt ? (
              <img
                key={song.albumArt}
                src={song.albumArt}
                alt="Album art"
                className="rounded-2xl"
                style={{
                  width: '100%',
                  maxWidth: '420px',
                  aspectRatio: '1',
                  objectFit: 'cover',
                  boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
                  animation: 'fadeIn 0.8s ease',
                }}
              />
            ) : (
              <div
                className="rounded-2xl"
                style={{ width: '100%', maxWidth: '420px', aspectRatio: '1', background: 'rgba(255,255,255,0.06)' }}
              />
            )}
          </div>

          <div className="flex-shrink-0 mt-8">
            {song ? (
              <>
                <p className="text-4xl font-bold leading-tight" style={{ wordBreak: 'break-word' }}>{song.title}</p>
                <p className="text-2xl mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>{song.artist}</p>
                <p className="text-base mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>{song.album}</p>
              </>
            ) : (
              <p className="text-xl" style={{ color: 'rgba(255,255,255,0.25)' }}>Waiting for Spotify…</p>
            )}

            <div className="flex items-center justify-between mt-6">
              <div className="flex items-center gap-2">
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1DB954' }} />
                <span className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {polling ? 'Live via Spotify' : 'Spotify'}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="text-sm transition-colors"
                style={{ color: 'rgba(255,255,255,0.2)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}
              >
                logout
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL — lyrics or artist info */}
        <div className="flex-1 relative overflow-hidden">
          {/* Top/bottom fade overlays */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32"
            style={{ background: 'linear-gradient(to bottom, rgba(8,8,8,0.85), transparent)' }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32"
            style={{ background: 'linear-gradient(to top, rgba(8,8,8,0.85), transparent)' }}
          />

          {/* Synced lyrics with slide */}
          {lines.length > 0 && (
            <div ref={containerRef} className="absolute inset-0 overflow-hidden">
              <div
                ref={lyricsListRef}
                style={{
                  transform: `translateY(${slideY}px)`,
                  transition: 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
                  willChange: 'transform',
                  paddingLeft: '40px',
                  paddingRight: '40px',
                }}
              >
                {lines.map((line, i) => {
                  const dist = i - current
                  const isCurrent = dist === 0
                  const opacity =
                    isCurrent ? 1
                    : Math.abs(dist) === 1 ? 0.45
                    : Math.abs(dist) <= 3 ? 0.18
                    : 0.06
                  const fontSize =
                    isCurrent ? '3.25rem'
                    : Math.abs(dist) === 1 ? '2.25rem'
                    : '1.75rem'
                  return (
                    <div
                      key={i}
                      ref={(el) => { lineRefs.current[i] = el }}
                      className="leading-tight transition-all duration-500 ease-out"
                      style={{
                        opacity,
                        fontSize,
                        fontWeight: isCurrent ? 700 : 400,
                        paddingTop: '12px',
                        paddingBottom: '12px',
                      }}
                    >
                      {line.text}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Plain (unsynced) lyrics */}
          {!lines.length && plain && (
            <div
              className="absolute inset-0 overflow-y-auto px-10 py-10"
              style={{ scrollbarWidth: 'none' } as React.CSSProperties}
            >
              <p className="text-2xl leading-relaxed whitespace-pre-line" style={{ color: 'rgba(255,255,255,0.65)' }}>
                {plain}
              </p>
            </div>
          )}

          {/* About the Artist — when no lyrics available */}
          {!lines.length && !plain && lyricsNotFound && (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-12 gap-7">
              <p
                className="text-xs uppercase tracking-widest"
                style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.2em' }}
              >
                About the Artist
              </p>

              {artistInfo ? (
                <>
                  {artistInfo.image && (
                    <img
                      src={artistInfo.image}
                      alt={artistInfo.name}
                      style={{
                        width: '190px',
                        height: '190px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
                        animation: 'fadeIn 0.6s ease',
                      }}
                    />
                  )}

                  <div className="text-center">
                    <p className="text-4xl font-bold">{artistInfo.name}</p>
                    <p className="mt-2 text-lg" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {formatFollowers(artistInfo.followers)} followers on Spotify
                    </p>
                  </div>

                  {artistInfo.genres.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-2 max-w-md">
                      {artistInfo.genres.slice(0, 5).map((g) => (
                        <span
                          key={g}
                          className="px-4 py-1.5 rounded-full text-sm capitalize"
                          style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)' }}
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.18)' }}>
                    No lyrics found for this track
                  </p>
                </>
              ) : (
                /* Artist info loading */
                <div className="flex gap-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-4 h-4 rounded-full animate-bounce"
                      style={{ background: 'rgba(255,255,255,0.3)', animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Loading / idle */}
          {!lines.length && !plain && !lyricsNotFound && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
              {song && (
                <div className="flex gap-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-4 h-4 rounded-full animate-bounce"
                      style={{ background: 'rgba(255,255,255,0.3)', animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              )}
              <p className="text-xl" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {song ? 'Loading lyrics…' : 'Play something on Spotify'}
              </p>
            </div>
          )}
        </div>

      </div>
    </main>
  )
}
