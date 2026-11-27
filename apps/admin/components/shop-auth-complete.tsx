'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export function ShopAuthComplete () {
  const [message, setMessage] = useState('Đang xác nhận link đăng nhập…')
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = params.get('access_token')
    const expiresIn = Number(params.get('expires_in'))
    window.history.replaceState(null, '', window.location.pathname)
    if (!accessToken) { queueMicrotask(() => setMessage('Link không hợp lệ hoặc đã hết hạn. Hãy yêu cầu link mới.')); return }
    fetch('/api/shop-connections/admin-session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'complete_link', accessToken, expiresIn }) })
      .then(async (response) => { if (!response.ok) throw new Error('invalid_link'); window.location.replace('/connect/shops') })
      .catch(() => setMessage('Không thể xác nhận link. Hãy yêu cầu link mới.'))
  }, [])
  return <main className="portal-page"><div className="portal-shell"><div className="portal-card invite-card"><h1>Kết nối shop</h1><p>{message}</p><Link className="button secondary" href="/connect/shops">Về trang đăng nhập</Link></div></div></main>
}
