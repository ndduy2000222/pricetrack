'use client'

import { useEffect, useState } from 'react'
import { formatVnd, priceRows, type PriceRow } from '../lib/mock-data'

type Mode = 'Monitor' | 'Review' | 'Auto'

const statusLabel: Record<PriceRow['status'], string> = {
  within: 'Trong ngưỡng',
  review: 'Chờ duyệt',
  blocked: 'Không cập nhật'
}

export function PriceControlDashboard () {
  const [mode, setMode] = useState<Mode>('Monitor')
  const [query, setQuery] = useState('')
  const [showPaused, setShowPaused] = useState(false)
  const [rows, setRows] = useState(priceRows)
  const [dataSource, setDataSource] = useState<'mock' | 'live' | 'error'>('mock')
  const [lastSync, setLastSync] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const response = await fetch('/api/sku-prices', { cache: 'no-store' })
        const payload = await response.json()
        if (!active) return
        if (payload.status === 'live' && Array.isArray(payload.rows) && payload.rows.length > 0) {
          setRows(payload.rows.map((row: { id: string, sku: string, itemId: string, modelId: string, currentPrice: number, observedAt: string }, index: number) => ({
            id: row.id,
            sku: row.sku,
            title: `Shopee item ${row.itemId} · model ${row.modelId}`,
            author: 'Giá đọc từ Shopee Open API',
            competitor: '—',
            competitorPrice: row.currentPrice,
            currentPrice: row.currentPrice,
            proposedPrice: row.currentPrice,
            floorPrice: row.currentPrice,
            ceilingPrice: row.currentPrice,
            status: 'within' as const,
            updatedAt: new Date(row.observedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
            reason: `Live API · item ${row.itemId} · model ${row.modelId}`
          })))
          setDataSource('live')
          setLastSync(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }))
        } else if (payload.status === 'error') {
          setDataSource('error')
        }
      } catch {
        if (active) setDataSource('error')
      }
    }
    refresh()
    const timer = window.setInterval(refresh, 30_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  const filteredRows = rows.filter((row) => {
    const haystack = `${row.sku} ${row.title} ${row.competitor}`.toLowerCase()
    return haystack.includes(query.toLowerCase()) && (showPaused || row.status !== 'blocked')
  })

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark"><span className="book-mark">⌁</span><span>Alpha Books<br /><strong>Price Control</strong></span></div>
        <nav aria-label="Điều hướng chính">
          {['Tổng quan', 'Giá & cạnh tranh', 'Chờ duyệt', 'Cấu hình Auto', 'Worker & hệ thống', 'Lịch sử quyết định', 'Thiết lập'].map((item, index) => (
            <button className={`nav-item ${index === 0 ? 'active' : ''}`} key={item} type="button">
              <span className="nav-icon" aria-hidden="true">{['⌂', '◇', '✓', '▷', '≋', '↺', '⚙'][index]}</span>{item}
            </button>
          ))}
        </nav>
        <div className="sidebar-status"><span className="status-dot green" /> Hệ thống ổn định<span className="sidebar-time">Cập nhật lần cuối: 10:24 26/01</span></div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><h1>Alpha Books Price Control</h1><p className="mock-label">{dataSource === 'live' ? `LIVE API · Đồng bộ mỗi 30 giây${lastSync ? ` · ${lastSync}` : ''}` : dataSource === 'error' ? 'API ERROR · Đang hiển thị dữ liệu gần nhất' : 'DỮ LIỆU MÔ PHỎNG · Chưa kết nối Shopee'}</p></div>
          <div className="topbar-meta"><span><span className="status-dot green" /> Worker đang chạy</span><span>Lần quét gần nhất: 10:22 26/01/2025</span><span className="avatar">V</span><span>Vận hành Giá⌄</span></div>
        </header>

        <section className="mode-row" aria-label="Chế độ vận hành">
          <div className="mode-switch">
            {(['Monitor', 'Review', 'Auto'] as Mode[]).map((item) => <button className={mode === item ? 'selected' : ''} key={item} onClick={() => setMode(item)} type="button">{item === 'Monitor' ? '▣' : item === 'Review' ? '☑' : '▷'}&nbsp; {item}</button>)}
          </div>
          <p>Chế độ hiện tại: <strong>{mode}</strong> — {mode === 'Monitor' ? 'Theo dõi thị trường, cảnh báo chênh lệch, chưa tự động cập nhật giá.' : mode === 'Review' ? 'Tạo đề xuất để người vận hành duyệt từng thay đổi.' : 'Chỉ cập nhật SKU đã bật Auto và vượt qua toàn bộ kiểm tra an toàn.'}</p>
        </section>

        <section className="summary-grid" aria-label="Tổng quan vận hành">
          <SummaryCard icon="◉" title="Đang theo dõi" value={`${rows.length} SKU`} tone="green" rows={[['Nguồn dữ liệu', dataSource === 'live' ? 'Shopee API' : 'Mock'], ['Chu kỳ đọc', dataSource === 'live' ? '30 giây' : '—'], ['Trạng thái', dataSource === 'live' ? 'Live' : 'Chờ kết nối']]} />
          <SummaryCard icon="▣" title="Chờ duyệt" value="5 đề xuất" tone="amber" rows={[['Giảm giá (cạnh tranh mạnh)', '3'], ['Tăng giá (thị trường tăng)', '1'], ['Mở khóa cập nhật', '1']]} />
          <SummaryCard icon="⚙" title="Worker đang chạy" value="Đang chạy" tone="green" rows={[['Chu kỳ quét', '10 phút'], ['Lần quét gần nhất', '10:22 26/01'], ['Xử lý thành công (24h)', '37 / 40']]} />
        </section>

        <section className="table-panel">
          <div className="table-toolbar">
            <label className="search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên sách, SKU, tác giả..." aria-label="Tìm SKU" /></label>
            <select aria-label="Lọc trạng thái"><option>Tất cả trạng thái</option><option>Trong ngưỡng</option><option>Chờ duyệt</option><option>Không cập nhật</option></select>
            <select aria-label="Lọc danh mục"><option>Tất cả danh mục</option><option>Kinh doanh</option><option>Văn học</option><option>Kỹ năng</option></select>
            <button className="history-button" type="button">↺ &nbsp;Lịch sử quyết định</button>
          </div>
          <div className="filter-row"><label><input type="checkbox" checked={showPaused} onChange={(event) => setShowPaused(event.target.checked)} /> Hiện cả SKU bị chặn</label><span>{filteredRows.length} kết quả {dataSource === 'live' ? 'từ Shopee API' : 'mô phỏng'}</span></div>
          <div className="table-scroll"><table><thead><tr><th>#</th><th>SKU</th><th>Tên sách</th><th>Đối thủ (giá thấp nhất)</th><th>Giá hiện tại</th><th>Giá đề xuất</th><th>Sàn – Trần</th><th>Trạng thái</th><th>Cập nhật</th><th>Lý do không cập nhật</th></tr></thead><tbody>{filteredRows.map((row, index) => <PriceTableRow key={row.id} row={row} index={index} />)}</tbody></table></div>
          <div className="table-footer"><span>Hiển thị 1 – {filteredRows.length} trên 20 SKU</span><div className="pagination"><button type="button" disabled>‹</button><button className="current" type="button">1</button><button type="button">2</button><button type="button">›</button><select aria-label="Số dòng mỗi trang"><option>Số dòng: 10</option></select></div></div>
        </section>
      </section>
    </main>
  )
}

function SummaryCard ({ icon, title, value, tone, rows }: { icon: string, title: string, value: string, tone: 'green' | 'amber', rows: string[][] }) {
  return <article className="summary-card"><div className="summary-heading"><span className="summary-icon">{icon}</span><h2>{title}</h2><span className={`badge ${tone}`}>{tone === 'green' ? 'Đang hoạt động' : 'Cần xử lý'}</span></div><strong className="summary-value">{value}</strong><div className="summary-rows">{rows.map(([label, count]) => <div key={label}><span>{label}</span><b>{count}</b></div>)}</div></article>
}

function PriceTableRow ({ row, index }: { row: PriceRow, index: number }) {
  return <tr><td>{index + 1}</td><td className="sku">{row.sku}</td><td><div className="book-title"><span className={`cover cover-${index % 5}`} aria-hidden="true" /> <span><strong>{row.title}</strong><small>{row.author}</small></span></div></td><td>{row.competitor}: {formatVnd(row.competitorPrice)}</td><td>{formatVnd(row.currentPrice)}</td><td className="proposal">{formatVnd(row.proposedPrice)}</td><td>{formatVnd(row.floorPrice)} – {formatVnd(row.ceilingPrice)}</td><td><span className={`status-pill ${row.status}`}>{statusLabel[row.status]}</span></td><td>{row.updatedAt}</td><td className={row.status === 'blocked' ? 'reason blocked-reason' : 'reason'}>{row.reason}</td></tr>
}
