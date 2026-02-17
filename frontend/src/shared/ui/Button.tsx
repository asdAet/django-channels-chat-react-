import type { ButtonHTMLAttributes } from 'react'

import styles from '../../styles/ui/Button.module.css'

type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'link' | 'dangerLink'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  fullWidth?: boolean
}

const variantClassMap: Record<ButtonVariant, string> = {
  primary: styles.primary,
  ghost: styles.ghost,
  outline: styles.outline,
  link: styles.link,
  dangerLink: styles.dangerLink,
}

/**
 * Универсальная кнопка интерфейса с вариантами оформления.
 * @param props HTML-параметры кнопки и UI-модификаторы.
 * @returns JSX-кнопка с модульными стилями.
 */
export function Button({
  variant = 'primary',
  fullWidth = false,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[styles.button, variantClassMap[variant], fullWidth ? styles.fullWidth : '', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  )
}

