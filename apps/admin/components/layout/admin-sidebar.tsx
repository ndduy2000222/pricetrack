'use client'

import Link from 'next/link'
import { AdminIcon } from './icons'
import { NavMain, type AdminNavItem } from './nav-main'

const navGroups: Array<{ label: string, items: AdminNavItem[] }> = [
  {
    label: 'PHÂN TÍCH GIÁ',
    items: [{ title: 'So sánh giá', url: '/', icon: 'chart', description: 'Theo dõi thị trường' }]
  },
  {
    label: 'VẬN HÀNH GIÁ',
    items: [{ title: 'Khuyến mãi', url: '/promotions', icon: 'tag', description: 'Chương trình Shopee' }]
  },
  {
    label: 'QUẢN LÝ DỮ LIỆU',
    items: [{ title: 'Kết nối & đồng bộ', url: '/connect/shops', icon: 'store', description: 'Shop và catalog' }]
  },
  {
    label: 'HỆ THỐNG',
    items: [{ title: 'Cấp quyền shop', url: '/connect/shop', icon: 'settings', description: 'Thiết lập kết nối' }]
  }
]

export function AdminSidebar ({ open, onClose }: { open: boolean, onClose: () => void }) {
  return <aside className={`alpha-sidebar${open ? ' is-open' : ''}`} aria-label="Thanh điều hướng Alpha Books">
    <div className="alpha-sidebar-header">
      <Link className="alpha-brand" href="/" onClick={onClose}>
        <span className="alpha-brand-mark">a.</span>
        <span><strong>Alpha Books</strong><small>PRICING INTELLIGENCE</small></span>
      </Link>
      <button className="alpha-mobile-close" type="button" aria-label="Đóng điều hướng" onClick={onClose}><AdminIcon name="x" /></button>
    </div>
    <div className="alpha-workspace-switch">
      <span className="alpha-workspace-avatar">AB</span>
      <span><strong>Không gian quản trị</strong><small>Điều khiển giá và dữ liệu</small></span>
      <AdminIcon name="chevronRight" />
    </div>
    <NavMain groups={navGroups} onNavigate={onClose} />
    <div className="alpha-sidebar-footer">
      <div className="alpha-readonly"><AdminIcon name="shield" /><span><strong>Chế độ quan sát</strong><small>Không tự động đổi giá</small></span></div>
      <div className="alpha-account"><span className="alpha-account-avatar">DN</span><span><strong>Tài khoản quản trị</strong><small>Quản trị workspace</small></span></div>
    </div>
  </aside>
}
