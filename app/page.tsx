'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { parseLrc, getCurrentLineIndex, type LrcLine } from '@/lib/lrc'
import { getNowPlaying, isLoggedIn, startAuth, logout, type NowPlaying } from '@/lib/spotify'

interface Song {
  title: string
  artist: string
  album: string
  progressMs: number
  detectedAt: number
}

const POLL_MS = 3000

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [song, setSong] = useState<Song | null>(null)
  const [lines, setLines] = useState<LrcLine[]>([])
  const [plain, setPlain] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [polling, setPolling] = useState(false)

  const songRef = useRef<Song | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    songRef.current = song
  }, [song])

  // Check login state on mount (localStorage is client-only)
  useEffect(() => {
    setLoggedIn(isLoggedIn())
  }, [])

  const fetchLyrics = useCallback(async (np: NowPlaying) => {
    const params = new URLSearchParams({
      title: np.title,
      artist: np.artist,
      album: np.album,
    })
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

  // Start polling when logged in
  useEffect(() => {
    if (!loggedIn) return
    setPolling(true)
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => { clearInterval(id); setPolling(false) }
  }, [loggedIn, poll])

  // Tick elapsed time between polls using detectedAt + initial progressMs
  useEffect(() => {
    if (!song) return
    const interval = setInterval(() => {
      setElapsed((Date.now() - song.detectedAt) / 1000 + song.progressMs / 1000)
    }, 100)
    return () => clearInterval(interval)
  }, [song])

  // Derive current lyric line
  useEffect(() => {
    if (!lines.length) return
    setCurrent(getCurrentLineIndex(lines, elapsed))
  }, [elapsed, lines])

  // Scroll current line to center
  useEffect(() => {
    const el = lineRefs.current[current]
    const container = containerRef.current
    if (!el || !container) return
    const top = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2
    container.scrollTo({ top, behavior: 'smooth' })
  }, [current])

  const handleLogout = () => {
    logout()
    setLoggedIn(false)
    setSong(null)
    setLines([])
    setPlain(null)
  }

  // Login screen
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
    <main className="h-full flex flex-col overflow-hidden select-none bg-black text-white">
      {/* Song header */}
      {song && (
        <div className="flex-shrink-0 px-10 pt-10 pb-2 flex items-start justify-between">
          <div>
            <p className="text-5xl font-bold tracking-tight leading-tight">{song.title}</p>
            <p className="text-2xl mt-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {song.artist}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm mt-1 transition-colors"
            style={{ color: 'rgba(255,255,255,0.2)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}
          >
            logout
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 relative overflow-hidden">
        {/* Top fade */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24"
          style={{ background: 'linear-gradient(to bottom, #000, transparent)' }}
        />
        {/* Bottom fade */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24"
          style={{ background: 'linear-gradient(to top, #000, transparent)' }}
        />

        {/* Synced lyrics */}
        {lines.length > 0 && (
          <div
            ref={containerRef}
            className="absolute inset-0 overflow-y-auto"
            style={{ scrollbarWidth: 'none' } as React.CSSProperties}
          >
            <div className="px-10 py-48">
              {lines.map((line, i) => {
                const dist = i - current
                const isCurrent = dist === 0
                const opacity =
                  isCurrent ? 1
                  : dist === 1 ? 0.5
                  : Math.abs(dist) <= 3 ? 0.2
                  : 0.07
                const fontSize =
                  isCurrent ? '3rem'
                  : Math.abs(dist) === 1 ? '2.25rem'
                  : '1.875rem'
                return (
                  <div
                    key={i}
                    ref={(el) => { lineRefs.current[i] = el }}
                    className="py-3 leading-tight transition-all duration-500 ease-out"
                    style={{ opacity, fontSize, fontWeight: isCurrent ? 700 : 400 }}
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
            <p
              className="text-2xl leading-relaxed whitespace-pre-line"
              style={{ color: 'rgba(255,255,255,0.6)' }}
            >
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
              {song
                ? `${song.title} · ${song.artist}`
                : 'Waiting for music to play on Spotify…'}
            </p>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div
        className="flex-shrink-0 px-10 pb-6 pt-2 flex justify-between items-center text-sm"
        style={{ color: 'rgba(255,255,255,0.15)' }}
      >
        <span>{polling ? 'Listening via Spotify…' : ''}</span>
        <span>lyric wall</span>
      </div>
    </main>
  )
}
