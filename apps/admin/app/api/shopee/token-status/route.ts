import { NextResponse } from 'next/server'
import { createClientForShop } from '../../../../lib/server/catalog'
import { tokenStoreStatus } from '../../../../lib/server/shopee-token-store'
import { contextError, requireShopContext } from '../../../../lib/server/shop-context'

export const dynamic = 'force-dynamic'

export async function GET (request: Request) {
  try {
    const context = await requireShopContext(request, 'viewer')
    const { client, tokenSource } = await createClientForShop(context.shopeeShopId)
    const tokens = client.getTokens()
    return NextResponse.json({ status: client.configured ? 'configured' : 'not_configured', tokenSource, tokenStore: tokenStoreStatus(), hasRefreshToken: Boolean(tokens.refreshToken), accessTokenExpiresAt: tokens.accessTokenExpiresAt }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const auth = contextError(error); if (auth.status !== 500) return NextResponse.json({ status: 'error', code: auth.code }, { status: auth.status })
    console.error('shopee_token_status_failed', error instanceof Error ? error.message : 'unknown_error')
    return NextResponse.json({ status: 'error', message: 'Không kiểm tra được trạng thái token' }, { status: 502, headers: { 'cache-control': 'no-store' } })
  }
}
