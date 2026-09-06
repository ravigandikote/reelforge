'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function DisconnectButton({ email }: { email: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm(`Disconnect ${email}? Ingested media stays in the library.`)) return
        setBusy(true)
        try {
          await fetch('/api/auth/google/disconnect', { method: 'POST' })
          router.refresh()
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? 'Disconnecting…' : 'Disconnect'}
    </Button>
  )
}
