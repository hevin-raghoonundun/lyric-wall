'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { exchangeCode } from '@/lib/spotify'

export default function Callback() {
  const router = useRouter()

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code')
    if (!code) { router.replace('/'); return }

    exchangeCode(code)
      .then(() => router.replace('/'))
      .catch(() => router.replace('/'))
  }, [router])

  return (
    <main className="h-full flex items-center justify-center bg-black text-white">
      <p className="text-xl" style={{ color: 'rgba(255,255,255,0.4)' }}>
        Connecting to Spotify…
      </p>
    </main>
  )
}
