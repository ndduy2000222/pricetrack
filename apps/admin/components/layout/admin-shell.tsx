'use client'

import { useState, type ReactNode } from 'react'
import { AdminHeader } from './admin-header'
import { AdminSidebar } from './admin-sidebar'

/**
 * Adapted from the upstream Kiranism app shell: inset sidebar, single page
 * scroller, mobile overlay, and a compact header. Every admin route uses this
 * shared foundation so navigation and application chrome stay consistent.
 */
export function AdminShell ({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return <div className="alpha-shell">
    <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    <button className={`alpha-sidebar-overlay${sidebarOpen ? ' is-visible' : ''}`} type="button" aria-label="Đóng điều hướng" onClick={() => setSidebarOpen(false)} />
    <main className="alpha-shell-main">
      <AdminHeader sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((open) => !open)} />
      <div className="alpha-shell-content">{children}</div>
    </main>
  </div>
}
