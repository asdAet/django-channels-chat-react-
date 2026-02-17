import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LoginPage } from './LoginPage'

describe('LoginPage', () => {
  it('submits credentials', () => {
    const onSubmit = vi.fn()
    render(<LoginPage onSubmit={onSubmit} onNavigate={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Имя пользователя'), { target: { value: 'demo' } })
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }))

    expect(onSubmit).toHaveBeenCalledWith('demo', 'secret')
  })
})

