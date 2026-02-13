import { describe, expect, it, vi } from 'vitest'

import { navigate, parseRoute } from './router'

describe('router', () => {
  it('parses known routes and trims trailing slash', () => {
    expect(parseRoute('/')).toEqual({ name: 'home' })
    expect(parseRoute('/login/')).toEqual({ name: 'login' })
    expect(parseRoute('/register/')).toEqual({ name: 'register' })
    expect(parseRoute('/profile/')).toEqual({ name: 'profile' })
    expect(parseRoute('/direct/')).toEqual({ name: 'directInbox' })
    expect(parseRoute('/rooms/public/')).toEqual({ name: 'room', slug: 'public' })
  })

  it('parses direct username route', () => {
    expect(parseRoute('/direct/@alice')).toEqual({ name: 'directByUsername', username: 'alice' })
    expect(parseRoute('/direct/@user%20name')).toEqual({ name: 'directByUsername', username: 'user name' })
  })

  it('returns home for invalid room slug and malformed direct path', () => {
    expect(parseRoute('/rooms/a')).toEqual({ name: 'home' })
    expect(parseRoute('/rooms/public/bad')).toEqual({ name: 'home' })
    expect(parseRoute('/direct/@')).toEqual({ name: 'home' })
    expect(parseRoute('/direct/@alice/extra')).toEqual({ name: 'home' })
  })

  it('parses user route with url decoding', () => {
    expect(parseRoute('/users/test%20user')).toEqual({ name: 'user', username: 'test user' })
  })

  it('navigate updates history and route state', () => {
    const replaceSpy = vi.spyOn(window.history, 'pushState')
    const setRoute = vi.fn()

    navigate('/rooms/public', setRoute)

    expect(replaceSpy).toHaveBeenCalled()
    expect(setRoute).toHaveBeenCalledWith({ name: 'room', slug: 'public' })
  })
})
