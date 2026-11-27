'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AdminIcon, type AdminIconName } from './icons'

export type AdminNavItem = { title: string, url: string, icon: AdminIconName, description?: string }

function isActivePath (pathname: string, url: string) {
  return pathname === url || (url !== '/' && pathname.startsWith(`${url}/`))
}

export function NavMain ({ groups, onNavigate }: { groups: Array<{ label: string, items: AdminNavItem[] }>, onNavigate?: () => void }) {
  const pathname = usePathname()

  return <div className="alpha-nav-groups">
    {groups.map((group) => <section className="alpha-nav-group" key={group.label}>
      <p className="alpha-nav-label">{group.label}</p>
      <nav aria-label={group.label}>
        {group.items.map((item) => {
          const active = isActivePath(pathname, item.url)
          return <Link className={`alpha-nav-item${active ? ' is-active' : ''}`} href={item.url} key={item.title} aria-current={active ? 'page' : undefined} onClick={onNavigate}>
            <AdminIcon name={item.icon} />
            <span><strong>{item.title}</strong>{item.description ? <small>{item.description}</small> : null}</span>
          </Link>
        })}
      </nav>
    </section>)}
  </div>
}
