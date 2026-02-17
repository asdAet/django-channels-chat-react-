import type { FormEvent } from 'react'
import { useState } from 'react'

import { USERNAME_MAX_LENGTH } from '../../shared/config/limits'
import { Button, Card, Toast } from '../../shared/ui'
import styles from './AuthForm.module.css'

type AuthFormProps = {
  title: string
  submitLabel: string
  onSubmit: (username: string, password: string, confirm?: string) => void
  onNavigate: (path: string) => void
  requireConfirm?: boolean
  error?: string | null
  passwordRules?: string[]
  className?: string
}

/**
 * Универсальная форма аутентификации для входа и регистрации.
 * @param props Параметры формы и обработчики действий.
 * @returns JSX-разметка формы аутентификации.
 */
export function AuthForm({
  title,
  submitLabel,
  onSubmit,
  onNavigate,
  requireConfirm = false,
  error = null,
  passwordRules = [],
  className,
}: AuthFormProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!username.trim() || !password) return
    onSubmit(username.trim(), password, confirm)
  }

  return (
    <div className={[styles.auth, className].filter(Boolean).join(' ')}>
      <Card wide className={styles.card}>
        <p className={styles.eyebrow}>{title}</p>
        <h2 className={styles.title}>{submitLabel}</h2>
        {error && (
          <Toast variant="danger" role="alert">
            {error}
          </Toast>
        )}
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>Имя пользователя</span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              maxLength={USERNAME_MAX_LENGTH}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>Пароль</span>
            <input
              type="password"
              autoComplete={requireConfirm ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {requireConfirm && (
            <label className={styles.field}>
              <span>Повторите пароль</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
          )}
          {requireConfirm && passwordRules.length > 0 && (
            <div className={styles.passwordRules}>
              <p className={styles.note}>Пароль должен соответствовать требованиям:</p>
              <ul className={styles.ticks}>
                {passwordRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          )}
          <Button variant="primary" type="submit">
            {submitLabel}
          </Button>
        </form>
        <div className={styles.authSwitch}>
          {title === 'Вход' ? (
            <p>
              Нет аккаунта?{' '}
              <Button variant="link" onClick={() => onNavigate('/register')} className={styles.switchButton}>
                Зарегистрироваться
              </Button>
            </p>
          ) : (
            <p>
              Уже есть аккаунт?{' '}
              <Button variant="link" onClick={() => onNavigate('/login')} className={styles.switchButton}>
                Войти
              </Button>
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}

