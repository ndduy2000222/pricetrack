import type { SVGProps } from 'react'

export type AdminIconName = 'book' | 'chart' | 'chevronRight' | 'database' | 'menu' | 'panelLeft' | 'shield' | 'store' | 'x'

const paths: Record<AdminIconName, React.ReactNode> = {
  book: <><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 4.5v17M8 6h8" /></>,
  chart: <><path d="M4 19V5M4 19h17M7 15l4-4 3 2 5-6" /></>,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  panelLeft: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
  shield: <><path d="M12 3 20 6v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
  store: <><path d="M4 10v10h16V10M3 10l2-6h14l2 6" /><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 20v-6h6v6" /></>,
  x: <><path d="m6 6 12 12M18 6 6 18" /></>
}

export function AdminIcon ({ name, ...props }: SVGProps<SVGSVGElement> & { name: AdminIconName }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>
}
