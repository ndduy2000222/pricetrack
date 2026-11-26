'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export function ShopInviteClient () {
  const params = useSearchParams(); const token = params.get('token') ?? ''
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading'); const [message, setMessage] = useState('')
  useEffect(() => { const timer = window.setTimeout(() => { if (!token) { setState('error'); setMessage('Liên kết kết nối shop bị thiếu mã mời.'); return }; fetch(`/api/shop-connections/invites/${encodeURIComponent(token)}`, { cache: 'no-store' }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.message); setState('ready'); setMessage(`Lời mời còn hiệu lực đến ${new Date(body.expiresAt).toLocaleString('vi-VN')}.`) }).catch((error) => { setState('error'); setMessage(error instanceof Error ? error.message : 'Không thể kiểm tra lời mời.') }) }, 0); return () => window.clearTimeout(timer) }, [token])
  const connect = async () => { setState('loading'); try { const response = await fetch(`/api/shop-connections/invites/${encodeURIComponent(token)}`, { method: 'POST' }); const body = await response.json(); if (!response.ok) throw new Error(body.message); window.location.href = body.authorizationUrl } catch (error) { setState('error'); setMessage(error instanceof Error ? error.message : 'Không thể bắt đầu kết nối Shopee.') } }
  return <main className="portal-page"><div className="portal-card invite-card"><div className="brand-mark">⌁</div><p className="eyebrow">ALPHA BOOKS · KẾT NỐI SHOP</p><h1>Kết nối gian hàng Shopee</h1><p>Cho phép Price Control đọc danh mục, biến thể, ảnh, giá và tồn kho của shop. Ứng dụng chỉ đọc dữ liệu và không tự thay đổi giá.</p>{message ? <div className={`portal-alert ${state === 'error' ? 'error' : ''}`}>{message}</div> : null}<button className="button primary full-width" type="button" disabled={state === 'loading' || state === 'error'} onClick={connect}>{state === 'loading' ? 'Đang kiểm tra…' : 'Tiếp tục với Shopee'}</button><small className="portal-muted">Bạn sẽ được chuyển sang trang cấp quyền chính thức của Shopee.</small></div></main>
}
