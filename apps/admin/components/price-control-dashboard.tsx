/* eslint-disable @next/next/no-img-element */
'use client'

import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { formatVnd, type PriceRow } from '../lib/mock-data'

type Mode = 'monitor' | 'review'
type StatusFilter = 'all' | PriceRow['status']
type SortKey = 'title' | 'currentPrice' | 'competitorPrice' | 'reductionVnd'
const PAGE_SIZE = 8

const navItems = [
  { label: 'Tổng quan', icon: 'grid' }, { label: 'Giá & cạnh tranh', icon: 'chart' }, { label: 'Kết nối shop', icon: 'store' },
  { label: 'Chờ duyệt', icon: 'check' }, { label: 'Danh mục sản phẩm', icon: 'book' },
  { label: 'Lịch sử quyết định', icon: 'history' }, { label: 'Thiết lập', icon: 'settings' }
] as const

const statusMeta: Record<PriceRow['status'], { label: string, tone: string }> = {
  within: { label: 'Theo dõi', tone: 'success' }, review: { label: 'Chờ duyệt', tone: 'warning' }, blocked: { label: 'Bị chặn', tone: 'danger' }, pending: { label: 'Chưa đối chứng', tone: 'warning' }
}

export function PriceControlDashboard () {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('monitor')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('reductionVnd')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<PriceRow[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedRow, setSelectedRow] = useState<PriceRow | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [dataSource, setDataSource] = useState<'loading' | 'live' | 'catalog-live' | 'review-live' | 'error'>('loading')
  const [catalogOrigin, setCatalogOrigin] = useState<'stored' | 'live_sync' | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const response = await fetch('/api/price-review?source=stored', { cache: 'no-store' })
        const payload = await response.json()
        if (!active) return
        if (payload.status === 'live' && Array.isArray(payload.rows)) {
          setRows(payload.rows.map(normalizeReviewRow)); setDataSource('review-live'); setCatalogOrigin(payload.catalogSource === 'stored' ? 'stored' : 'live_sync')
          setLastSync(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }))
          return
        }
        const catalogFallback = await fetch('/api/catalog?all=true&source=stored', { cache: 'no-store' }); const catalogPayload = await catalogFallback.json()
        if (catalogPayload.status === 'live' && Array.isArray(catalogPayload.rows)) {
          setRows(catalogPayload.rows.map(normalizeCatalogRow)); setDataSource('catalog-live'); setCatalogOrigin(catalogPayload.catalogSource === 'stored' ? 'stored' : 'live_sync')
          setLastSync(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }))
        } else {
          const fallback = await fetch('/api/sku-prices', { cache: 'no-store' }); const fallbackPayload = await fallback.json()
          if (fallbackPayload.status === 'live' && Array.isArray(fallbackPayload.rows)) {
            setRows(fallbackPayload.rows.map(normalizeSkuRow)); setDataSource('live')
            setLastSync(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }))
          } else {
            setDataSource((current) => current === 'loading' ? 'error' : current)
          }
        }
      } catch { if (active) setDataSource((current) => current === 'loading' ? 'error' : current) }
    }
    refresh(); const timer = window.setInterval(refresh, 30_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return rows.filter((row) => statusFilter === 'all' || row.status === statusFilter)
      .filter((row) => mode === 'monitor' || row.status === 'review')
      .filter((row) => !normalizedQuery || `${row.sku} ${row.title} ${row.author} ${row.competitor}`.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        const aValue = sortValue(a, sortKey); const bValue = sortValue(b, sortKey)
        const result = typeof aValue === 'string' && typeof bValue === 'string' ? aValue.localeCompare(bValue, 'vi') : Number(aValue) - Number(bValue)
        return sortDirection === 'asc' ? result : -result
      })
  }, [mode, query, rows, sortDirection, sortKey, statusFilter])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const visibleRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const reviewCount = rows.filter((row) => row.status === 'review').length
  const blockedCount = rows.filter((row) => row.status === 'blocked').length
  const comparableRows = rows.filter((row) => row.currentPrice !== null && row.competitorPrice !== null && row.priceDifference !== null)
  const averageGap = comparableRows.length ? Math.round(comparableRows.reduce((sum, row) => sum + (row.priceDifference as number), 0) / comparableRows.length) : null
  const isLive = dataSource === 'review-live' || dataSource === 'catalog-live' || dataSource === 'live'
  const sourceLabel = dataSource === 'review-live' ? `LIVE · ${catalogOrigin === 'stored' ? 'catalog đã lưu + đối chiếu' : 'Shopee + đối chiếu'}` : dataSource === 'catalog-live' ? `LIVE · ${catalogOrigin === 'stored' ? 'catalog đã lưu' : 'Shopee catalog'}` : dataSource === 'live' ? 'LIVE · Shopee Open API' : dataSource === 'error' ? 'Chưa có dữ liệu live' : 'Đang tải dữ liệu'

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDirection('desc') }
  }
  const toggleSelected = (id: string) => setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const selectAllVisible = () => setSelectedIds((current) => { const next = new Set(current); const allSelected = visibleRows.every((row) => next.has(row.id)); visibleRows.forEach((row) => allSelected ? next.delete(row.id) : next.add(row.id)); return next })
  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: PriceRow) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedRow(row) } }

  return <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : ''}`}>
    <button className="sidebar-overlay" aria-label="Đóng menu" onClick={() => setSidebarOpen(false)} type="button" />
    <aside className="sidebar">
      <div className="brand-lockup"><span className="brand-mark"><Icon name="book" /></span><span><strong>Alpha Books</strong><small>Price Control</small></span><button className="sidebar-close" aria-label="Đóng menu" onClick={() => setSidebarOpen(false)} type="button"><Icon name="close" /></button></div>
      <div className="workspace-switch"><span className="workspace-avatar">A</span><span><b>Alpha Books</b><small>Shop workspace</small></span><Icon name="chevronDown" /></div>
      <nav aria-label="Điều hướng chính"><p className="nav-caption">WORKSPACE</p>{navItems.map((item, index) => <button className={`nav-item ${index === 0 ? 'active' : ''}`} key={item.label} type="button" onClick={() => { setSidebarOpen(false); if (item.label === 'Kết nối shop') router.push('/connect/shops') }}><Icon name={item.icon} /><span>{item.label}</span>{item.label === 'Chờ duyệt' && reviewCount > 0 ? <em>{reviewCount}</em> : null}</button>)}</nav>
      <div className="sidebar-footer"><div className="system-status"><span className="status-dot" /><span><b>Hệ thống ổn định</b><small>Đồng bộ mỗi 30 giây</small></span></div><div className="sidebar-user"><span className="user-avatar">V</span><span><b>Vận hành Giá</b><small>Quản trị viên</small></span><Icon name="more" /></div></div>
    </aside>

    <main className="workspace">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu" aria-label="Mở menu" onClick={() => setSidebarOpen(true)} type="button"><Icon name="menu" /></button><div className="breadcrumbs"><span>Workspace</span><Icon name="chevronRight" /><b>Price Control</b></div></div><div className="topbar-actions"><button className="icon-button" aria-label="Thông báo" type="button"><Icon name="bell" /><span className="notification-dot" /></button><span className="topbar-divider" /><span className="topbar-date">23 Tháng 11, 2026</span><span className="user-avatar small">V</span></div></header>
      <div className="page-content">
        <section className="page-heading"><div><div className="eyebrow"><span className={`live-dot ${isLive ? '' : 'muted'}`} /> {sourceLabel}{lastSync ? ` · ${lastSync}` : ''}</div><h1>Giá & cạnh tranh</h1><p>Theo dõi giá SKU, so sánh đối thủ và duyệt đề xuất điều chỉnh cho shop Alpha Books.</p></div><div className="heading-actions"><a className="button secondary" href="/api/catalog?format=xlsx&all=true&source=stored"><Icon name="download" /> Xuất catalog</a><button className="button primary" type="button" onClick={() => window.location.reload()}><Icon name="refresh" /> Làm mới</button></div></section>
        <section className="summary-grid" aria-label="Tổng quan vận hành"><SummaryCard icon="book" label="Đang theo dõi" value={`${rows.length}`} unit="SKU" note={isLive ? 'Dữ liệu đang đọc trực tiếp' : 'Chưa có dữ liệu live'} tone="blue" trend={dataSource === 'loading' ? 'Đang tải' : isLive ? 'Live' : 'Chưa có dữ liệu'} /><SummaryCard icon="chart" label="Chênh lệch trung bình" value={averageGap === null ? '—' : formatCompact(Math.abs(averageGap))} unit={averageGap === null ? '' : '₫'} note={comparableRows.length ? `Tính trên ${comparableRows.length} SKU đủ hai giá` : 'Chưa có đối chứng'} tone="orange" trend={averageGap === null ? 'Chưa có mẫu' : averageGap > 0 ? 'Cao hơn' : 'Thấp hơn'} /><SummaryCard icon="clock" label="Chờ duyệt" value={`${reviewCount}`} unit="đề xuất" note="Cần người vận hành kiểm tra" tone="purple" trend="Xem ngay" /><SummaryCard icon="shield" label="Đang bị chặn" value={`${blockedCount}`} unit="SKU" note="Đang bảo vệ giá sàn" tone="green" trend="An toàn" /></section>
        <section className="table-card" aria-label="Bảng kiểm soát giá">
          <div className="table-card-heading"><div><h2>Danh sách SKU</h2><p>{filteredRows.length} sản phẩm trong tầm nhìn hiện tại</p></div><div className="view-switch"><button className={mode === 'monitor' ? 'selected' : ''} onClick={() => { setMode('monitor'); setPage(1) }} type="button"><Icon name="list" /> Tất cả</button><button className={mode === 'review' ? 'selected' : ''} onClick={() => { setMode('review'); setPage(1) }} type="button"><Icon name="check" /> Chờ duyệt <span>{reviewCount}</span></button></div></div>
          <div className="table-toolbar"><label className="search-field"><Icon name="search" /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Tìm theo tên sách, SKU hoặc tác giả..." aria-label="Tìm kiếm SKU" /></label><label className="select-field"><Icon name="filter" /><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as StatusFilter); setPage(1) }} aria-label="Lọc trạng thái"><option value="all">Tất cả trạng thái</option><option value="within">Theo dõi</option><option value="review">Chờ duyệt</option><option value="blocked">Bị chặn</option><option value="pending">Chưa đối chứng</option></select><Icon name="chevronDown" /></label><label className="select-field sort-field"><select value={sortKey} onChange={(event) => toggleSort(event.target.value as SortKey)} aria-label="Sắp xếp"><option value="reductionVnd">Mức giảm</option><option value="currentPrice">Giá shop</option><option value="competitorPrice">Giá đối thủ</option><option value="title">Tên sách</option></select><Icon name="chevronDown" /></label><a className="button secondary compact" href="/api/price-review?format=xlsx&source=stored"><Icon name="download" /> Export</a></div>
          {selectedIds.size > 0 ? <div className="selection-bar"><span>Đã chọn <b>{selectedIds.size}</b> SKU</span><button type="button" onClick={() => setSelectedIds(new Set())}>Bỏ chọn</button><span className="selection-note">Chưa có thao tác cập nhật giá hàng loạt</span></div> : null}
          <div className="table-scroll"><table><thead><tr><th className="check-cell"><input type="checkbox" checked={visibleRows.length > 0 && visibleRows.every((row) => selectedIds.has(row.id))} onChange={selectAllVisible} aria-label="Chọn tất cả SKU đang hiển thị" /></th><th>SKU / SẢN PHẨM</th><th><button className="th-sort" onClick={() => toggleSort('competitorPrice')} type="button">GIÁ ĐỐI THỦ <Icon name="sort" /></button></th><th><button className="th-sort" onClick={() => toggleSort('currentPrice')} type="button">GIÁ SHOP <Icon name="sort" /></button></th><th>CHÊNH LỆCH</th><th><button className="th-sort" onClick={() => toggleSort('reductionVnd')} type="button">ĐỀ XUẤT <Icon name="sort" /></button></th><th>ĐỘ TIN CẬY</th><th>TRẠNG THÁI</th><th className="action-cell" /></tr></thead><tbody>{visibleRows.length ? visibleRows.map((row, index) => <PriceTableRow key={row.id} row={row} index={(page - 1) * PAGE_SIZE + index} selected={selectedIds.has(row.id)} onSelect={() => toggleSelected(row.id)} onOpen={() => setSelectedRow(row)} onKeyDown={(event) => onRowKeyDown(event, row)} />) : <tr><td className="empty-state" colSpan={9}>Không có SKU phù hợp với bộ lọc hiện tại.</td></tr>}</tbody></table></div>
          <div className="table-footer"><span>Hiển thị {filteredRows.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, filteredRows.length)} trên {filteredRows.length}</span><div className="pagination"><button type="button" aria-label="Trang trước" disabled={page === 1} onClick={() => setPage((current) => current - 1)}><Icon name="chevronLeft" /></button><span>Trang <b>{page}</b> / {pageCount}</span><button type="button" aria-label="Trang sau" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)}><Icon name="chevronRight" /></button></div></div>
        </section>
        <p className="guardrail-note"><Icon name="shield" /> Chế độ hiện tại chỉ đọc dữ liệu và tạo đề xuất. Mọi thay đổi giá cần được người vận hành duyệt.</p>
      </div>
    </main>
    {selectedRow ? <SkuDetails row={selectedRow} onClose={() => setSelectedRow(null)} /> : null}
  </div>
}

function SummaryCard ({ icon, label, value, unit, note, tone, trend }: { icon: string, label: string, value: string, unit: string, note: string, tone: string, trend: string }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon name={icon} /></div><div className="metric-copy"><span>{label}</span><strong>{value}<small>{unit}</small></strong><p>{note}</p></div><span className={`metric-trend ${tone}`}>{trend}</span></article>
}

function PriceTableRow ({ row, index, selected, onSelect, onOpen, onKeyDown }: { row: PriceRow, index: number, selected: boolean, onSelect: () => void, onOpen: () => void, onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => void }) {
  const difference = row.priceDifference ?? null
  const reduction = row.reductionVnd ?? null
  const meta = statusMeta[row.status]
  return <tr className={selected ? 'selected-row' : ''} onClick={onOpen} onKeyDown={onKeyDown} tabIndex={0}><td className="check-cell" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Chọn ${row.sku}`} /></td><td><div className="product-cell"><ProductImage src={row.imageUrl} alt={row.title} source={row.imageSource} className={`cover-${index % 5}`} /><span><b>{row.sku}</b><strong>{row.title}</strong><small>{row.modelName || row.author || 'Chưa có metadata'}</small></span></div></td><td><div className="price-cell"><b>{formatVnd(row.competitorPrice)}</b><small>{row.competitor ? `${row.competitor}${row.competitorVariant ? ` · ${row.competitorVariant}` : ''}` : 'Chưa có dữ liệu đối thủ'}</small></div></td><td><b className="own-price">{formatVnd(row.currentPrice)}</b></td><td><span className={difference === null ? 'difference' : difference > 0 ? 'difference negative' : 'difference positive'}>{difference === null ? '—' : `${difference > 0 ? '+' : ''}${formatVnd(difference)}`}</span></td><td><div className="proposal-cell"><b>{formatVnd(row.proposedPrice)}</b><small>{reduction === null ? 'Chưa đủ dữ liệu' : reduction > 0 ? `Giảm ${formatVnd(reduction)}` : 'Giữ giá hiện tại'}</small></div></td><td><div className="confidence"><span className="confidence-track"><i style={{ width: `${Math.max(0, Math.min(100, (row.confidence ?? 0) * 100))}%` }} /></span><b>{row.confidence == null ? '—' : `${Math.round(row.confidence * 100)}%`}</b></div></td><td><span className={`status-pill ${meta.tone}`}><i />{meta.label}</span></td><td className="action-cell"><button className="row-action" aria-label={`Mở chi tiết ${row.sku}`} onClick={(event) => { event.stopPropagation(); onOpen() }} type="button"><Icon name="chevronRight" /></button></td></tr>
}

function SkuDetails ({ row, onClose }: { row: PriceRow, onClose: () => void }) {
  const difference = row.priceDifference ?? null
  const reduction = row.reductionVnd ?? null
  const ownObservedAt = formatObservedAt(row.ownObservedAt || row.updatedAt)
  const competitorObservedAt = formatObservedAt(row.competitorObservedAt)
  return <div className="details-backdrop" onClick={onClose}><aside className="details-panel" onClick={(event) => event.stopPropagation()}><div className="details-header"><div><span className="eyebrow">CHI TIẾT SKU</span><h2>{row.sku}</h2></div><button className="icon-button" onClick={onClose} aria-label="Đóng chi tiết" type="button"><Icon name="close" /></button></div><div className="details-product"><ProductImage src={row.imageUrl} alt={row.title} source={row.imageSource} className="cover-2" /><div><h3>{row.title}</h3><p>{row.modelName || row.author || 'Chưa có tác giả hoặc tên biến thể'}</p></div></div><div className="details-status"><span className={`status-pill ${statusMeta[row.status].tone}`}><i />{statusMeta[row.status].label}</span><span>Shop cập nhật {ownObservedAt}</span></div><div className="detail-price-grid"><div><span>Giá shop</span><b>{formatVnd(row.currentPrice)}</b></div><div><span>Đối thủ thấp nhất</span><b>{formatVnd(row.competitorPrice)}</b><small>{row.competitor ? `${row.competitor}${row.competitorVariant ? ` · ${row.competitorVariant}` : ''}` : 'Chưa có dữ liệu đối thủ'}</small></div><div><span>Giá mục tiêu</span><b className="accent-text">{formatVnd(row.proposedPrice)}</b></div><div><span>Giá sàn</span><b>{formatVnd(row.floorPrice)}</b></div></div><div className="details-section"><h4>Phân tích đề xuất</h4><div className="detail-line"><span>Chênh lệch hiện tại</span><b className={difference === null ? '' : difference > 0 ? 'negative-text' : 'positive-text'}>{difference === null ? '—' : `${difference > 0 ? '+' : ''}${formatVnd(difference)}`}</b></div><div className="detail-line"><span>Mức giảm đề xuất</span><b>{reduction === null ? 'Chưa đủ dữ liệu' : reduction > 0 ? formatVnd(reduction) : 'Giữ giá hiện tại'}</b></div><div className="detail-line"><span>Lợi nhuận dự kiến</span><b>{row.expectedProfit == null ? 'Chưa đủ dữ liệu' : formatVnd(row.expectedProfit)}</b></div><div className="detail-line"><span>Độ tin cậy ghép</span><b>{row.confidence == null ? 'Chưa xác định' : `${Math.round(row.confidence * 100)}%`}</b></div></div><div className="details-section"><h4>Dữ liệu tham chiếu</h4><div className="detail-line"><span>Nguồn đối thủ</span><b>{row.competitorSourceName && row.competitorSourceName !== 'none' ? row.competitorSourceName : 'Chưa cấu hình'}</b></div><div className="detail-line"><span>Cơ sở giá</span><b>{row.competitorPriceBasis || 'Chưa có giá đối chứng'}</b></div><div className="detail-line"><span>Quan sát đối thủ</span><b>{competitorObservedAt}</b></div><div className="detail-line"><span>Ghép sản phẩm</span><b>{row.confidenceReason || 'Chưa có kết quả ghép'}</b></div></div><div className="details-section"><h4>Metadata shop</h4><div className="detail-line"><span>ISBN / EAN</span><b>{row.isbn || row.ean || 'Chưa có'}</b></div><div className="detail-line"><span>Quy cách</span><b>{row.competitorVariant || row.modelName || 'Chưa có'}</b></div><div className="detail-line"><span>Tồn kho</span><b>{row.stock == null ? 'Chưa có' : row.stock}</b></div></div><div className="details-section"><h4>Lý do</h4><p className="reason-box">{row.reason || 'Chưa có ghi chú phân tích.'}</p></div>{row.evidenceUrl ? <a className="button primary full-width" href={row.evidenceUrl} target="_blank" rel="noreferrer"><Icon name="external" /> Mở link đối chứng</a> : <div className="missing-evidence"><Icon name="info" /> Chưa có link đối chứng được phê duyệt.</div>}</aside></div>
}

function normalizeReviewRow (row: { itemId: string, modelId: string, sku: string | null, name: string | null, modelName: string | null, isbn: string | null, ean: string | null, author: string | null, publisher: string | null, edition: string | null, coverType: string | null, volumeOrCombo: string | null, stock: number | null, productUrl: string, imageUrl: string | null, imageId: string | null, imageSource: 'model' | 'product' | null, ownObservedAt: string, ownPrice: number | null, competitorPrice: number | null, competitorShop: string | null, competitorName: string | null, competitorVariant: string | null, competitorPriceBasis: string | null, competitorSource: string, competitorSourceName: string, targetPrice: number | null, floorPrice: number | null, status: string, competitorObservedAt: string | null, reason: string, confidence: number | null, confidenceReason: string, priceDifference: number | null, reductionVnd: number | null, reductionPercent: number | null, expectedProfit: number | null, competitorUrl: string | null }): PriceRow {
  return { id: `${row.itemId}:${row.modelId}`, sku: row.sku || `${row.itemId}:${row.modelId}`, title: row.name || `Shopee item ${row.itemId} · model ${row.modelId}`, author: row.author || '', competitor: row.competitorShop || '', competitorPrice: row.competitorPrice, currentPrice: row.ownPrice, proposedPrice: row.targetPrice, floorPrice: row.floorPrice, ceilingPrice: null, status: row.status === 'proposal' ? 'review' : row.status === 'blocked' ? 'blocked' : 'within', updatedAt: formatObservedAt(row.ownObservedAt), reason: `${row.reason}${row.confidence !== null ? ` · Tin cậy ${(row.confidence * 100).toFixed(0)}%` : ''}`, priceDifference: row.priceDifference, reductionVnd: row.reductionVnd, reductionPercent: row.reductionPercent, confidence: row.confidence, expectedProfit: row.expectedProfit, evidenceUrl: row.competitorUrl, productUrl: row.productUrl, imageUrl: row.imageUrl, imageId: row.imageId, imageSource: row.imageSource, ownObservedAt: row.ownObservedAt, competitorObservedAt: row.competitorObservedAt, competitorPriceBasis: row.competitorPriceBasis, competitorVariant: row.competitorVariant || row.volumeOrCombo || row.coverType, confidenceReason: row.confidenceReason, competitorSource: row.competitorSource, competitorSourceName: row.competitorSourceName, modelName: row.modelName, isbn: row.isbn, ean: row.ean, stock: row.stock }
}

function normalizeCatalogRow (row: { itemId: string, modelId: string, sku: string | null, name: string | null, modelName: string | null, author: string | null, isbn: string | null, ean: string | null, stock: number | null, imageUrl: string | null, imageId: string | null, imageSource: 'model' | 'product' | null, currentPrice: number | null, productUrl: string, observedAt: string }): PriceRow {
  return { id: `${row.itemId}:${row.modelId}`, sku: row.sku || `${row.itemId}:${row.modelId}`, title: row.name || `Shopee item ${row.itemId}`, author: row.author || '', competitor: '', competitorPrice: null, currentPrice: row.currentPrice, proposedPrice: null, floorPrice: null, ceilingPrice: null, status: 'pending', updatedAt: formatObservedAt(row.observedAt), reason: 'Bảng đối thủ chưa sẵn sàng, đang hiển thị catalog shop', imageUrl: row.imageUrl, imageId: row.imageId, imageSource: row.imageSource, ownObservedAt: row.observedAt, competitorSource: 'none', competitorSourceName: 'none', modelName: row.modelName, isbn: row.isbn, ean: row.ean, stock: row.stock, productUrl: row.productUrl }
}

function normalizeSkuRow (row: { id: string, sku: string, itemId: string, modelId: string, name: string | null, modelName: string | null, imageUrl: string | null, imageId: string | null, imageSource: 'model' | 'product' | null, currentPrice: number, originalPrice: number, observedAt: string }): PriceRow {
  return { id: row.id, sku: row.sku, title: row.name || `Shopee item ${row.itemId}`, author: row.modelName || '', competitor: '', competitorPrice: null, currentPrice: row.currentPrice, proposedPrice: null, floorPrice: null, ceilingPrice: null, status: 'pending', updatedAt: formatObservedAt(row.observedAt), reason: 'Chưa có dữ liệu đối thủ để so sánh', imageUrl: row.imageUrl, imageId: row.imageId, imageSource: row.imageSource, ownObservedAt: row.observedAt, competitorSource: 'none', competitorSourceName: 'none' }
}

function sortValue (row: PriceRow, key: SortKey) { if (key === 'title') return row.title; if (key === 'currentPrice') return row.currentPrice ?? -1; if (key === 'competitorPrice') return row.competitorPrice ?? -1; return row.reductionVnd ?? -1 }
function formatCompact (value: number) { return new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(value) }
function formatObservedAt (value: string | null | undefined) { return value ? new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : 'Chưa có' }

function ProductImage ({ src, alt, source, className }: { src?: string | null, alt: string, source?: 'model' | 'product' | null, className?: string }) {
  const [failed, setFailed] = useState(false)
  const usable = Boolean(src) && !failed
  return usable ? <span className={`book-cover image-cover ${className ?? ''}`} title={source === 'model' ? 'Ảnh biến thể' : 'Ảnh sản phẩm'}><img src={src as string} alt={alt} onError={() => setFailed(true)} /></span> : <span className={`book-cover ${className ?? ''}`} title="Chưa có ảnh"><Icon name="book" /></span>
}

function Icon ({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>, chart: <><path d="M4 19V5" /><path d="M4 19h17" /><path d="m7 15 4-4 3 2 5-6" /></>, book: <><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 4.5v17" /><path d="M8 6h8" /></>, check: <><path d="m5 12 4 4L19 6" /><circle cx="12" cy="12" r="9" /></>, history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></>, settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-2.6v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H6.3v-2.6h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V4h2.6v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v2.6h-.2a1.7 1.7 0 0 0-1.5 1.3Z" /></>, search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>, filter: <><path d="M4 6h16M7 12h10m-7 6h4" /></>, sort: <><path d="M8 5v14M8 5 5 8m3-3 3 3M16 19V5m0 14 3-3m-3 3-3-3" /></>, bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>, shield: <><path d="M12 3 20 6v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>, clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>, download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 20h16" /></>, refresh: <><path d="M20 11a8 8 0 0 0-14.5-4L3 9" /><path d="M3 4v5h5" /><path d="M4 13a8 8 0 0 0 14.5 4L21 15" /><path d="M21 20v-5h-5" /></>, menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>, close: <><path d="m6 6 12 12M18 6 6 18" /></>, chevronDown: <path d="m6 9 6 6 6-6" />, chevronRight: <path d="m9 6 6 6-6 6" />, chevronLeft: <path d="m15 6-6 6 6 6" />, external: <><path d="M14 4h6v6" /><path d="m20 4-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></>, info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>, more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>
  }
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.info}</svg>
}
