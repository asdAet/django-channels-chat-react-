import type { ReactNode } from 'react'

import styles from '../../styles/ui/Toast.module.css'

type ToastVariant = 'success' | 'danger' | 'warning'

type ToastProps = {
  variant: ToastVariant
  role?: 'status' | 'alert'
  className?: string
  children: ReactNode
}

const variantClassMap: Record<ToastVariant, string> = {
  success: styles.success,
  danger: styles.danger,
  warning: styles.warning,
}

/**
 * Всплывающее уведомление с вариантами по важности.
 * @param props Вариант уведомления и отображаемое содержимое.
 * @returns JSX-блок уведомления.
 */
export function Toast({ variant, role = 'status', className, children }: ToastProps) {
  return (
    <div className={[styles.toast, variantClassMap[variant], className].filter(Boolean).join(' ')} role={role}>
      {children}
    </div>
  )
}

