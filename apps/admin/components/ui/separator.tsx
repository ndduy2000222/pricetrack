import type { HTMLAttributes } from 'react'

export function Separator ({ orientation = 'horizontal', className, ...props }: HTMLAttributes<HTMLDivElement> & { orientation?: 'horizontal' | 'vertical' }) {
  return <div data-slot="separator" data-orientation={orientation} role="separator" className={['alpha-separator', className].filter(Boolean).join(' ')} {...props} />
}
