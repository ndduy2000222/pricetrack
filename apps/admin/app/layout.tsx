import type { Metadata } from 'next'
import './globals.css'
import './market-workspace.css'
import { AdminShell } from '../components/layout/admin-shell'

export const metadata: Metadata = {
  title: 'Alpha Books Price Control',
  description: 'Công cụ vận hành giá cạnh tranh cho Alpha Books'
}

export default function RootLayout ({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body><AdminShell>{children}</AdminShell></body>
    </html>
  )
}
