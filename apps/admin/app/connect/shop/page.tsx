import { Suspense } from 'react'
import { ShopInviteClient } from '../../../components/shop-invite-client'

export const dynamic = 'force-dynamic'

export default function ShopInvitePage () {
  return <Suspense fallback={<main className="portal-page"><div className="portal-card">Đang kiểm tra lời mời…</div></main>}><ShopInviteClient /></Suspense>
}
