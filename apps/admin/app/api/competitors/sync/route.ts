import { NextResponse } from 'next/server'
import { loadCompetitorFeed, persistCompetitorFeed } from '../../../../lib/server/price-review'
import { readStoredCatalog } from '../../../../lib/server/stored-catalog'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized (request: Request) {
  const configured = process.env.COMPETITOR_SYNC_SECRET ?? process.env.CATALOG_SYNC_SECRET ?? process.env.CRON_SECRET ?? ''
  if (!configured) return false
  const header = request.headers.get('authorization') ?? ''
  return header === `Bearer ${configured}`
}

export async function POST (request: Request) {
  if (!authorized(request)) return NextResponse.json({ status: 'unauthorized' }, { status: 401 })
  const stored = await readStoredCatalog()
  if (!stored?.rows.length) return NextResponse.json({ status: 'error', code: 'catalog_not_configured' }, { status: 503 })
  const feed = await loadCompetitorFeed(stored.rows, { forceDiscovery: true })
  const persisted = await persistCompetitorFeed(feed)
  return NextResponse.json({ status: 'ok', feedStatus: feed.status, source: feed.source, shops: feed.shops, scope: feed.scope, persisted }, { headers: { 'cache-control': 'no-store' } })
}
