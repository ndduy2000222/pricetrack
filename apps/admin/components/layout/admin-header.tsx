'use client'

import { usePathname } from 'next/navigation'
import { Button } from '../ui/button'
import { Separator } from '../ui/separator'
import { AdminIcon } from './icons'

const pageNames: Record<string, string> = {
  '/connect/shops': 'Kết nối & đồng bộ',
  '/connect/shop': 'Cấp quyền shop'
}

export function AdminHeader ({ sidebarOpen, onToggle }: { sidebarOpen: boolean, onToggle: () => void }) {
  const pathname = usePathname()
  const pageName = pageNames[pathname] ?? 'Pricing Intelligence'

  return <header className="alpha-header">
    <div className="alpha-header-left">
      <Button variant="ghost" size="icon" className="alpha-menu-button" aria-label="Mở điều hướng" aria-expanded={sidebarOpen} onClick={onToggle}><AdminIcon name="panelLeft" /></Button>
      <Separator orientation="vertical" className="alpha-header-separator" />
      <div className="alpha-breadcrumbs"><span>Workspace</span><AdminIcon name="chevronRight" /><strong>{pageName}</strong></div>
    </div>
    <div className="alpha-header-meta"><span className="alpha-status-dot" /> <span>Chỉ đọc dữ liệu</span></div>
  </header>
}
