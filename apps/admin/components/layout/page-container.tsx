import type { ReactNode } from 'react'

/** Adapted from the upstream PageContainer to keep future admin pages on one scroller. */
export function PageContainer ({ children, title, description, loading = false }: { children: ReactNode, title?: string, description?: string, loading?: boolean }) {
  return <div className="alpha-page-container">
    {(title || description) ? <div className="alpha-page-heading"><div>{title ? <h1>{title}</h1> : null}{description ? <p>{description}</p> : null}</div></div> : null}
    {loading ? <div className="alpha-page-skeleton" role="status" aria-label="Đang tải trang"><span /><span /><span /></div> : children}
  </div>
}
