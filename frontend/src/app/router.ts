export type Route =
  | { name: 'home' }
  | { name: 'login' }
  | { name: 'register' }
  | { name: 'profile' }
  | { name: 'user'; username: string }
  | { name: 'room'; slug: string }

export const parseRoute = (pathname: string): Route => {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  if (normalized === '/login') return { name: 'login' }
  if (normalized === '/register') return { name: 'register' }
  if (normalized === '/profile') return { name: 'profile' }
  if (normalized.startsWith('/users/')) {
    const username = decodeURIComponent(normalized.replace('/users/', '') || '')
    return { name: 'user', username }
  }
  if (normalized.startsWith('/rooms/')) {
    const slug = decodeURIComponent(normalized.replace('/rooms/', '') || '')
    return { name: 'room', slug }
  }
  return { name: 'home' }
}

export const navigate = (path: string, setRoute: (route: Route) => void) => {
  if (path !== window.location.pathname) {
    window.history.pushState({}, '', path)
  }
  setRoute(parseRoute(path))
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
