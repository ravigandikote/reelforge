import Link from 'next/link'
import { configuredScopes, connectedAccount, isGoogleConfigured } from '@reelforge/google'
import { getEnv } from '@reelforge/shared/env'
import { DisconnectButton } from '@/components/GoogleAccountCard'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { connected?: string; error?: string }
}) {
  const env = getEnv()
  const configured = isGoogleConfigured()
  const account = configured ? await connectedAccount() : null
  const redirectUri = env.GOOGLE_REDIRECT_URI || `${env.APP_URL}/api/auth/google/callback`

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Settings</h1>
        <p className="mt-1 font-caption text-sm text-indigo/60">
          Connections and feature flags. Keys themselves live in <code className="font-mono">.env</code>.
        </p>
      </header>

      {searchParams.connected && (
        <div className="rounded-md border border-emerald-600/30 bg-emerald-600/10 p-3 font-caption text-sm text-emerald-900">
          Connected as {searchParams.connected}.
        </div>
      )}
      {searchParams.error && (
        <div className="rounded-md border border-red-600/30 bg-red-600/10 p-3 font-caption text-sm text-red-900">
          {searchParams.error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Google account</CardTitle>
          <CardDescription>
            Used for the Photos Picker and for reading Drive folders. Tokens are encrypted at rest.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 font-caption text-sm">
          {!configured ? (
            <>
              <Badge variant="warn">Not configured</Badge>
              <p className="text-indigo/70">
                Add <code className="font-mono">GOOGLE_CLIENT_ID</code> and{' '}
                <code className="font-mono">GOOGLE_CLIENT_SECRET</code> to{' '}
                <code className="font-mono">.env</code>, then restart. In the Google Cloud console,
                enable the <strong>Photos Picker API</strong> and the <strong>Drive API</strong>, and
                set the OAuth client&apos;s redirect URI to exactly:
              </p>
              <code className="block rounded bg-indigo/5 px-3 py-2 font-mono text-xs">
                {redirectUri}
              </code>
            </>
          ) : account ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="ok">Connected</Badge>
                <span className="text-indigo/80">{account.email}</span>
                <span className="ml-auto">
                  <DisconnectButton email={account.email} />
                </span>
              </div>
              <p className="text-xs text-indigo/50">
                Token expires {formatDate(account.expiresAt) ?? 'soon'} and refreshes automatically.
              </p>
              <ul className="space-y-0.5 text-xs text-indigo/50">
                {account.scopes
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((scope) => (
                    <li key={scope} className="font-mono">
                      {scope.replace('https://www.googleapis.com/auth/', '')}
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <>
              <Badge variant="muted">Not connected</Badge>
              <p className="text-indigo/70">
                Connecting opens Google&apos;s consent screen. ReelForge asks only for the Photos
                Picker scope and read-only Drive — it cannot browse your albums, only what you pick.
              </p>
              <a
                href="/api/auth/google"
                className="inline-block rounded-md bg-terracotta px-4 py-2 font-caption text-sm font-medium text-cream hover:bg-terracotta/90"
              >
                Connect Google
              </a>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feature flags</CardTitle>
          <CardDescription>Set in <code className="font-mono">.env</code>.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 font-caption text-sm">
          <div className="flex items-center justify-between">
            <div>
              <p>Share-link ingest</p>
              <p className="text-xs text-indigo/50">
                Unsupported HTML scraping of photos.app.goo.gl links.
              </p>
            </div>
            <Badge variant={env.ENABLE_SHARE_LINK_SCRAPER ? 'warn' : 'muted'}>
              {env.ENABLE_SHARE_LINK_SCRAPER ? 'enabled' : 'off'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Service keys</CardTitle>
          <CardDescription>Presence only — values are never shown.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 font-caption text-sm">
          {[
            ['Anthropic (descriptions, EDL planning)', Boolean(env.ANTHROPIC_API_KEY)],
            ['ElevenLabs (voiceover)', Boolean(env.ELEVENLABS_API_KEY)],
            ['Google OAuth client', configured],
          ].map(([label, present]) => (
            <div key={String(label)} className="flex items-center justify-between">
              <span>{label}</span>
              <Badge variant={present ? 'ok' : 'muted'}>{present ? 'set' : 'missing'}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="font-caption text-xs text-indigo/50">
        Configuration is read at startup — restart <code className="font-mono">pnpm dev</code> after
        editing <code className="font-mono">.env</code>. Scopes requested:{' '}
        {configuredScopes().length} ·{' '}
        <Link href="/library" className="text-terracotta hover:underline">
          back to the library
        </Link>
      </p>
    </div>
  )
}
