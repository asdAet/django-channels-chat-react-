import { useEffect, useRef, useState } from 'react';
import { avatarFallback } from '../shared/lib/format';
import type { UserProfile } from '../entities/user/types';

type Props = {
  user: UserProfile | null;
  onLogout: () => void;
  onSave: (fields: {
    username: string;
    email: string;
    image?: File | null;
    bio?: string;
  }) => void;
  onNavigate: (path: string) => void;
};

export function ProfilePage({ user, onSave, onNavigate, onLogout}: Props) {
  const [form, setForm] = useState({
    username: user?.username || '',
    email: user?.email || '',
    bio: user?.bio || '',
  });
  const isUsernameValid = form.username.trim().length > 0;
  const isBioValid = form.bio.length <= 1000;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    user?.profileImage || null
  );

  useEffect(() => {
    // Clean blob URLs on unmount or when preview changes
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

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
    );
  }

  return (
    <div className="card wide">
      <div>
        <p className="eyebrow_profile">Профиль</p>
      </div>

      <div className="profile_avatar_wrapper">
        <div
          className="profile_avatar"
          role="button"
          tabIndex={0}
          aria-label="Загрузить фото профиля"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          {previewUrl ? (
            <img src={previewUrl} alt={user.username} />
          ) : (
            <span>{avatarFallback(user.username)}</span>
          )}
          <div className="avatar_overlay"></div>
        </div>

        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0] || null;
            setImage(file);
            setPreviewUrl((prev) => {
              if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
              return file
                ? URL.createObjectURL(file)
                : user?.profileImage || null;
            });
          }}
        />
      </div>

      <form
        className="form two-col"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ ...form, image, bio: form.bio });
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
        <label className="field full">
          <span>О себе</span>
          <textarea
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            placeholder="Расскажите пару слов о себе"
          />
          {!isBioValid && (
            <span className="note warning">Максимум 1000 символов.</span>
          )}
        </label>
        <div className="actions">
          <button className="btn primary" type="submit" disabled={!isUsernameValid || !isBioValid}>
            Сохранить
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={() => onNavigate('/')}
          >
            На главную
          </button>

          <button className="btn logaut" type="button" onClick={onLogout}>
            Выйти
          </button>
        </div>
      </form>
    </div>
  );
}
