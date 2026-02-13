export const formatTimestamp = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))

export const formatDayLabel = (date: Date, now: Date = new Date()) => {
  if (Number.isNaN(date.getTime())) return ''
  const includeYear = date.getFullYear() !== now.getFullYear()
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
  if (includeYear) {
    options.year = 'numeric'
  }
  return new Intl.DateTimeFormat('ru-RU', options).format(date)
}

export const avatarFallback = (username: string) =>
  username ? username[0].toUpperCase() : '?'

export const formatRegistrationDate = (iso: string | null) => {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

export const formatLastSeen = (iso: string | null) => {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  if (diffMs >= 0 && diffMs < 2 * 60 * 1000) {
    return 'в сети недавно'
  }

  const time = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) {
    return `сегодня в ${time}`
  }

  const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long' }
  if (date.getFullYear() !== now.getFullYear()) {
    options.year = 'numeric'
  }
  const datePart = new Intl.DateTimeFormat('ru-RU', options).format(date)
  return `${datePart} в ${time}`
}
