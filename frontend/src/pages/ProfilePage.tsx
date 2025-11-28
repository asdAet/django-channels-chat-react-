import { useEffect, useState } from 'react'
import { avatarFallback } from '../shared/lib/format'
import type { UserProfile } from '../entities/user/types'

type Props = {
  user: UserProfile | null
  onSave: (fields: {
    username: string
    email: string
    firstName: string
    lastName: string
    image?: File | null
  }) => void
  onNavigate: (path: string) => void
}

export function ProfilePage({ user, onSave, onNavigate }: Props) {
  const [form, setForm] = useState({
    username: user?.username || '',
    email: user?.email || '',
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
  })
  const [image, setImage] = useState<File | null>(null)

  if (!user) {
    return (
      <div className="panel">
        <p>Нужно войти, чтобы редактировать профиль.</p>
        <div className="actions">
          <button className="btn primary" onClick={() => onNavigate('/login')}>
            Войти
          </button>
          <button className="btn ghost" onClick={() => onNavigate('/register')}>
            Регистрация
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="card wide">
      <div className="card-header">
        <div>
          <p className="eyebrow">Профиль</p>
          <h3>Обновить данные и аватар</h3>
        </div>
        <div className="avatar">
          {user.profileImage ? (
            <img src={user.profileImage} alt={user.username} />
          ) : (
            <span>{avatarFallback(user.username)}</span>
          )}
        </div>
      </div>
      <form
        className="form two-col"
        onSubmit={(event) => {
          event.preventDefault()
          onSave({ ...form, image })
        }}
      >
        <label className="field">
          <span>Имя пользователя</span>
          <input
            type="text"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Имя</span>
          <input
            type="text"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Фамилия</span>
          <input
            type="text"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
        </label>
        <label className="field full">
          <span>Новый аватар</span>
          <input type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] || null)} />
        </label>
        <div className="actions">
          <button className="btn primary" type="submit">
            Сохранить
          </button>
          <button className="btn ghost" type="button" onClick={() => onNavigate('/')}>
            На главную
          </button>
        </div>
      </form>
    </div>
  )
}
