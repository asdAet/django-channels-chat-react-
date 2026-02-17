import type { ReactNode } from 'react'

import styles from '../../styles/ui/Panel.module.css'

type PanelProps = {
  muted?: boolean
  busy?: boolean
  className?: string
  children: ReactNode
}

/**
 * Вспомогательный панельный контейнер для состояний и подсказок.
 * @param props Содержимое и модификаторы панели.
 * @returns JSX-блок панели.
 */
export function Panel({ muted = false, busy = false, className, children }: PanelProps) {
  return (
    <div className={[styles.panel, muted ? styles.muted : '', className].filter(Boolean).join(' ')} aria-busy={busy}>
      {children}
    </div>
  )
}

