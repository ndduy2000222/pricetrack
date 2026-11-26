import { NextResponse } from 'next/server'
import { isPortalAdmin } from '../../../../../lib/server/shop-portal'

export const dynamic = 'force-dynamic'

export async function GET (request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isPortalAdmin(request)) return NextResponse.json({ status: 'unauthorized' }, { status: 401 })
  const { id } = await context.params
  const url = new URL(request.url); const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 100), 1), 1000); const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0)
  const base = (process.env.SUPABASE_URL ?? '').replace(/\/$/, ''); const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? ''
  if (!base || !key) return NextResponse.json({ status: 'error', message: 'supabase_not_configured' }, { status: 500 })
  const query = new URLSearchParams({ connection_id: `eq.${id}`, select: '*', order: 'item_id.asc,model_id.asc', limit: String(limit), offset: String(offset) })
  const response = await fetch(`${base}/rest/v1/shop_catalog_rows?${query.toString()}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' })
  if (!response.ok) return NextResponse.json({ status: 'error', message: 'catalog_read_failed' }, { status: 500 })
  return NextResponse.json({ status: 'ok', rows: await response.json(), offset, limit }, { headers: { 'cache-control': 'no-store' } })
}
