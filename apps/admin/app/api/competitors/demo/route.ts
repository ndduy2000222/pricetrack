import { NextResponse } from 'next/server'
import { demoCompetitorEvidence } from '../../../../lib/server/demo-competitor-evidence'

export const dynamic = 'force-dynamic'

export async function GET () {
  return NextResponse.json({
    status: 'demo_snapshot',
    source: 'public_web_snapshot',
    sourceName: 'Shopee public product/shop pages · no Affiliate API',
    rows: demoCompetitorEvidence,
    verifiedCount: demoCompetitorEvidence.filter((row) => row.verifiedPreVoucher && row.available).length,
    totalCount: demoCompetitorEvidence.length,
    note: 'Snapshot dùng để trình diễn link và giá; chỉ dòng verified mới đủ điều kiện làm đầu vào so sánh.'
  }, { headers: { 'cache-control': 'no-store' } })
}
