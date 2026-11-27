import { NextResponse } from 'next/server'
import { createInvite, isPortalAdmin, listConnections, portalStatus, publicInviteUrl } from '../../../lib/server/shop-portal'

export const dynamic = 'force-dynamic'

export async function GET (request: Request) {
  if (!await isPortalAdmin(request)) return NextResponse.json({ status: 'unauthorized', ...portalStatus() }, { status: 401, headers: { 'cache-control': 'no-store' } })
  try { return NextResponse.json({ status: 'ok', connections: await listConnections() }, { headers: { 'cache-control': 'no-store' } }) } catch (error) { return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : 'Không thể đọc danh sách shop' }, { status: 500 }) }
}

export async function POST (request: Request) {
  if (!await isPortalAdmin(request)) return NextResponse.json({ status: 'unauthorized' }, { status: 401 })
  try { const invite = await createInvite(); return NextResponse.json({ status: 'ok', ...invite, url: publicInviteUrl(request, invite.token) }, { headers: { 'cache-control': 'no-store' } }) } catch (error) { return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : 'Không thể tạo lời mời' }, { status: 500 }) }
}
