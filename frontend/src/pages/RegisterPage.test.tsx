import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RegisterPage } from './RegisterPage'

describe('RegisterPage', () => {
  it('submits registration payload with confirmation', () => {
    const onSubmit = vi.fn()
    render(<RegisterPage onSubmit={onSubmit} onNavigate={vi.fn()} passwordRules={['rule']} />)

    fireEvent.change(screen.getByLabelText('Имя пользователя'), { target: { value: 'newuser' } })
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'secret123' } })
    fireEvent.change(screen.getByLabelText('Повторите пароль'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }))

    expect(onSubmit).toHaveBeenCalledWith('newuser', 'secret123', 'secret123')
  })
})

