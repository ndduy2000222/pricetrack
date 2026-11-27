import { supabaseHeaders } from './supabase-http'

type Config = { url: string, key: string }
export type StoredPromotion = { connectionId: string, discountId: string, name: string | null, status: string | null, startAt: string | null, endAt: string | null, itemCount: number | null, modelCount: number | null, observedAt: string, requestId: string | null, raw: Record<string, unknown> }

function config (): Config | null {
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? ''
  return url && key ? { url, key } : null
}

function headers (key: string, extra: Record<string, string> = {}) { return supabaseHeaders(key, { 'content-type': 'application/json', ...extra }) }
function record (value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {} }
function text (value: unknown) { return typeof value === 'string' && value ? value : null }
function integer (value: unknown) { return Number.isSafeInteger(Number(value)) ? Number(value) : null }
function iso (value: unknown) { const number = Number(value); if (!Number.isFinite(number) || number <= 0) return null; return new Date(number > 10_000_000_000 ? number : number * 1000).toISOString() }

async function request<T> (path: string, init: RequestInit = {}) {
  const cfg = config(); if (!cfg) throw new Error('supabase_not_configured')
  const response = await fetch(`${cfg.url}/rest/v1/${path}`, { ...init, headers: headers(cfg.key, init.headers as Record<string, string> | undefined), cache: 'no-store' })
  if (!response.ok) throw new Error(`supabase_${response.status}`)
  const body = await response.text(); return (body ? JSON.parse(body) : null) as T
}

export function normalizePromotion (connectionId: string, value: unknown, requestId: string | null = null): StoredPromotion | null {
  const raw = record(value); const discountId = text(raw.discount_id ?? raw.discountId)
  if (!discountId) return null
  return { connectionId, discountId, name: text(raw.discount_name ?? raw.name), status: text(raw.status), startAt: iso(raw.start_time ?? raw.startTime), endAt: iso(raw.end_time ?? raw.endTime), itemCount: integer(raw.item_count ?? raw.itemCount), modelCount: integer(raw.model_count ?? raw.modelCount), observedAt: new Date().toISOString(), requestId, raw }
}

export async function savePromotions (connectionId: string, promotions: StoredPromotion[]) {
  if (!promotions.length) return 0
  await request('shop_promotions?on_conflict=connection_id,discount_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(promotions.map((promotion) => ({ connection_id: connectionId, discount_id: promotion.discountId, name: promotion.name, status: promotion.status, start_at: promotion.startAt, end_at: promotion.endAt, item_count: promotion.itemCount, model_count: promotion.modelCount, observed_at: promotion.observedAt, request_id: promotion.requestId, raw: promotion.raw, updated_at: new Date().toISOString() }))) })
  return promotions.length
}

export async function readStoredPromotions (connectionId: string, status?: string) {
  const query = new URLSearchParams({ select: 'connection_id,discount_id,name,status,start_at,end_at,item_count,model_count,observed_at,request_id,raw', connection_id: `eq.${connectionId}`, order: 'start_at.desc.nullslast,discount_id.asc', limit: '1000' })
  if (status && ['upcoming', 'ongoing', 'expired'].includes(status)) query.set('status', `eq.${status}`)
  const rows = await request<Array<Record<string, unknown>>>(`shop_promotions?${query}`)
  return rows.map((row) => ({ connectionId: String(row.connection_id), discountId: String(row.discount_id), name: text(row.name), status: text(row.status), startAt: text(row.start_at), endAt: text(row.end_at), itemCount: integer(row.item_count), modelCount: integer(row.model_count), observedAt: String(row.observed_at ?? ''), requestId: text(row.request_id), raw: record(row.raw) }))
}
