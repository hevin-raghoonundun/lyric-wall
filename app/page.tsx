'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { parseLrc, getCurrentLineIndex, type LrcLine } from '@/lib/lrc'
import { getNowPlaying, isLoggedIn, startAuth, logout, type NowPlaying } from '@/lib/spotify'

interface Song {
  title: string
  artist: string
  album: string
  albumArt: string
  progressMs: number
  detectedAt: number
}

type RGB = [number, number, number]

const POLL_MS = 3000

function extractDominantColor(src: string): Promise<RGB> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 60
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, 60, 60)
      const data = ctx.getImageData(0, 0, 60, 60).data
      let r = 0, g = 0, b = 0, n = 0
      for (let i = 0; i < data.length; i += 4) {
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
        // Skip near-black and near-white pixels — they skew the result
        if (brightness > 25 && brightness < 235) {
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++
        }
      }
      resolve(n > 0 ? [r / n, g / n, b / n] : [15, 15, 15])
    }
    img.onerror = () => resolve([15, 15, 15])
    img.src = src
  })
}

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [song, setSong] = useState<Song | null>(null)
  const [lines, setLines] = useState<LrcLine[]>([])
  const [plain, setPlain] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [polling, setPolling] = useState(false)
  const [accentRgb, setAccentRgb] = useState<RGB>([15, 15, 15])
  const [slideY, setSlideY] = useState(0)

  const songRef = useRef<Song | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const lyricsListRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => { songRef.current = song }, [song])
  useEffect(() => { setLoggedIn(isLoggedIn()) }, [])

  // Extract dominant color from album art
  useEffect(() => {
    if (!song?.albumArt) { setAccentRgb([15, 15, 15]); return }
    extractDominantColor(song.albumArt).then(setAccentRgb)
  }, [song?.albumArt])

  const fetchLyrics = useCallback(async (np: NowPlaying) => {
    const params = new URLSearchParams({ title: np.title, artist: np.artist, album: np.album })
    const res = await fetch(`/api/lyrics?${params}`)
    if (!res.ok) return
    const data = await res.json()
    if (data.synced) setLines(parseLrc(data.synced))
    else if (data.plain) setPlain(data.plain)
  }, [])

  const poll = useCallback(async () => {
    const np = await getNowPlaying()
    if (!np) return
    const prev = songRef.current
    const isNew = !prev || prev.title !== np.title || prev.artist !== np.artist
    const newSong: Song = {
      title: np.title,
      artist: np.artist,
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

  // Slide lyrics list so current line is vertically centered
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
    setAccentRgb([15, 15, 15])
  }

  const [r, g, b] = accentRgb

  if (!loggedIn) {
    return (
      <main className="h-full flex flex-col items-center justify-center bg-black text-white gap-8">
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
    <main
      className="h-full flex overflow-hidden select-none text-white transition-colors duration-1000"
      style={{
        background: `
          radial-gradient(ellipse 90% 90% at 15% 50%, rgba(${r},${g},${b},0.55) 0%, transparent 65%),
          radial-gradient(ellipse 50% 70% at 85% 50%, rgba(${r},${g},${b},0.2) 0%, transparent 65%),
          #0a0a0a
        `,
      }}
    >

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
              style={{ width: '100%', maxWidth: '420px', aspectRatio: '1', objectFit: 'cover', boxShadow: `0 32px 80px rgba(${r},${g},${b},0.5)` }}
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

      {/* RIGHT PANEL — lyrics */}
      <div className="flex-1 relative overflow-hidden">
        {/* Top fade */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32"
          style={{ background: 'linear-gradient(to bottom, rgba(10,10,10,0.95), transparent)' }}
        />
        {/* Bottom fade */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32"
          style={{ background: 'linear-gradient(to top, rgba(10,10,10,0.95), transparent)' }}
        />

        {/* Synced lyrics — transform slide */}
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

        {/* Plain lyrics */}
        {!lines.length && plain && (
          <div
            className="absolute inset-0 overflow-y-auto px-10 py-10"
            style={{ scrollbarWidth: 'none' } as React.CSSProperties}
          >
            <p className="text-2xl leading-relaxed whitespace-pre-line" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {plain}
            </p>
          </div>
        )}

        {/* Waiting state */}
        {!lines.length && !plain && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
            {polling && (
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

    </main>
  )
}
