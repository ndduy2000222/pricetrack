const sessionCookie = 'alpha_shop_portal_session'
const refreshCookie = 'alpha_shop_portal_refresh'

function config () {
  const baseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
  const apiKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? ''
  return baseUrl && apiKey ? { baseUrl, apiKey } : null
}

function allowedEmails () {
  return new Set((process.env.SHOP_PORTAL_ALLOWED_EMAILS ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean))
}

function emailAllowed (email: unknown) {
  return typeof email === 'string' && allowedEmails().has(email.trim().toLowerCase())
}

async function authFetch<T> (path: string, body: Record<string, unknown>, redirectTo?: string) {
  const cfg = config(); if (!cfg) throw new Error('shop_auth_not_configured')
  const endpoint = new URL(`${cfg.baseUrl}/auth/v1/${path}`)
  if (redirectTo) endpoint.searchParams.set('redirect_to', redirectTo)
  const response = await fetch(endpoint, { method: 'POST', headers: { apikey: cfg.apiKey, 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' })
  const payload = await response.json().catch(() => ({})) as T & { error_description?: string, msg?: string, message?: string }
  if (!response.ok) throw new Error(payload.error_description ?? payload.msg ?? payload.message ?? 'shop_auth_failed')
  return payload
}

function sessionToken (request: Request, name: string) {
  const value = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
  if (!value) return null
  try { return decodeURIComponent(value) } catch { return null }
}

export function shopAuthStatus () {
  const cfg = config(); const emails = allowedEmails()
  return { configured: Boolean(cfg && emails.size), missing: [!cfg ? 'SUPABASE_URL + SUPABASE_ANON_KEY (hoặc SUPABASE_SECRET_KEY)' : '', !emails.size ? 'SHOP_PORTAL_ALLOWED_EMAILS' : ''].filter(Boolean) }
}

export async function requestPortalLogin (email: string, redirectTo: string) {
  if (!shopAuthStatus().configured) throw new Error('shop_auth_not_configured')
  if (!emailAllowed(email)) throw new Error('email_not_allowed')
  await authFetch('otp', { email: email.trim().toLowerCase(), create_user: true }, redirectTo)
}

export async function verifyPortalAccessToken (token: string) {
  const cfg = config(); if (!token || !cfg) return false
  const response = await fetch(`${cfg.baseUrl}/auth/v1/user`, { headers: { apikey: cfg.apiKey, authorization: `Bearer ${token}` }, cache: 'no-store' })
  if (!response.ok) return false
  const user = await response.json().catch(() => ({})) as { email?: string }
  return emailAllowed(user.email)
}

export async function portalUserFromRequest (request: Request) {
  const cfg = config(); const token = sessionToken(request, sessionCookie)
  if (!cfg || !token) return null
  const response = await fetch(`${cfg.baseUrl}/auth/v1/user`, { headers: { apikey: cfg.apiKey, authorization: `Bearer ${token}` }, cache: 'no-store' })
  if (!response.ok) return null
  const user = await response.json().catch(() => ({})) as { id?: string, email?: string }
  return user.id && emailAllowed(user.email) ? user : null
}

export async function isPortalSessionValid (request: Request) {
  return Boolean(await portalUserFromRequest(request))
}

export function createPortalSessionCookie (accessToken: string, maxAge: number, refreshToken?: string) {
  const suffix = `; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
  return `${sessionCookie}=${encodeURIComponent(accessToken)}${suffix}`
}
export function createPortalRefreshCookie (refreshToken: string, maxAge: number) { return `${refreshCookie}=${encodeURIComponent(refreshToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` }
export function clearPortalSessionCookie () { return [`${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`, `${refreshCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`].join(', ') }
