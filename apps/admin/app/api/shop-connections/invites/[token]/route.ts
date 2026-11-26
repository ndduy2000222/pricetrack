import { NextResponse } from 'next/server'
import { readInvite, startShopAuthorization } from '../../../../../lib/server/shop-portal'

export const dynamic = 'force-dynamic'

function redirectUri (request: Request) { return process.env.SHOPEE_REDIRECT_URI || new URL('/api/shopee/callback', request.url).toString() }

export async function GET (_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  try { const invite = await readInvite(token); return NextResponse.json(invite ? { status: 'ok', expiresAt: invite.expires_at } : { status: 'invalid', message: 'Liên kết đã hết hạn hoặc đã được sử dụng' }, { status: invite ? 200 : 404, headers: { 'cache-control': 'no-store' } }) } catch { return NextResponse.json({ status: 'error', message: 'Không thể kiểm tra lời mời' }, { status: 500 }) }
}

export async function POST (request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  try { const result = await startShopAuthorization(token, redirectUri(request)); const response = NextResponse.json({ status: 'ok', authorizationUrl: result.authorizationUrl }, { headers: { 'cache-control': 'no-store' } }); response.headers.set('Set-Cookie', `alpha_shop_oauth_state=${result.state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`); return response } catch (error) { return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : 'Không thể bắt đầu kết nối Shopee' }, { status: 400 }) }
}
