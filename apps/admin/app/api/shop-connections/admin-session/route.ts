import { NextResponse } from 'next/server'
import { clearAdminCookie, createAdminCookie, isPortalAdmin, portalStatus, validAdminSecret } from '../../../../lib/server/shop-portal'

export const dynamic = 'force-dynamic'

export async function GET (request: Request) {
  return NextResponse.json({ status: 'ok', authenticated: isPortalAdmin(request), ...portalStatus() }, { headers: { 'cache-control': 'no-store' } })
}

export async function POST (request: Request) {
  const body = await request.json().catch(() => ({})) as { secret?: string }
  if (!validAdminSecret(String(body.secret ?? ''))) return NextResponse.json({ status: 'error', message: 'Mật khẩu quản trị không đúng hoặc chưa được cấu hình' }, { status: 401 })
  const response = NextResponse.json({ status: 'ok', authenticated: true })
  response.headers.set('Set-Cookie', createAdminCookie())
  return response
}

export async function DELETE () {
  const response = NextResponse.json({ status: 'ok', authenticated: false })
  response.headers.set('Set-Cookie', clearAdminCookie())
  return response
}
