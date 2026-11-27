import { NextResponse } from 'next/server'
import { clearAdminCookie, createAdminCookie, isPortalAdmin, portalStatus, validAdminSecret } from '../../../../lib/server/shop-portal'
import { clearPortalSessionCookie, createPortalSessionCookie, requestPortalLogin, verifyPortalAccessToken } from '../../../../lib/server/shop-auth'

export const dynamic = 'force-dynamic'

export async function GET (request: Request) {
  return NextResponse.json({ status: 'ok', authenticated: await isPortalAdmin(request), ...portalStatus() }, { headers: { 'cache-control': 'no-store' } })
}

export async function POST (request: Request) {
  const body = await request.json().catch(() => ({})) as { action?: string, email?: string, accessToken?: string, expiresIn?: number, secret?: string }
  try {
    if (body.action === 'request_link') { await requestPortalLogin(String(body.email ?? ''), new URL('/connect/shops/auth', request.url).toString()); return NextResponse.json({ status: 'ok', message: 'Đã gửi link đăng nhập qua email.' }) }
    if (body.action === 'complete_link') {
      if (!body.accessToken || !await verifyPortalAccessToken(body.accessToken)) return NextResponse.json({ status: 'error', message: 'Link đăng nhập không hợp lệ hoặc email chưa được cấp quyền.' }, { status: 401 })
      const maxAge = Math.min(3600, Math.max(60, Number(body.expiresIn) || 3600))
      const response = NextResponse.json({ status: 'ok', authenticated: true }); response.headers.set('Set-Cookie', createPortalSessionCookie(body.accessToken, maxAge)); return response
    }
    if (!validAdminSecret(String(body.secret ?? ''))) return NextResponse.json({ status: 'error', message: 'Hãy đăng nhập bằng email OTP.' }, { status: 401 })
    const response = NextResponse.json({ status: 'ok', authenticated: true }); response.headers.set('Set-Cookie', createAdminCookie()); return response
  } catch (error) {
    const code = error instanceof Error ? error.message : 'shop_auth_failed'
    const message = code === 'email_not_allowed' ? 'Email này chưa được cấp quyền quản trị.' : code === 'shop_auth_not_configured' ? 'Đăng nhập email chưa được cấu hình trên máy chủ.' : 'Không thể gửi link đăng nhập lúc này.'
    return NextResponse.json({ status: 'error', code: code === 'email_not_allowed' || code === 'shop_auth_not_configured' ? code : 'auth_provider_error', message }, { status: 400 })
  }
}

export async function DELETE () {
  const response = NextResponse.json({ status: 'ok', authenticated: false })
  response.headers.append('Set-Cookie', clearAdminCookie())
  response.headers.append('Set-Cookie', clearPortalSessionCookie())
  return response
}
