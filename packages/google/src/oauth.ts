import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { decryptSecret, encryptSecret, prisma } from '@reelforge/db'
import { getEnv, requireEnv } from '@reelforge/shared/env'

/**
 * Photos access is Picker-API only: the Library API read scopes were removed in
 * March 2025, so there is no way to list a user's albums from the app. Drive is
 * read-only.
 */
export const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'openid',
  'email',
]

export function configuredScopes(): string[] {
  const configured = (getEnv().GOOGLE_SCOPES ?? '').split(/\s+/).filter(Boolean)
  if (configured.length === 0) return DEFAULT_SCOPES
  // openid/email are always needed to label the connected account.
  return [...new Set([...configured, 'openid', 'email'])]
}

export function isGoogleConfigured(): boolean {
  const env = getEnv()
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
}

export function createOAuthClient(): OAuth2Client {
  const env = getEnv()
  return new google.auth.OAuth2(
    requireEnv('GOOGLE_CLIENT_ID'),
    requireEnv('GOOGLE_CLIENT_SECRET'),
    env.GOOGLE_REDIRECT_URI || `${env.APP_URL}/api/auth/google/callback`,
  )
}

export interface AuthStart {
  url: string
  codeVerifier: string
  state: string
}

/**
 * Authorisation-code flow with PKCE. The verifier never leaves the server — it
 * goes into a signed, HttpOnly cookie and comes back at the callback.
 */
export async function buildAuthUrl(): Promise<AuthStart> {
  const client = createOAuthClient()
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync()
  const state = crypto.randomUUID()

  const url = client.generateAuthUrl({
    access_type: 'offline',
    // Without this Google only returns a refresh token on the very first
    // consent, and a re-connect would leave the app unable to refresh.
    prompt: 'consent',
    scope: configuredScopes(),
    code_challenge_method: 'S256' as never,
    code_challenge: codeChallenge,
    state,
    include_granted_scopes: true,
  })

  return { url, codeVerifier, state }
}

export interface ConnectedAccount {
  id: string
  email: string
  scopes: string
  expiresAt: Date | null
}

/** Exchanges the callback code and stores the tokens encrypted at rest. */
export async function completeAuth(code: string, codeVerifier: string): Promise<ConnectedAccount> {
  const client = createOAuthClient()
  const { tokens } = await client.getToken({ code, codeVerifier })
  if (!tokens.access_token) throw new Error('Google did not return an access token')

  client.setCredentials(tokens)
  const info = await client.getTokenInfo(tokens.access_token)
  const email = info.email
  if (!email) throw new Error('Could not read the account email from Google')

  const data = {
    accessToken: encryptSecret(tokens.access_token),
    refreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : undefined,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scopes: (tokens.scope ?? info.scopes?.join(' ') ?? '').trim(),
  }

  const account = await prisma.googleAccount.upsert({
    where: { email },
    // A re-connect without a fresh refresh token must not wipe the stored one.
    update: data,
    create: { email, ...data, refreshToken: data.refreshToken ?? null },
  })

  return { id: account.id, email: account.email, scopes: account.scopes, expiresAt: account.expiresAt }
}

/**
 * An OAuth client for a stored account, with refreshed tokens written back so
 * the next job does not have to refresh again.
 */
export async function clientForAccount(accountId: string): Promise<OAuth2Client> {
  const account = await prisma.googleAccount.findUnique({ where: { id: accountId } })
  if (!account) throw new Error('That Google account is no longer connected')

  const client = createOAuthClient()
  client.setCredentials({
    access_token: decryptSecret(account.accessToken),
    refresh_token: account.refreshToken ? decryptSecret(account.refreshToken) : undefined,
    expiry_date: account.expiresAt?.getTime() ?? undefined,
  })

  client.on('tokens', (tokens) => {
    void prisma.googleAccount
      .update({
        where: { id: accountId },
        data: {
          ...(tokens.access_token ? { accessToken: encryptSecret(tokens.access_token) } : {}),
          ...(tokens.refresh_token ? { refreshToken: encryptSecret(tokens.refresh_token) } : {}),
          ...(tokens.expiry_date ? { expiresAt: new Date(tokens.expiry_date) } : {}),
        },
      })
      .catch(() => {
        // A failed write only costs one extra refresh next time.
      })
  })

  return client
}

/** Bearer token for the plain-REST calls (Picker API has no googleapis client). */
export async function accessTokenFor(accountId: string): Promise<string> {
  const client = await clientForAccount(accountId)
  const { token } = await client.getAccessToken()
  if (!token) throw new Error('Could not obtain a Google access token — try reconnecting')
  return token
}

export async function connectedAccount(): Promise<ConnectedAccount | null> {
  const account = await prisma.googleAccount.findFirst({ orderBy: { createdAt: 'desc' } })
  if (!account) return null
  return { id: account.id, email: account.email, scopes: account.scopes, expiresAt: account.expiresAt }
}

export async function disconnectAccount(accountId: string): Promise<void> {
  const account = await prisma.googleAccount.findUnique({ where: { id: accountId } })
  if (!account) return

  // Best effort: revoking at Google is what actually ends the grant, but a
  // network failure must not leave the row behind either.
  try {
    const client = await clientForAccount(accountId)
    await client.revokeCredentials()
  } catch {
    // Already revoked, or offline.
  }
  await prisma.googleAccount.delete({ where: { id: accountId } }).catch(() => {})
}
