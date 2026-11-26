import { NextResponse } from 'next/server'
import { createClientFromEnvironment } from '../../../../lib/server/catalog'
import { tokenStoreStatus } from '../../../../lib/server/shopee-token-store'

export const dynamic = 'force-dynamic'

export async function GET () {
  try {
    const { client, tokenSource } = await createClientFromEnvironment()
    const tokens = client.getTokens()
    return NextResponse.json({ status: client.configured ? 'configured' : 'not_configured', tokenSource, tokenStore: tokenStoreStatus(), hasRefreshToken: Boolean(tokens.refreshToken), accessTokenExpiresAt: tokens.accessTokenExpiresAt }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('shopee_token_status_failed', error instanceof Error ? error.message : 'unknown_error')
    return NextResponse.json({ status: 'error', message: 'Không kiểm tra được trạng thái token' }, { status: 502, headers: { 'cache-control': 'no-store' } })
  }
}
