import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { createShopeeAuthorizationUrl, exchangeShopeeAuthorizationCode, type ShopeeTokenSet } from './shopee-open-api'
import { persistShopeeTokens } from './shopee-token-store'

type SupabaseConfig = { baseUrl: string, serviceKey: string }
type InviteRow = { id: string, token_hash: string, expires_at: string, used_at: string | null, status: string, connection_id: string | null }
export type ShopConnection = { id: string, shop_id: string, name: string | null, status: string, last_catalog_sync_at: string | null, last_error: string | null, created_at: string, updated_at: string }
export type SyncRun = { id: string, connection_id: string, status: string, next_offset: number, page_count: number, total_items: number | null, processed_items: number, processed_rows: number, last_error: string | null, started_at: string | null, completed_at: string | null }

const inviteTtlMs = 15 * 60 * 1000
const adminCookie = 'alpha_shop_portal_admin'

function config (): SupabaseConfig | null {
  const baseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? ''
  return baseUrl && serviceKey ? { baseUrl, serviceKey } : null
}

function headers (cfg: SupabaseConfig, extra: Record<string, string> = {}) {
  return { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, 'content-type': 'application/json', ...extra }
}

async function supabaseFetch<T> (path: string, init: RequestInit = {}): Promise<T> {
  const cfg = config(); if (!cfg) throw new Error('supabase_not_configured')
  const response = await fetch(`${cfg.baseUrl}/rest/v1/${path}`, { ...init, headers: headers(cfg, init.headers as Record<string, string> | undefined), cache: 'no-store' })
  if (!response.ok) throw new Error(`supabase_${response.status}`)
  const text = await response.text()
  return (text ? JSON.parse(text) : null) as T
}

function portalSecret () { return process.env.SHOP_PORTAL_ADMIN_SECRET ?? process.env.CATALOG_SYNC_SECRET ?? '' }
function adminCookieValue () { const secret = portalSecret(); return secret ? createHmac('sha256', secret).update('alpha-shop-portal-admin-v1').digest('hex') : '' }
function cookieValue (request: Request) { return request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${adminCookie}=`))?.slice(adminCookie.length + 1) ?? '' }

export function portalStatus () { return { configured: Boolean(config() && process.env.SHOPEE_PARTNER_ID && process.env.SHOPEE_PARTNER_KEY && process.env.SHOPEE_TOKEN_ENCRYPTION_KEY && portalSecret()), missing: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY', 'SHOPEE_PARTNER_ID', 'SHOPEE_PARTNER_KEY', 'SHOPEE_TOKEN_ENCRYPTION_KEY', 'SHOP_PORTAL_ADMIN_SECRET'].filter((key) => (key === 'SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY' ? !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY : !process.env[key] && !(key === 'SHOP_PORTAL_ADMIN_SECRET' && process.env.CATALOG_SYNC_SECRET))) } }
export function isPortalAdmin (request: Request) {
  const expected = adminCookieValue(); const actual = cookieValue(request)
  return Boolean(expected && actual && expected.length === actual.length && timingSafeEqual(Buffer.from(expected), Buffer.from(actual)))
}
export function createAdminCookie () { return `${adminCookie}=${adminCookieValue()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` }
export function clearAdminCookie () { return `${adminCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` }
export function validAdminSecret (value: string) { const expected = portalSecret(); return Boolean(expected && value && value.length === expected.length && timingSafeEqual(Buffer.from(value), Buffer.from(expected))) }

export async function listConnections () {
  return supabaseFetch<ShopConnection[]>('shop_connections?select=id,shop_id,name,status,last_catalog_sync_at,last_error,created_at,updated_at&order=created_at.desc')
}

export async function createInvite () {
  const token = randomBytes(32).toString('base64url')
  const row = { token_hash: createHash('sha256').update(token).digest('hex'), expires_at: new Date(Date.now() + inviteTtlMs).toISOString(), status: 'pending' }
  await supabaseFetch('shop_connection_invites', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) })
  return { token, expiresAt: row.expires_at }
}

export async function readInvite (token: string) {
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const rows = await supabaseFetch<InviteRow[]>(`shop_connection_invites?token_hash=eq.${encodeURIComponent(tokenHash)}&select=id,token_hash,expires_at,used_at,status,connection_id&limit=1`)
  const row = rows[0]
  if (!row || row.status !== 'pending' || row.used_at || Date.parse(row.expires_at) <= Date.now()) return null
  return row
}

export async function startShopAuthorization (token: string, redirectUri: string) {
  const invite = await readInvite(token); if (!invite) throw new Error('invite_invalid_or_expired')
  const state = randomBytes(32).toString('base64url')
  const stateHash = createHash('sha256').update(state).digest('hex')
  await supabaseFetch(`shop_connection_invites?id=eq.${encodeURIComponent(invite.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ state_hash: stateHash, state_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() }) })
  const url = createShopeeAuthorizationUrl({ redirectUri })
  const authUrl = new URL(url); authUrl.searchParams.set('state', state)
  return { authorizationUrl: authUrl.toString(), state }
}

export async function completeShopAuthorization (params: { state: string, code: string, shopId: string, redirectUri: string }) {
  const stateHash = createHash('sha256').update(params.state).digest('hex')
  const invites = await supabaseFetch<InviteRow[]>(`shop_connection_invites?state_hash=eq.${encodeURIComponent(stateHash)}&select=id,token_hash,expires_at,used_at,status,connection_id&limit=1`)
  const invite = invites[0]
  if (!invite || invite.status !== 'pending' || invite.used_at || Date.parse(invite.expires_at) <= Date.now()) throw new Error('oauth_state_invalid_or_expired')
  const exchanged = await exchangeShopeeAuthorizationCode({ code: params.code, shopId: params.shopId })
  await persistShopeeTokens(params.shopId, exchanged.tokens)
  const existing = await supabaseFetch<ShopConnection[]>(`shop_connections?shop_id=eq.${encodeURIComponent(params.shopId)}&select=id&limit=1`)
  const connectionPayload = { shop_id: params.shopId, name: `Shopee shop ${params.shopId}`, status: 'connected', last_error: null, updated_at: new Date().toISOString() }
  let connectionId = existing[0]?.id
  if (connectionId) await supabaseFetch(`shop_connections?id=eq.${encodeURIComponent(connectionId)}`, { method: 'PATCH', body: JSON.stringify(connectionPayload) })
  else {
    const created = await supabaseFetch<ShopConnection[]>('shop_connections', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(connectionPayload) })
    connectionId = created[0]?.id
  }
  if (!connectionId) throw new Error('connection_create_failed')
  await supabaseFetch(`shop_connection_invites?id=eq.${encodeURIComponent(invite.id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'used', used_at: new Date().toISOString(), connection_id: connectionId, state_hash: null, state_expires_at: null }) })
  return { connectionId, shopId: params.shopId }
}

export async function getConnection (id: string) {
  const rows = await supabaseFetch<ShopConnection[]>(`shop_connections?id=eq.${encodeURIComponent(id)}&select=*&limit=1`)
  return rows[0] ?? null
}

export async function createSyncRun (connectionId: string) {
  const rows = await supabaseFetch<SyncRun[]>('shop_sync_runs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ connection_id: connectionId, status: 'running', next_offset: 0, page_count: 0, processed_items: 0, processed_rows: 0, started_at: new Date().toISOString() }) })
  return rows[0]
}

export async function getSyncRun (id: string) {
  const rows = await supabaseFetch<SyncRun[]>(`shop_sync_runs?id=eq.${encodeURIComponent(id)}&select=*&limit=1`)
  return rows[0] ?? null
}

export async function updateSyncRun (id: string, patch: Partial<SyncRun>) {
  await supabaseFetch(`shop_sync_runs?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

export async function saveCatalogRows (connectionId: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return
  await supabaseFetch('shop_catalog_rows?on_conflict=connection_id,item_id,model_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.map((row) => ({ connection_id: connectionId, ...row }))) })
}

export async function completeSyncConnection (connectionId: string, patch: Record<string, unknown>) {
  await supabaseFetch(`shop_connections?id=eq.${encodeURIComponent(connectionId)}`, { method: 'PATCH', body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) })
}

export function publicInviteUrl (request: Request, token: string) { return new URL(`/connect/shop?token=${encodeURIComponent(token)}`, request.url).toString() }

export type { ShopeeTokenSet }
