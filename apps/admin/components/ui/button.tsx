import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm'

const buttonVariants: Record<ButtonVariant, string> = {
  default: 'alpha-button-default',
  outline: 'alpha-button-outline',
  secondary: 'alpha-button-secondary',
  ghost: 'alpha-button-ghost',
  destructive: 'alpha-button-destructive',
  link: 'alpha-button-link'
}

const buttonSizes: Record<ButtonSize, string> = {
  default: 'alpha-button-default-size',
  sm: 'alpha-button-sm-size',
  lg: 'alpha-button-lg-size',
  icon: 'alpha-button-icon-size',
  'icon-sm': 'alpha-button-icon-sm-size'
}

function joinClassNames (...names: Array<string | undefined | false>) {
  return names.filter(Boolean).join(' ')
}

/**
 * Native equivalent of the reference button primitive.
 * The variant/size API follows the upstream shadcn/Base UI contract without
 * pulling the reference app's large dependency surface into this app.
 */
export function Button ({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}) {
  return <button data-slot="button" className={joinClassNames('alpha-button', buttonVariants[variant], buttonSizes[size], className)} {...props} />
}

export { buttonVariants }
