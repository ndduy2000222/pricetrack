import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function errorResponse (message: string, status = 400) {
  return NextResponse.json({ status: 'error', message }, { status, headers: { 'cache-control': 'no-store' } })
}

export async function GET (request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')?.trim() ?? ''
  const shopId = url.searchParams.get('shop_id')?.trim() ?? ''

  if (!code || !/^\d+$/.test(shopId)) {
    return errorResponse('Shopee callback cần code và shop_id hợp lệ')
  }

  const localHandoff = new URL('http://localhost:3210/callback')
  localHandoff.searchParams.set('code', code)
  localHandoff.searchParams.set('shop_id', shopId)
  return NextResponse.redirect(localHandoff)
}
