import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const title = searchParams.get('title') ?? ''
  const artist = searchParams.get('artist') ?? ''
  const album = searchParams.get('album') ?? ''

  if (!title || !artist) {
    return NextResponse.json({ error: 'title and artist required' }, { status: 400 })
  }

  const params = new URLSearchParams({ track_name: title, artist_name: artist })
  if (album) params.set('album_name', album)

  const res = await fetch(`https://lrclib.net/api/get?${params}`, {
    headers: { 'Lrclib-Client': 'LyricWall/1.0 (https://github.com)' },
    next: { revalidate: 86400 },
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Lyrics not found' }, { status: 404 })
  }

  const data = await res.json()
  return NextResponse.json({
    synced: data.syncedLyrics ?? null,
    plain: data.plainLyrics ?? null,
  })
}
