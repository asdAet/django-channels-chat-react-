import { useEffect, useRef, useState } from 'react'

import type { UserProfile } from '../entities/user/types'
import { usePresence } from '../shared/presence'
import { avatarFallback, formatLastSeen, formatRegistrationDate } from '../shared/lib/format'
import { USERNAME_MAX_LENGTH } from '../shared/config/limits'
import { Button, Card, Toast, Panel } from '../shared/ui'
import styles from '../styles/pages/ProfilePage.module.css'

type SaveResult =
  | { ok: true }
  | { ok: false; errors?: Record<string, string[]>; message?: string }

type Props = {
  user: UserProfile | null
  onSave: (fields: {
    username: string
    email: string
    image?: File | null
    bio?: string
  }) => Promise<SaveResult>
  onNavigate: (path: string) => void
}

/**
 * Страница редактирования собственного профиля.
 * @param props Данные пользователя и обработчики сохранения/навигации.
 * @returns JSX-страница профиля.
 */
export function ProfilePage({ user, onSave, onNavigate }: Props) {
  const { online: presenceOnline, status: presenceStatus } = usePresence()
  const [form, setForm] = useState({
    username: user?.username || '',
    email: user?.email || '',
    bio: user?.bio || '',
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const trimmedUsername = form.username.trim()
  const isUsernameTooLong = trimmedUsername.length > USERNAME_MAX_LENGTH
  const isUsernameValid =
    trimmedUsername.length > 0 && trimmedUsername.length <= USERNAME_MAX_LENGTH
  const isBioValid = form.bio.length <= 1000

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [image, setImage] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(user?.profileImage || null)

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  useEffect(() => {
    if (!formError) return
    if (!formError.includes('Проверьте введённые данные')) return
    const timeoutId = window.setTimeout(() => setFormError(null), 4200)
    return () => window.clearTimeout(timeoutId)
  }, [formError])

  if (!user) {
    return (
      <Panel>
        <p>Нужно войти, чтобы редактировать профиль.</p>
        <div className={styles.actions}>
          <Button variant="primary" onClick={() => onNavigate('/login')}>
            Войти
          </Button>
          <Button variant="ghost" onClick={() => onNavigate('/register')}>
            Регистрация
          </Button>
        </div>
      </Panel>
    )
  }

  const usernameError = fieldErrors.username?.[0]
  const emailError = fieldErrors.email?.[0]
  const bioError = fieldErrors.bio?.[0]
  const imageError = fieldErrors.image?.[0]
  const genericError =
    formError || fieldErrors.non_field_errors?.[0] || fieldErrors.__all__?.[0]
  const isUserOnline =
    Boolean(user) &&
    presenceStatus === 'online' &&
    presenceOnline.some((entry) => entry.username === user?.username)

  return (
    <Card wide>
      <div className={styles.profileHeader}>
        <p className={styles.eyebrowProfile}>Профиль</p>
        <div className={styles.profileMeta}>
          {isUserOnline ? (
            <span>В сети</span>
          ) : (
            <span>Последний раз в сети: {formatLastSeen(user.lastSeen) || '—'}</span>
          )}
          <span>Зарегистрирован: {formatRegistrationDate(user.registeredAt) || '—'}</span>
        </div>
      </div>

      {genericError && (
        <Toast variant="danger" role="alert">
          {genericError}
        </Toast>
      )}

      <div
        className={[styles.profileAvatarWrapper, isUserOnline ? styles.online : ''].filter(Boolean).join(' ')}
        data-online={isUserOnline ? 'true' : 'false'}
      >
        <div
          className={styles.profileAvatar}
          role="button"
          tabIndex={0}
          aria-label="Загрузить фото профиля"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              fileInputRef.current?.click()
            }
          }}
        >
          {previewUrl ? (
            <img src={previewUrl} alt={user.username} />
          ) : (
            <span>{avatarFallback(user.username)}</span>
          )}
          <div className={styles.avatarOverlay} />
        </div>

        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          className={styles.hiddenInput}
          onChange={(event) => {
            const file = event.target.files?.[0] || null
            setImage(file)
            setFormError(null)
            clearFieldError('image')
            setPreviewUrl((prev) => {
              if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev)
              return file ? URL.createObjectURL(file) : user?.profileImage || null
            })
          }}
        />
      </div>
      {imageError && <p className={[styles.note, styles.errorNote].join(' ')}>{imageError}</p>}

      <form
        className={styles.form}
        onSubmit={async (event) => {
          event.preventDefault()
          setFormError(null)
          const result = await onSave({ ...form, image, bio: form.bio })
          if (result.ok) {
            setFieldErrors({})
            return
          }
          if (result.errors) {
            setFieldErrors(result.errors)
          } else {
            setFieldErrors({})
          }
          if (result.message) {
            setFormError(result.message)
          }
        }}
      >
        <label className={[styles.field, usernameError ? styles.fieldError : ''].filter(Boolean).join(' ')}>
          <span>Имя пользователя</span>
          <input
            type="text"
            value={form.username}
            maxLength={USERNAME_MAX_LENGTH}
            onChange={(event) => {
              setForm({ ...form, username: event.target.value })
              setFormError(null)
              clearFieldError('username')
            }}
          />
          {isUsernameTooLong && (
            <span className={[styles.note, styles.warningNote].join(' ')}>
              Максимум {USERNAME_MAX_LENGTH} символов.
            </span>
          )}
          {usernameError && <span className={[styles.note, styles.errorNote].join(' ')}>{usernameError}</span>}
        </label>

        <label className={[styles.field, emailError ? styles.fieldError : ''].filter(Boolean).join(' ')}>
          <span>Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) => {
              setForm({ ...form, email: event.target.value })
              setFormError(null)
              clearFieldError('email')
            }}
          />
          {emailError && <span className={[styles.note, styles.errorNote].join(' ')}>{emailError}</span>}
        </label>

        <label className={[styles.field, styles.fullField, bioError ? styles.fieldError : ''].filter(Boolean).join(' ')}>
          <span>О себе</span>
          <textarea
            value={form.bio}
            onChange={(event) => {
              setForm({ ...form, bio: event.target.value })
              setFormError(null)
              clearFieldError('bio')
            }}
            placeholder="Расскажите пару слов о себе"
          />
          {!isBioValid && <span className={[styles.note, styles.warningNote].join(' ')}>Максимум 1000 символов.</span>}
          {bioError && <span className={[styles.note, styles.errorNote].join(' ')}>{bioError}</span>}
        </label>

        <div className={styles.actions}>
          <Button variant="link" type="submit" data-testid="profile-save-button" disabled={!isUsernameValid || !isBioValid} className={styles.successLink}>
            Сохранить
          </Button>
          <Button variant="link" onClick={() => onNavigate('/')}>
            На главную
          </Button>
        </div>
      </form>
    </Card>
  )
}
