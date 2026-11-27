/* eslint-disable @next/next/no-img-element */
'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { formatVnd, type CompetitorComparison, type PriceRow } from '../lib/mock-data'

type Mode = 'monitor' | 'review' | 'catalog'
type StatusFilter = 'all' | PriceRow['status']
type SortKey = 'title' | 'currentPrice' | 'competitorPrice' | 'reductionVnd'
type CompetitorScope = { mode: 'feed' | 'affiliate_keyword' | 'none', requestedRows: number, totalRows: number, limited: boolean }
type CompetitorColumn = { key: string, label: string, fullName: string, shopUrl: string }
type ShopConnection = { id: string, shop_id: string, name: string | null, status: string }
const PAGE_SIZE = 10
const SELECTED_SHOP_STORAGE_KEY = 'alpha-price-control:selected-shop'

const competitorColumns: CompetitorColumn[] = [
  { key: 'omegaplusvn', label: 'Omega Plus', fullName: 'Omega Plus Books Store', shopUrl: 'https://shopee.vn/omegaplusvn' },
  { key: 'tramdochcm', label: 'Trạm Đọc HCM', fullName: 'Trạm Đọc HCM', shopUrl: 'https://shopee.vn/tramdochcm' },
  { key: 'tram-doc-read-station', label: 'Nhà Sách Trạm Đọc', fullName: 'Nhà Sách Trạm Đọc', shopUrl: 'https://shopee.vn/tram_doc_read_station' },
  { key: 'tramdocbooks', label: 'Trạm Đọc Books', fullName: 'Trạm Đọc Books', shopUrl: 'https://shopee.vn/tramdocbooks' },
  { key: 'readstation-vn', label: 'Read Station', fullName: 'Read Station', shopUrl: 'https://shopee.vn/readstation.vn' }
]

const statusMeta: Record<PriceRow['status'], { label: string, tone: string }> = {
  within: { label: 'Theo dõi', tone: 'success' }, review: { label: 'Chờ duyệt', tone: 'warning' }, blocked: { label: 'Bị chặn', tone: 'danger' }, pending: { label: 'Chưa đối chứng', tone: 'warning' }
}

export function PriceControlDashboard () {
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
  const [showShops, setShowShops] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  const [dataSource, setDataSource] = useState<'loading' | 'live' | 'catalog-live' | 'review-live' | 'error'>('loading')
  const [catalogOrigin, setCatalogOrigin] = useState<'stored' | 'live_sync' | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [catalogRowCount, setCatalogRowCount] = useState<number | null>(null)
  const [catalogItemCount, setCatalogItemCount] = useState<number | null>(null)
  const [competitorSource, setCompetitorSource] = useState<string>('none')
  const [competitorFeedCount, setCompetitorFeedCount] = useState<number>(0)
  const [competitorShopCount, setCompetitorShopCount] = useState<number>(0)
  const [competitorScope, setCompetitorScope] = useState<CompetitorScope | null>(null)
  const [competitorFeedErrors, setCompetitorFeedErrors] = useState<string[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [shopConnections, setShopConnections] = useState<ShopConnection[]>([])
  const [selectedShopId, setSelectedShopId] = useState('')
  const shopSelectionReady = useRef(false)

  useEffect(() => {
    let active = true
    const loadConnections = async () => {
      try {
        const response = await fetch('/api/shop-connections', { cache: 'no-store' })
        if (!response.ok) return
        const payload = await response.json()
        if (!active) return
        const connections = (Array.isArray(payload?.connections) ? payload.connections : []) as ShopConnection[]
        const authorizedConnections = connections.filter(isAuthorizedShop)
        const storedShopId = readStoredShopId()
        setShopConnections(connections)
        setSelectedShopId((current) => {
          if (authorizedConnections.some((shop) => shop.id === current)) return current
          if (storedShopId && authorizedConnections.some((shop) => shop.id === storedShopId)) return storedShopId
          return authorizedConnections.length === 1 ? authorizedConnections[0].id : ''
        })
        shopSelectionReady.current = true
      } catch {
        // Keep the persisted selection intact if the shop list is temporarily unavailable.
      }
    }
    loadConnections()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!shopSelectionReady.current) return
    try {
      if (selectedShopId) window.localStorage.setItem(SELECTED_SHOP_STORAGE_KEY, selectedShopId)
      else window.localStorage.removeItem(SELECTED_SHOP_STORAGE_KEY)
    } catch {
      // Storage can be unavailable in private browsing or restricted environments.
    }
  }, [selectedShopId])

  useEffect(() => {
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { setSelectedRow(null); setShowShops(false); setSidebarOpen(false) }
      if (event.key === '/' && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement)) { event.preventDefault(); searchInput.current?.focus() }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])

  useEffect(() => {
    let active = true
    let refreshing = false
    const controller = new AbortController()
    const fetchJson = async (url: string) => {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
      const payload = await response.json()
      return active ? payload : null
    }
    const refresh = async () => {
      if (!active || refreshing) return
      refreshing = true
      try {
        if (!selectedShopId) return
        const shopQuery = `connection_id=${encodeURIComponent(selectedShopId)}`
        const payload = await fetchJson(`/api/price-review?source=stored&${shopQuery}`)
        if (!active) return
        if (payload?.status === 'live' && payload.catalogSource === 'stored' && Array.isArray(payload.rows)) {
          setRows(payload.rows.map(normalizeReviewRow)); setDataSource('review-live'); setCatalogOrigin(payload.catalogSource === 'stored' ? 'stored' : 'live_sync')
          setCatalogRowCount(typeof payload.catalogRowCount === 'number' ? payload.catalogRowCount : payload.rows.length); setCatalogItemCount(typeof payload.catalogItemCount === 'number' ? payload.catalogItemCount : null); setCompetitorSource(typeof payload.competitorSource === 'string' ? payload.competitorSource : 'none'); setCompetitorFeedCount(typeof payload.competitorFeedCount === 'number' ? payload.competitorFeedCount : 0); setCompetitorFeedErrors(Array.isArray(payload.competitorFeedErrors) ? payload.competitorFeedErrors : [])
          setCompetitorShopCount(Array.isArray(payload.competitorShops) ? payload.competitorShops.length : 0); setCompetitorScope(payload.competitorScope ?? null)
          setLoadError(null)
          setLastSync(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }))
          return
        }
        const catalogPayload = await fetchJson(`/api/catalog?all=true&source=stored&${shopQuery}`)
        if (!active) return
        if (catalogPayload?.status === 'live' && catalogPayload.catalogSource === 'stored' && Array.isArray(catalogPayload.rows)) {
          setRows(catalogPayload.rows.map(normalizeCatalogRow)); setDataSource('catalog-live'); setCatalogOrigin(catalogPayload.catalogSource === 'stored' ? 'stored' : 'live_sync')
          setCatalogRowCount(typeof catalogPayload.rows.length === 'number' ? catalogPayload.rows.length : null); setCatalogItemCount(typeof catalogPayload.itemCount === 'number' ? catalogPayload.itemCount : null); setCompetitorSource('none'); setCompetitorShopCount(0); setCompetitorScope(null)
          setLoadError(null)
          setLastSync(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }))
        } else {
          setLoadError(readableApiError(catalogPayload?.code ?? payload?.code ?? catalogPayload?.message ?? payload?.message))
          setDataSource((current) => current === 'loading' ? 'error' : current)
        }
      } catch (error) {
        if (active && !(error instanceof DOMException && error.name === 'AbortError')) { setLoadError('Không thể kết nối máy chủ để đọc catalog.'); setDataSource((current) => current === 'loading' ? 'error' : current) }
      } finally {
        refreshing = false
      }
    }
    refresh(); const timer = window.setInterval(refresh, 30_000)
    return () => { active = false; controller.abort(); window.clearInterval(timer) }
  }, [selectedShopId])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return rows.filter((row) => statusFilter === 'all' || row.status === statusFilter)
      .filter((row) => mode !== 'review' || row.status === 'review')
      .filter((row) => !normalizedQuery || `${row.sku} ${row.title} ${row.author} ${row.competitor} ${row.isbn || ''} ${row.ean || ''}`.toLowerCase().includes(normalizedQuery))
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
  const sourceLabel = dataSource === 'review-live' ? `LIVE · ${catalogOrigin === 'stored' ? 'catalog đã lưu' : 'Shopee'} · ${competitorFeedCount ? `${competitorFeedCount} nguồn đối thủ` : '5 shop chờ đối chiếu'}` : dataSource === 'catalog-live' ? `LIVE · ${catalogOrigin === 'stored' ? 'catalog đã lưu' : 'Shopee catalog'}` : dataSource === 'live' ? 'LIVE · Shopee Open API' : dataSource === 'error' ? 'Chưa có dữ liệu live' : 'Đang tải dữ liệu'

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDirection('desc') }
  }
  const toggleSelected = (id: string) => setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const selectAllVisible = () => setSelectedIds((current) => { const next = new Set(current); const allSelected = visibleRows.every((row) => next.has(row.id)); visibleRows.forEach((row) => allSelected ? next.delete(row.id) : next.add(row.id)); return next })
  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: PriceRow) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedRow(row) } }

  const pageTitle = mode === 'review' ? 'Đề xuất cần duyệt' : mode === 'catalog' ? 'Danh mục sách' : 'So sánh giá'
  const selectedShop = shopConnections.find((shop) => shop.id === selectedShopId)
  const selectedShopLabel = selectedShop ? selectedShop.name || selectedShop.shop_id : 'Chưa chọn shop'
  const feedReady = competitorFeedCount > 0
  const evidenceCount = visibleRows.reduce((sum, row) => sum + (row.competitorComparisons?.filter((item) => item.status === 'matched').length ?? 0), 0)
  const catalogOnly = mode === 'catalog'
  const handleShopChange = (shopId: string) => {
    setSelectedShopId(shopId)
    setRows([])
    setPage(1)
    setSelectedIds(new Set())
    setSelectedRow(null)
    setDataSource(shopId ? 'loading' : 'error')
    setCatalogOrigin(null)
    setLastSync(null)
    setCatalogRowCount(null)
    setCatalogItemCount(null)
    setCompetitorSource('none')
    setCompetitorFeedCount(0)
    setCompetitorShopCount(0)
    setCompetitorScope(null)
    setCompetitorFeedErrors([])
    setLoadError(shopId ? null : 'Hãy chọn shop trước khi đọc dữ liệu.')
  }

  return <div className={`market-app ${sidebarOpen ? 'market-menu-open' : ''}`}>
    <button className="market-overlay" type="button" aria-label="Đóng menu" onClick={() => setSidebarOpen(false)} />
    <aside className="market-sidebar">
      <Link className="market-brand" href="/"><span className="market-monogram">a.</span><span>Alpha Books<small>PRICE CONTROL</small></span></Link>
      <div className="market-workspace"><span className="market-shop-avatar">{selectedShop ? 'AB' : '—'}</span><div><strong>{selectedShopLabel}</strong><small>{selectedShop ? 'Gian hàng Shopee' : 'Chọn shop để xem dữ liệu'}</small></div></div>
      <p className="market-nav-label">KHÔNG GIAN LÀM VIỆC</p>
      <nav aria-label="Điều hướng chính">
        <button className={mode === 'monitor' ? 'active' : ''} onClick={() => { setMode('monitor'); setPage(1); setSidebarOpen(false) }}><Icon name="chart" />So sánh giá</button>
        <button className={mode === 'catalog' ? 'active' : ''} onClick={() => { setMode('catalog'); setPage(1); setSidebarOpen(false) }}><Icon name="book" />Danh mục sách<span>{rows.length ? new Intl.NumberFormat('vi-VN').format(rows.length) : '—'}</span></button>
        <button className={mode === 'review' ? 'active' : ''} onClick={() => { setMode('review'); setPage(1); setSidebarOpen(false) }}><Icon name="check" />Chờ duyệt<span>{reviewCount}</span></button>
      </nav>
      <p className="market-nav-label">QUẢN LÝ DỮ LIỆU</p>
      <nav aria-label="Nguồn dữ liệu"><button onClick={() => setShowShops(true)}><Icon name="store" />Shop đối thủ<span>5</span></button><a href="/connect/shops"><Icon name="settings" />Kết nối & đồng bộ</a></nav>
      <div className="market-sidebar-bottom"><div className="market-readonly"><Icon name="shield" /><span>Chế độ quan sát<small>Mọi đề xuất do bạn quyết định</small></span></div><div className="market-account"><span>DN</span><div><strong>Vận hành Alpha Books</strong><small>Workspace quản trị</small></div></div></div>
    </aside>
    <main className="market-main">
      <header className="market-topbar"><div><button className="market-menu-button" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Mở menu"><Icon name="menu" /></button><span>Workspace</span><Icon name="chevronRight" /><strong>{pageTitle}</strong></div><label aria-label="Chọn shop đang vận hành"><select value={selectedShopId} onChange={(event) => handleShopChange(event.target.value)}><option value="">Chọn shop…</option>{shopConnections.filter(isAuthorizedShop).map((shop) => <option key={shop.id} value={shop.id}>{shop.name || shop.shop_id}</option>)}</select></label></header>
      <div className="market-content">
        <div className="market-titlebar"><div><p>QUẢN TRỊ GIÁ BÁN</p><h1>{pageTitle}<span>{catalogOnly ? 'Catalog' : 'Thị trường Shopee'}</span></h1><div className="market-description">{selectedShop ? (catalogOnly ? `Sản phẩm, biến thể và giá từ ${selectedShopLabel}.` : `${selectedShopLabel} và 5 nhà bán. Cùng sách, cùng biến thể, cùng cơ sở giá.`) : 'Chọn shop để xem catalog và dữ liệu so sánh giá.'}</div></div><div className="market-actions"><a className="market-button" href={selectedShopId ? `${catalogOnly ? '/api/catalog?format=xlsx&all=true&source=stored' : '/api/price-review?format=xlsx&source=stored'}&connection_id=${encodeURIComponent(selectedShopId)}` : '#'}><Icon name="download" />Xuất Excel</a><button className="market-button market-button-dark" onClick={() => window.location.reload()}><Icon name="refresh" />Làm mới</button></div></div>
        <section className="market-stats" aria-label="Tình trạng dữ liệu"><div><span>Danh mục đã lưu</span><strong>{isLive ? new Intl.NumberFormat('vi-VN').format(catalogRowCount ?? rows.length) : '—'}<small>SKU</small></strong><p>{catalogItemCount ?? '—'} sản phẩm Shopee</p></div><div><span>Đối chứng trên trang này</span><strong>{evidenceCount}<small>/ {visibleRows.length * 5} ô giá</small></strong><p>Đã xác minh đúng sách & giá</p></div><div><span>Chênh lệch trung bình</span><strong>{averageGap === null ? '—' : formatVnd(averageGap)}</strong><p>{comparableRows.length ? `Từ ${comparableRows.length} SKU có đối chứng` : 'Chưa có giá đủ điều kiện'}</p></div><div><span>Đề xuất cần duyệt</span><strong>{reviewCount}<small>SKU</small></strong><p>{blockedCount ? `${blockedCount} SKU đang bị chặn giá sàn` : 'Chờ đủ giá vốn và dữ liệu thị trường'}</p></div></section>
        {loadError ? <div className="market-notice" role="alert"><Icon name="info" />{loadError}<a href="/connect/shops">Kiểm tra kết nối</a></div> : null}
        <section className="market-datagrid" aria-label="Bảng so sánh giá">
          <div className="market-grid-tabs"><div><button className={mode !== 'review' ? 'selected' : ''} onClick={() => { setMode(catalogOnly ? 'catalog' : 'monitor'); setPage(1) }}><Icon name="list" />Tất cả sách<span>{rows.length}</span></button><button className={mode === 'review' ? 'selected' : ''} onClick={() => { setMode('review'); setPage(1) }}>Cần duyệt<span>{reviewCount}</span></button></div><span>10 SKU / trang</span></div>
          <div className="market-grid-toolbar"><label className="market-search"><Icon name="search" /><input ref={searchInput} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Tìm sách, SKU, ISBN hoặc tác giả…" aria-label="Tìm kiếm SKU" /><kbd>/</kbd></label><div><label className="market-select"><Icon name="filter" /><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as StatusFilter); setPage(1) }} aria-label="Lọc trạng thái"><option value="all">Trạng thái</option><option value="pending">Chưa đối chứng</option><option value="review">Chờ duyệt</option><option value="blocked">Bị chặn</option><option value="within">Theo dõi</option></select></label><label className="market-select"><Icon name="sort" /><select value={sortKey} onChange={(event) => { toggleSort(event.target.value as SortKey); setPage(1) }} aria-label="Sắp xếp"><option value="reductionVnd">Thứ tự catalog</option><option value="title">Tên sách</option><option value="currentPrice">Giá Alpha</option><option value="competitorPrice">Giá đối thủ</option></select></label></div></div>
          {selectedIds.size > 0 ? <div className="market-selection">{selectedIds.size} SKU được chọn<button onClick={() => setSelectedIds(new Set())}>Bỏ chọn</button></div> : null}
          <div className="market-table-scroll"><table className="market-price-table"><colgroup><col className="market-check-col" /><col className="market-product-col" /><col className="market-price-col" />{!catalogOnly ? competitorColumns.map((shop) => <col key={shop.key} className="market-price-col" />) : null}<col className="market-action-col" /></colgroup><thead><tr><th className="market-check"><input type="checkbox" checked={visibleRows.length > 0 && visibleRows.every((row) => selectedIds.has(row.id))} onChange={selectAllVisible} aria-label="Chọn tất cả SKU đang hiển thị" /></th><th className="market-product-head">Sách / biến thể</th><th className="market-own-head"><span className="market-column-avatar">{selectedShop ? 'AB' : '—'}</span><strong>{selectedShopLabel}</strong><small>{selectedShop ? 'Giá shop của bạn' : 'Chọn shop để xem giá'}</small></th>{!catalogOnly ? competitorColumns.map((shop, index) => <th key={shop.key}><a href={shop.shopUrl} target="_blank" rel="noreferrer" title={shop.fullName}><span className="market-column-index">0{index + 1}</span><strong>{shop.label}</strong><small>Giá trước voucher <Icon name="external" /></small></a></th>) : null}<th /></tr></thead><tbody>{visibleRows.length ? visibleRows.map((row, index) => <PriceTableRow key={row.id} row={row} index={(page - 1) * PAGE_SIZE + index} catalogOnly={catalogOnly} selected={selectedIds.has(row.id)} onSelect={() => toggleSelected(row.id)} onOpen={() => setSelectedRow(row)} onKeyDown={(event) => onRowKeyDown(event, row)} />) : <tr><td className="market-empty" colSpan={catalogOnly ? 4 : 9}>{dataSource === 'loading' ? 'Đang tải danh mục sách…' : loadError ? 'Chưa tải được danh mục. Kiểm tra kết nối ở trên.' : 'Không có sách phù hợp bộ lọc.'}</td></tr>}</tbody></table></div>
          <div className="market-grid-footer"><span>{filteredRows.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, filteredRows.length)}<span> / {new Intl.NumberFormat('vi-VN').format(filteredRows.length)} SKU</span></span><div><button disabled={page === 1} aria-label="Trang trước" onClick={() => setPage(page - 1)}><Icon name="chevronLeft" /></button><span>Trang {page} / {pageCount}</span><button disabled={page >= pageCount} aria-label="Trang sau" onClick={() => setPage(page + 1)}><Icon name="chevronRight" /></button></div></div>
        </section>
        <footer className="market-statusline"><span><span className={isLive ? 'market-online' : 'market-offline'} />{sourceLabel}{lastSync ? ` · ${lastSync}` : ''}</span><span title={competitorFeedErrors.join(' · ')}>{feedReady ? `${competitorFeedCount} nguồn giá đang hoạt động` : 'Chưa có giá đối thủ được xác minh'}{competitorShopCount ? ` · ${competitorShopCount} shop` : ''}{competitorScope?.limited ? ` · Phạm vi ${competitorScope.requestedRows} SKU` : ''}{competitorSource === 'error' ? ' · Nguồn đang lỗi' : ''}</span></footer>
      </div>
    </main>
    {selectedRow ? <SkuDetails row={selectedRow} onClose={() => setSelectedRow(null)} /> : null}
    {showShops ? <div className="details-backdrop" onClick={() => setShowShops(false)}><aside className="details-panel market-shops-panel" onClick={(event) => event.stopPropagation()}><div className="details-header"><h2>5 shop đối thủ</h2><button className="icon-button" aria-label="Đóng shop đối thủ" onClick={() => setShowShops(false)}><Icon name="close" /></button></div><p className="market-description">Chọn một nhà bán để kiểm tra gian hàng trên Shopee.</p>{competitorColumns.map((shop, index) => <a key={shop.key} href={shop.shopUrl} target="_blank" rel="noreferrer"><span>0{index + 1}</span><div><strong>{shop.fullName}</strong><small>{shop.shopUrl.replace('https://', '')}</small></div><Icon name="external" /></a>)}</aside></div> : null}
  </div>
}

function PriceTableRow ({ row, index, catalogOnly, selected, onSelect, onOpen, onKeyDown }: { row: PriceRow, index: number, catalogOnly: boolean, selected: boolean, onSelect: () => void, onOpen: () => void, onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => void }) {
  const comparisons = competitorColumns.map((column) => ({ column, comparison: row.competitorComparisons?.find((candidate) => candidate.shopKey === column.key) ?? null }))
  const matched = comparisons.filter(({ comparison }) => comparison?.status === 'matched' && comparison.comparablePrice != null)
  const prices = matched.map(({ comparison }) => comparison!.comparablePrice as number)
  const lowest = prices.length && row.currentPrice != null ? Math.min(row.currentPrice, ...prices) : null
  return <tr className={selected ? 'selected-row' : ''} tabIndex={0} onClick={onOpen} onKeyDown={onKeyDown}>
    <td className="market-check" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Chọn ${row.sku}`} /></td>
    <td className="market-product"><span className="market-row-number">{String(index + 1).padStart(2, '0')}</span><ProductImage src={row.imageUrl} alt={row.title} source={row.imageSource} /><div><strong title={row.title}>{row.title.replace(/^Sách\s*[-:>]\s*/i, '')}</strong><span>{row.modelName || row.author || ''}<i />{row.sku}</span><small>{row.stock == null ? '' : `Kho: ${new Intl.NumberFormat('vi-VN').format(row.stock)}`}</small></div></td>
    <td className={`market-own-price ${lowest !== null && row.currentPrice === lowest ? 'market-lowest' : ''}`}><strong>{formatVnd(row.currentPrice)}</strong><time>{formatObservedAt(row.ownObservedAt)}</time>{lowest !== null && row.currentPrice === lowest ? <small>Thấp nhất</small> : null}</td>
    {!catalogOnly ? comparisons.map(({ column, comparison }) => <ComparisonCell key={column.key} comparison={comparison} lowestPrice={lowest} />) : null}
    <td><button className="market-open-row" type="button" aria-label={`Mở chi tiết ${row.sku}`} onClick={(event) => { event.stopPropagation(); onOpen() }}><Icon name="chevronRight" /></button></td>
  </tr>
}

function ComparisonCell ({ comparison, lowestPrice }: { comparison: CompetitorComparison | null, lowestPrice: number | null }) {
  const price = comparison?.status === 'matched' ? comparison.comparablePrice : null
  if (price == null || !comparison?.url) return <td className="market-no-price" aria-label="Chưa có giá xác minh" />
  return <td className={price === lowestPrice ? 'market-lowest' : ''}><a className="market-evidence-price" href={comparison.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} title={comparison.confidenceReason || comparison.name || ''}><strong>{formatVnd(price)}<Icon name="external" /></strong><time>{formatObservedAt(comparison.observedAt)}</time>{price === lowestPrice ? <small>Thấp nhất</small> : null}</a></td>
}

function SkuDetails ({ row, onClose }: { row: PriceRow, onClose: () => void }) {
  const difference = row.priceDifference ?? null
  const reduction = row.reductionVnd ?? null
  const ownObservedAt = formatObservedAt(row.ownObservedAt || row.updatedAt)
  const competitorObservedAt = formatObservedAt(row.competitorObservedAt)
  return <div className="details-backdrop" onClick={onClose}><aside className="details-panel" onClick={(event) => event.stopPropagation()}><div className="details-header"><div><span className="eyebrow">CHI TIẾT SKU</span><h2>{row.sku}</h2></div><button className="icon-button" onClick={onClose} aria-label="Đóng chi tiết" type="button"><Icon name="close" /></button></div><div className="details-product"><ProductImage src={row.imageUrl} alt={row.title} source={row.imageSource} className="cover-2" /><div><h3>{row.title}</h3><p>{row.modelName || row.author || 'Chưa có tác giả hoặc tên biến thể'}</p></div></div><div className="details-status"><span className={`status-pill ${statusMeta[row.status].tone}`}><i />{statusMeta[row.status].label}</span><span>Shop cập nhật {ownObservedAt}</span></div><div className="detail-price-grid"><div><span>Giá shop</span><b>{formatVnd(row.currentPrice)}</b></div><div><span>Đối thủ thấp nhất</span><b>{formatVnd(row.competitorPrice)}</b><small>{row.competitor ? `${row.competitor}${row.competitorVariant ? ` · ${row.competitorVariant}` : ''}` : 'Chưa có dữ liệu đối thủ'}</small></div><div><span>Giá mục tiêu</span><b className="accent-text">{formatVnd(row.proposedPrice)}</b></div><div><span>Giá sàn</span><b>{formatVnd(row.floorPrice)}</b></div></div><div className="details-section"><h4>Phân tích đề xuất</h4><div className="detail-line"><span>Chênh lệch hiện tại</span><b className={difference === null ? '' : difference > 0 ? 'negative-text' : 'positive-text'}>{difference === null ? '—' : `${difference > 0 ? '+' : ''}${formatVnd(difference)}`}</b></div><div className="detail-line"><span>Mức giảm đề xuất</span><b>{reduction === null ? 'Chưa đủ dữ liệu' : reduction > 0 ? formatVnd(reduction) : 'Giữ giá hiện tại'}</b></div><div className="detail-line"><span>Lợi nhuận dự kiến</span><b>{row.expectedProfit == null ? 'Chưa đủ dữ liệu' : formatVnd(row.expectedProfit)}</b></div><div className="detail-line"><span>Độ tin cậy ghép</span><b>{row.confidence == null ? 'Chưa xác định' : `${Math.round(row.confidence * 100)}%`}</b></div></div><div className="details-section"><h4>So sánh 5 shop</h4>{row.competitorComparisons?.length ? <div className="competitor-list">{row.competitorComparisons.map((comparison) => <CompetitorComparisonRow key={`${comparison.shop}:${comparison.modelId ?? comparison.sku ?? comparison.url}`} comparison={comparison} />)}</div> : <div className="missing-evidence"><Icon name="info" /> Chưa có dữ liệu đối thủ hợp lệ để so sánh.</div>}</div><div className="details-section"><h4>Dữ liệu tham chiếu</h4><div className="detail-line"><span>Nguồn đối thủ</span><b>{row.competitorSourceName && row.competitorSourceName !== 'none' ? row.competitorSourceName : 'Chưa cấu hình'}</b></div><div className="detail-line"><span>Cơ sở giá</span><b>{row.competitorPriceBasis || 'Chưa có giá đối chứng'}</b></div><div className="detail-line"><span>Quan sát đối thủ</span><b>{competitorObservedAt}</b></div><div className="detail-line"><span>Ghép sản phẩm</span><b>{row.confidenceReason || 'Chưa có kết quả ghép'}</b></div></div><div className="details-section"><h4>Metadata shop</h4><div className="detail-line"><span>ISBN / EAN</span><b>{row.isbn || row.ean || 'Chưa có'}</b></div><div className="detail-line"><span>Quy cách</span><b>{row.competitorVariant || row.modelName || 'Chưa có'}</b></div><div className="detail-line"><span>Tồn kho</span><b>{row.stock == null ? 'Chưa có' : row.stock}</b></div></div><div className="details-section"><h4>Lý do</h4><p className="reason-box">{row.reason || 'Chưa có ghi chú phân tích.'}</p></div>{row.evidenceUrl ? <a className="button primary full-width" href={row.evidenceUrl} target="_blank" rel="noreferrer"><Icon name="external" /> Mở link đối chứng</a> : <div className="missing-evidence"><Icon name="info" /> Chưa có link đối chứng được phê duyệt.</div>}</aside></div>
}

function CompetitorComparisonRow ({ comparison }: { comparison: CompetitorComparison }) {
  const statusLabel = comparison.status === 'matched' ? 'Đã khớp' : comparison.status === 'candidate' ? 'Ứng viên' : comparison.status === 'not_checked' ? 'Chưa dò' : comparison.status === 'not_configured' ? 'Chưa cấu hình' : comparison.status === 'error' ? 'Nguồn lỗi' : comparison.status === 'stale' ? 'Đã cũ' : 'Không khớp'
  return <article className={`competitor-comparison ${comparison.status ?? ''}`}><div className="competitor-comparison-head"><span><b>{comparison.shop}</b><em>{statusLabel}</em></span><strong>{formatVnd(comparison.comparablePrice)}</strong></div><div className="competitor-comparison-body">{comparison.imageUrl ? <ProductImage src={comparison.imageUrl} alt={comparison.name || comparison.shop} source="product" className="competitor-cover" /> : null}<div><p>{comparison.variant || comparison.name || comparison.reason || comparison.confidenceReason || 'Chưa có sản phẩm đối chứng'}</p><small>{comparison.promoPrice != null ? `KM ${formatVnd(comparison.promoPrice)}` : comparison.listPrice != null ? `Niêm yết ${formatVnd(comparison.listPrice)}` : comparison.comparablePrice != null ? 'Giá ứng viên' : 'Chưa có giá'} · {formatObservedAt(comparison.observedAt)}</small></div></div>{comparison.confidenceReason ? <small className="competitor-reason">{comparison.confidenceReason}</small> : null}<a href={comparison.url || comparison.shopUrl || '#'} target="_blank" rel="noreferrer">{comparison.comparablePrice != null ? 'Mở sản phẩm đối chứng' : 'Mở shop'} <Icon name="external" /></a></article>
}

function normalizeReviewRow (row: { itemId: string, modelId: string, sku: string | null, name: string | null, modelName: string | null, isbn: string | null, ean: string | null, author: string | null, publisher: string | null, edition: string | null, coverType: string | null, volumeOrCombo: string | null, stock: number | null, productUrl: string, imageUrl: string | null, imageId: string | null, imageSource: 'model' | 'product' | null, ownObservedAt: string, ownPrice: number | null, competitorPrice: number | null, competitorShop: string | null, competitorName: string | null, competitorVariant: string | null, competitorPriceBasis: string | null, competitorSource: string, competitorSourceName: string, competitorComparisons?: CompetitorComparison[], targetPrice: number | null, floorPrice: number | null, status: string, competitorObservedAt: string | null, reason: string, confidence: number | null, confidenceReason: string, priceDifference: number | null, reductionVnd: number | null, reductionPercent: number | null, expectedProfit: number | null, competitorUrl: string | null }): PriceRow {
  return { id: `${row.itemId}:${row.modelId}`, sku: row.sku || `${row.itemId}:${row.modelId}`, title: row.name || `Shopee item ${row.itemId} · model ${row.modelId}`, author: row.author || '', competitor: row.competitorShop || '', competitorPrice: row.competitorPrice, currentPrice: row.ownPrice, proposedPrice: row.targetPrice, floorPrice: row.floorPrice, ceilingPrice: null, status: row.status === 'proposal' ? 'review' : row.status === 'blocked' ? 'blocked' : row.status === 'needs_review' ? 'review' : 'pending', updatedAt: formatObservedAt(row.ownObservedAt), reason: `${row.reason}${row.confidence !== null ? ` · Tin cậy ${(row.confidence * 100).toFixed(0)}%` : ''}`, priceDifference: row.priceDifference, reductionVnd: row.reductionVnd, reductionPercent: row.reductionPercent, confidence: row.confidence, expectedProfit: row.expectedProfit, evidenceUrl: row.competitorUrl, productUrl: row.productUrl, imageUrl: row.imageUrl, imageId: row.imageId, imageSource: row.imageSource, ownObservedAt: row.ownObservedAt, competitorObservedAt: row.competitorObservedAt, competitorPriceBasis: row.competitorPriceBasis, competitorVariant: row.competitorVariant || row.volumeOrCombo || row.coverType, confidenceReason: row.confidenceReason, competitorSource: row.competitorSource, competitorSourceName: row.competitorSourceName, competitorComparisons: row.competitorComparisons ?? [], modelName: row.modelName, isbn: row.isbn, ean: row.ean, stock: row.stock }
}

function normalizeCatalogRow (row: { itemId: string, modelId: string, sku: string | null, name: string | null, modelName: string | null, author: string | null, isbn: string | null, ean: string | null, stock: number | null, imageUrl: string | null, imageId: string | null, imageSource: 'model' | 'product' | null, currentPrice: number | null, productUrl: string, observedAt: string }): PriceRow {
  return { id: `${row.itemId}:${row.modelId}`, sku: row.sku || `${row.itemId}:${row.modelId}`, title: row.name || `Shopee item ${row.itemId}`, author: row.author || '', competitor: '', competitorPrice: null, currentPrice: row.currentPrice, proposedPrice: null, floorPrice: null, ceilingPrice: null, status: 'pending', updatedAt: formatObservedAt(row.observedAt), reason: 'Bảng đối thủ chưa sẵn sàng, đang hiển thị catalog shop', imageUrl: row.imageUrl, imageId: row.imageId, imageSource: row.imageSource, ownObservedAt: row.observedAt, competitorSource: 'none', competitorSourceName: 'none', modelName: row.modelName, isbn: row.isbn, ean: row.ean, stock: row.stock, productUrl: row.productUrl }
}

function sortValue (row: PriceRow, key: SortKey) { if (key === 'title') return row.title; if (key === 'currentPrice') return row.currentPrice ?? -1; if (key === 'competitorPrice') return row.competitorPrice ?? -1; return row.reductionVnd ?? -1 }
function formatObservedAt (value: string | null | undefined) { return value ? new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : 'Chưa có' }
function readableApiError (value: unknown) { return value === 'refresh_token_not_configured' ? 'Shopee cần cấp quyền lại: refresh token chưa có hoặc đã hết hạn.' : value === 'reauthorization_required' ? 'Shopee từ chối token hiện tại. Hãy cấp quyền lại cho shop.' : typeof value === 'string' && value ? value : 'Chưa đọc được dữ liệu Shopee.' }
function isAuthorizedShop (shop: ShopConnection) { return shop.status === 'connected' }
function readStoredShopId () {
  try { return window.localStorage.getItem(SELECTED_SHOP_STORAGE_KEY) ?? '' } catch { return '' }
}

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
