'use client'

import { useEffect, useState } from 'react'

type Shop = { id: string, name: string | null, shop_id: string }
type Promotion = { discountId: string, name: string | null, status: string | null, startAt: string | null, endAt: string | null, itemCount: number | null, modelCount: number | null, observedAt: string }

export function PromotionManagement () {
  const [shops, setShops] = useState<Shop[]>([])
  const [connectionId, setConnectionId] = useState('')
  const [rows, setRows] = useState<Promotion[]>([])
  const [message, setMessage] = useState('Chọn shop để đọc dữ liệu đã đồng bộ.')
  const [loading, setLoading] = useState(false)

  const load = async (id: string) => {
    if (!id) return
    setLoading(true)
    try {
      const response = await fetch(`/api/shopee/promotions?connection_id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      const payload = await response.json()
      setRows(Array.isArray(payload.rows) ? payload.rows : [])
      setMessage(response.ok ? `Đã đọc ${payload.rows?.length ?? 0} chương trình đã lưu.` : payload.code ?? 'Không đọc được promotion.')
    } catch {
      setMessage('Không thể kết nối máy chủ.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetch('/api/shop-connections', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => setShops(Array.isArray(payload.connections) ? payload.connections : []))
      .catch(() => setMessage('Không đọc được danh sách shop.'))
  }, [])

  const handleShopChange = (id: string) => {
    setConnectionId(id)
    setRows([])
    void load(id)
  }

  const sync = async () => {
    if (!connectionId) return
    setLoading(true)
    try {
      const response = await fetch(`/api/shopee/discounts/sync?connection_id=${encodeURIComponent(connectionId)}`, { method: 'POST' })
      const payload = await response.json()
      setMessage(payload.status === 'ok' ? `Đã lưu ${payload.saved} chương trình.` : payload.code ?? 'Đồng bộ thất bại.')
      await load(connectionId)
    } catch {
      setMessage('Không thể kết nối máy chủ.')
      setLoading(false)
    }
  }

  return <main className="promotion-page">
    <div className="promotion-header">
      <div>
        <p className="promotion-eyebrow">VẬN HÀNH GIÁ</p>
        <h1>Chương trình khuyến mãi</h1>
        <p className="promotion-message" role="status">{message}</p>
      </div>
      <div className="promotion-controls">
        <label className="promotion-select"><span>Shop đang xem</span><select value={connectionId} onChange={(event) => handleShopChange(event.target.value)} aria-label="Chọn shop để xem promotion"><option value="">Chọn shop…</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name || shop.shop_id}</option>)}</select></label>
        <button className="promotion-button promotion-button-primary" disabled={!connectionId || loading} onClick={sync} type="button">{loading ? 'Đang tải…' : 'Đồng bộ promotion'}</button>
      </div>
    </div>
    <section className="promotion-table-card" aria-label="Danh sách chương trình khuyến mãi">
      <div className="promotion-table-meta"><span>Promotion đã lưu</span><span>{rows.length} chương trình</span></div>
      <div className="promotion-table-scroll"><table><thead><tr>{['Promotion ID', 'Tên chương trình', 'Trạng thái', 'Bắt đầu', 'Kết thúc', 'Sản phẩm', 'SKU', 'Quan sát lúc'].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.discountId}>{[row.discountId, row.name || '—', row.status || '—', row.startAt ? new Date(row.startAt).toLocaleString('vi-VN') : '—', row.endAt ? new Date(row.endAt).toLocaleString('vi-VN') : '—', row.itemCount ?? '—', row.modelCount ?? '—', row.observedAt ? new Date(row.observedAt).toLocaleString('vi-VN') : '—'].map((value, index) => <td key={`${row.discountId}-${index}`}>{value}</td>)}</tr>) : <tr><td className="promotion-empty" colSpan={8}>{connectionId ? 'Chưa có promotion đã lưu cho shop này.' : 'Chọn shop để đọc các promotion đã lưu.'}</td></tr>}</tbody></table></div>
    </section>
  </main>
}
