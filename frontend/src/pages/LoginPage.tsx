import { AuthForm } from '../widgets/auth/AuthForm'
import styles from '../styles/pages/LoginPage.module.css'

type Props = {
  onSubmit: (username: string, password: string) => void
  onNavigate: (path: string) => void
  error?: string | null
}

/**
 * Страница входа пользователя.
 * @param props Обработчики формы входа и навигации.
 * @returns JSX-разметка страницы входа.
 */
export function LoginPage({ onSubmit, onNavigate, error = null }: Props) {
  return (
    <AuthForm
      title="Вход"
      submitLabel="Войти"
      onSubmit={(username, password) => onSubmit(username, password)}
      onNavigate={onNavigate}
      error={error}
      className={styles.page}
    />
  )
}
