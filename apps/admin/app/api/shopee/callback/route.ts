import { NextResponse } from 'next/server'
import { completeShopAuthorization } from '../../../../lib/server/shop-portal'

export const dynamic = 'force-dynamic'

function errorResponse (message: string, status = 400) {
  return NextResponse.json({ status: 'error', message }, { status, headers: { 'cache-control': 'no-store' } })
}

function cookieState (request: Request) { return request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith('alpha_shop_oauth_state='))?.slice('alpha_shop_oauth_state='.length) ?? '' }
function clearStateCookie (response: NextResponse) { response.headers.set('Set-Cookie', 'alpha_shop_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'); return response }

export async function GET (request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')?.trim() ?? ''
  const shopId = url.searchParams.get('shop_id')?.trim() ?? ''
  const state = url.searchParams.get('state')?.trim() || cookieState(request)

  if (!code || !state || !/^\d+$/.test(shopId)) return errorResponse('Shopee callback thiếu tham số hợp lệ')
  try {
    await completeShopAuthorization({ state, code, shopId, redirectUri: process.env.SHOPEE_REDIRECT_URI || new URL('/api/shopee/callback', request.url).toString() })
    return clearStateCookie(NextResponse.redirect(new URL('/connect/shops?connected=1', request.url)))
  } catch { return clearStateCookie(NextResponse.redirect(new URL('/connect/shops?connected=0&error=oauth_failed', request.url))) }
}
