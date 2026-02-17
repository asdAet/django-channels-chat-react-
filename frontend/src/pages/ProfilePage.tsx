import { useEffect, useRef, useState } from "react";
import {
  avatarFallback,
  formatLastSeen,
  formatRegistrationDate,
} from "../shared/lib/format";
import { usePresence } from "../shared/presence";
import type { UserProfile } from "../entities/user/types";
import { USERNAME_MAX_LENGTH } from "../shared/config/limits";

type SaveResult =
  | { ok: true }
  | { ok: false; errors?: Record<string, string[]>; message?: string };

type Props = {
  user: UserProfile | null;
  onSave: (fields: {
    username: string;
    email: string;
    image?: File | null;
    bio?: string;
  }) => Promise<SaveResult>;
  onNavigate: (path: string) => void;
  onLogout?: () => void;
};

/**
 * Рендерит компонент `ProfilePage` и связанную разметку.
 * @param props Входной параметр `props`.
 * @returns Результат выполнения `ProfilePage`.
 */

export function ProfilePage({ user, onSave, onNavigate, onLogout }: Props) {
  const { online: presenceOnline, status: presenceStatus } = usePresence();
  const [form, setForm] = useState({
    username: user?.username || "",
    email: user?.email || "",
    bio: user?.bio || "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const trimmedUsername = form.username.trim();
  const isUsernameTooLong = trimmedUsername.length > USERNAME_MAX_LENGTH;
  const isUsernameValid =
    trimmedUsername.length > 0 && trimmedUsername.length <= USERNAME_MAX_LENGTH;
  const isBioValid = form.bio.length <= 1000;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    user?.profileImage || null,
  );

  const clearFieldError = (field: string) => {
    /**
     * Выполняет метод `setFieldErrors`.
     * @returns Результат выполнения `setFieldErrors`.
     */

    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  /**
   * Выполняет метод `useEffect`.
   * @param props Входной параметр `props`.
   * @returns Результат выполнения `useEffect`.
   */

  useEffect(() => {
    // Clean blob URLs on unmount or when preview changes
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  /**
   * Выполняет метод `useEffect`.
   * @param props Входной параметр `props`.
   * @returns Результат выполнения `useEffect`.
   */

  useEffect(() => {
    if (!formError) return;
    if (!formError.includes("Проверьте введённые данные")) return;
    const t = window.setTimeout(() => setFormError(null), 4200);
    return () => window.clearTimeout(t);
  }, [formError]);

  if (!user) {
    return (
      <div className="panel">
        <p>Нужно войти, чтобы редактировать профиль.</p>
        <div className="actions">
          <button className="btn primary" onClick={() => onNavigate("/login")}>
            Войти
          </button>
          <button className="btn ghost" onClick={() => onNavigate("/register")}>
            Регистрация
          </button>
        </div>
      </div>
    );
  }

  const usernameError = fieldErrors.username?.[0];
  const emailError = fieldErrors.email?.[0];
  const bioError = fieldErrors.bio?.[0];
  const imageError = fieldErrors.image?.[0];
  const genericError =
    formError || fieldErrors.non_field_errors?.[0] || fieldErrors.__all__?.[0];
  const isUserOnline =
    /**
     * Выполняет метод `Boolean`.
     * @param user Входной параметр `user`.
     * @returns Результат выполнения `Boolean`.
     */

    Boolean(user) &&
    presenceStatus === "online" &&
    presenceOnline.some((entry) => entry.username === user?.username);

  return (
    <div className="card wide">
      <div className="profile_header">
        <p className="eyebrow_profile">Профиль</p>
        <div className="profile_meta">
          {isUserOnline ? (
            <span>В сети</span>
          ) : (
            <span>
              Последний раз в сети: {formatLastSeen(user.lastSeen) || "—"}
            </span>
          )}
          <span>
            Зарегистрирован: {formatRegistrationDate(user.registeredAt) || "—"}
          </span>
        </div>
      </div>

      {genericError && (
        <div className="toast danger" role="alert">
          {genericError}
        </div>
      )}

      <div className={`profile_avatar_wrapper${isUserOnline ? " is-online" : ""}`}>
        <div
          className="profile_avatar"
          role="button"
          tabIndex={0}
          aria-label="Загрузить фото профиля"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
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
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0] || null;
            /**
             * Выполняет метод `setImage`.
             * @param file Входной параметр `file`.
             * @returns Результат выполнения `setImage`.
             */

            setImage(file);
            /**
             * Выполняет метод `setFormError`.
             * @param null Входной параметр `null`.
             * @returns Результат выполнения `setFormError`.
             */

            setFormError(null);
            /**
             * Выполняет метод `clearFieldError`.
             * @returns Результат выполнения `clearFieldError`.
             */

            clearFieldError("image");
            /**
             * Выполняет метод `setPreviewUrl`.
             * @returns Результат выполнения `setPreviewUrl`.
             */

            setPreviewUrl((prev) => {
              if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
              return file
                ? URL.createObjectURL(file)
                : user?.profileImage || null;
            });
          }}
        />
      </div>
      {imageError && <p className="note error">{imageError}</p>}

      <form
        className="form two-col"
        onSubmit={async (event) => {
          event.preventDefault();
          /**
           * Выполняет метод `setFormError`.
           * @param null Входной параметр `null`.
           * @returns Результат выполнения `setFormError`.
           */

          setFormError(null);
          const result = await onSave({ ...form, image, bio: form.bio });
          if (result.ok) {
            /**
             * Выполняет метод `setFieldErrors`.
             * @param props Входной параметр `props`.
             * @returns Результат выполнения `setFieldErrors`.
             */

            setFieldErrors({});
            return;
          }
          if (result.errors) {
            /**
             * Выполняет метод `setFieldErrors`.
             * @returns Результат выполнения `setFieldErrors`.
             */

            setFieldErrors(result.errors);
          } else {
            /**
             * Выполняет метод `setFieldErrors`.
             * @param props Входной параметр `props`.
             * @returns Результат выполнения `setFieldErrors`.
             */

            setFieldErrors({});
          }
          if (result.message) {
            /**
             * Выполняет метод `setFormError`.
             * @returns Результат выполнения `setFormError`.
             */

            setFormError(result.message);
          }
        }}
      >
        <label className={`field ${usernameError ? "error" : ""}`}>
          <span>Имя пользователя</span>
          <input
            type="text"
            value={form.username}
            maxLength={USERNAME_MAX_LENGTH}
            onChange={(e) => {
              /**
               * Выполняет метод `setForm`.
               * @param props Входной параметр `props`.
               * @returns Результат выполнения `setForm`.
               */

              setForm({ ...form, username: e.target.value });
              /**
               * Выполняет метод `setFormError`.
               * @param null Входной параметр `null`.
               * @returns Результат выполнения `setFormError`.
               */

              setFormError(null);
              /**
               * Выполняет метод `clearFieldError`.
               * @returns Результат выполнения `clearFieldError`.
               */

              clearFieldError("username");
            }}
          />
          {isUsernameTooLong && (
            <span className="note warning">
              Максимум {USERNAME_MAX_LENGTH} символов.
            </span>
          )}
          {usernameError && <span className="note error">{usernameError}</span>}
        </label>
        <label className={`field ${emailError ? "error" : ""}`}>
          <span>Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => {
              /**
               * Выполняет метод `setForm`.
               * @param props Входной параметр `props`.
               * @returns Результат выполнения `setForm`.
               */

              setForm({ ...form, email: e.target.value });
              /**
               * Выполняет метод `setFormError`.
               * @param null Входной параметр `null`.
               * @returns Результат выполнения `setFormError`.
               */

              setFormError(null);
              /**
               * Выполняет метод `clearFieldError`.
               * @returns Результат выполнения `clearFieldError`.
               */

              clearFieldError("email");
            }}
          />
          {emailError && <span className="note error">{emailError}</span>}
        </label>
        <label className={`field full ${bioError ? "error" : ""}`}>
          <span>О себе</span>
          <textarea
            value={form.bio}
            onChange={(e) => {
              /**
               * Выполняет метод `setForm`.
               * @param props Входной параметр `props`.
               * @returns Результат выполнения `setForm`.
               */

              setForm({ ...form, bio: e.target.value });
              /**
               * Выполняет метод `setFormError`.
               * @param null Входной параметр `null`.
               * @returns Результат выполнения `setFormError`.
               */

              setFormError(null);
              /**
               * Выполняет метод `clearFieldError`.
               * @returns Результат выполнения `clearFieldError`.
               */

              clearFieldError("bio");
            }}
            placeholder="Расскажите пару слов о себе"
          />
          {!isBioValid && (
            <span className="note warning">Максимум 1000 символов.</span>
          )}
          {bioError && <span className="note error">{bioError}</span>}
        </label>
        <div className="actions">
          <button
            className="btn primary"
            type="submit"
            disabled={!isUsernameValid || !isBioValid}
          >
            Сохранить
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={() => onNavigate("/")}
          >
            На главную
          </button>
          {onLogout && (
            <button className="btn logaut" type="button" onClick={onLogout}>
              Выйти
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
