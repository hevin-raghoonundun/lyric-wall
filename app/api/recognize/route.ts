import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { audio } = await req.json()

  if (!audio) {
    return NextResponse.json({ error: 'No audio provided' }, { status: 400 })
  }

  const apiKey = process.env.SHAZAM_RAPID_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'SHAZAM_RAPID_API_KEY not configured' }, { status: 500 })
  }

  const res = await fetch('https://shazam.p.rapidapi.com/songs/detect', {
    method: 'POST',
    headers: {
      'content-type': 'text/plain',
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': 'shazam.p.rapidapi.com',
    },
    body: audio,
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Shazam API error' }, { status: 502 })
  }

  const data = await res.json()

  if (!data.track) {
    return NextResponse.json({ error: 'Not recognized' }, { status: 404 })
  }

  const track = data.track

  let album = ''
  const songSection = track.sections?.find((s: { type: string }) => s.type === 'SONG')
  const albumMeta = songSection?.metadata?.find((m: { title: string }) => m.title === 'Album')
  if (albumMeta) album = albumMeta.text

  return NextResponse.json({
    title: track.title ?? '',
    artist: track.subtitle ?? '',
    album,
    offsetSeconds: data.matches?.[0]?.offset ?? 0,
  })
}
