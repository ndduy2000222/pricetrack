import { NextResponse } from 'next/server'
import { createInvite, isPortalAdmin, listConnections, listConnectionsForUser, portalStatus, publicInviteUrl } from '../../../lib/server/shop-portal'
import { portalUserFromRequest } from '../../../lib/server/shop-auth'

export const dynamic = 'force-dynamic'

export async function GET (request: Request) {
  if (!await isPortalAdmin(request)) return NextResponse.json({ status: 'unauthorized', ...portalStatus() }, { status: 401, headers: { 'cache-control': 'no-store' } })
  try { const user = await portalUserFromRequest(request); const connections = user ? await listConnectionsForUser(user.id as string) : await listConnections(); return NextResponse.json({ status: 'ok', connections }, { headers: { 'cache-control': 'no-store' } }) } catch (error) { return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : 'Không thể đọc danh sách shop' }, { status: 500 }) }
}

export async function POST (request: Request) {
  if (!await isPortalAdmin(request)) return NextResponse.json({ status: 'unauthorized' }, { status: 401 })
  try { const user = await portalUserFromRequest(request); const invite = await createInvite(user?.id); return NextResponse.json({ status: 'ok', ...invite, url: publicInviteUrl(request, invite.token) }, { headers: { 'cache-control': 'no-store' } }) } catch (error) { return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : 'Không thể tạo lời mời' }, { status: 500 }) }
}
