import { NextResponse } from 'next/server'
import { contextError, requireShopContext } from '../../../../lib/server/shop-context'
import { readStoredPromotions } from '../../../../lib/server/promotion-store'

export const dynamic = 'force-dynamic'

export async function GET (request: Request) {
  try {
    const context = await requireShopContext(request, 'viewer')
    const status = new URL(request.url).searchParams.get('status') ?? undefined
    return NextResponse.json({ status: 'ok', connectionId: context.connectionId, rows: await readStoredPromotions(context.connectionId, status) }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const auth = contextError(error); return NextResponse.json({ status: 'error', code: auth.code }, { status: auth.status === 500 ? 502 : auth.status })
  }
}
