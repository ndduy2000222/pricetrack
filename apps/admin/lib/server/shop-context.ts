import { isPortalSessionValid } from './shop-auth'
import { getConnection, type ShopConnection } from './shop-portal'
import { supabaseHeaders } from './supabase-http'

export type ShopRole = 'viewer' | 'sync' | 'price_editor' | 'admin'
export type ShopContext = { connectionId: string, shopeeShopId: string, role: ShopRole, connection: ShopConnection }

const roleRank: Record<ShopRole, number> = { viewer: 1, sync: 2, price_editor: 3, admin: 4 }

function supabaseConfig () {
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? ''
  return url && key ? { url, key } : null
}

async function sessionUser (request: Request) {
  const cfg = supabaseConfig()
  const cookie = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith('alpha_shop_portal_session='))?.slice('alpha_shop_portal_session='.length)
  if (!cfg || !cookie || !(await isPortalSessionValid(request))) return null
  let token: string
  try { token = decodeURIComponent(cookie) } catch { return null }
  const response = await fetch(`${cfg.url}/auth/v1/user`, { headers: { ...supabaseHeaders(cfg.key), authorization: `Bearer ${token}` }, cache: 'no-store' })
  if (!response.ok) return null
  const user = await response.json().catch(() => ({})) as { id?: string, email?: string }
  return user.id ? user : null
}


async function membershipRole (connectionId: string, userId: string): Promise<ShopRole | null> {
  const cfg = supabaseConfig(); if (!cfg) throw new Error('shop_membership_lookup_failed')
  const query = new URLSearchParams({ select: 'role', connection_id: `eq.${connectionId}`, user_id: `eq.${userId}`, limit: '1' })
  const response = await fetch(`${cfg.url}/rest/v1/shop_memberships?${query}`, { headers: supabaseHeaders(cfg.key), cache: 'no-store' })
  if (!response.ok) throw new Error('shop_membership_lookup_failed')
  const rows = await response.json().catch(() => []) as Array<{ role?: string }>
  const role = rows[0]?.role
  return role === 'viewer' || role === 'sync' || role === 'price_editor' || role === 'admin' ? role : null
}

export async function requireShopContext (request: Request, requiredRole: ShopRole = 'viewer', connectionIdOverride?: string): Promise<ShopContext> {
  const connectionId = (connectionIdOverride ?? new URL(request.url).searchParams.get('connection_id') ?? '').trim()
  if (!connectionId) throw new Error('shop_context_required')
  const connection = await getConnection(connectionId)
  if (!connection) throw new Error('shop_not_found')
  const user = await sessionUser(request)
  if (!user?.id) throw new Error('unauthorized')
  const role = await membershipRole(connectionId, user.id)
  if (!role || roleRank[role] < roleRank[requiredRole]) throw new Error('shop_forbidden')
  return { connectionId, shopeeShopId: connection.shop_id, role, connection }
}

export function contextError (error: unknown) {
  const code = error instanceof Error ? error.message : 'authorization_failed'
  const status = code === 'unauthorized' ? 401 : code === 'shop_forbidden' ? 403 : code === 'shop_not_found' ? 404 : code === 'shop_context_required' ? 400 : code === 'shop_membership_lookup_failed' ? 503 : 500
  return { code, status }
}
