import { expect, test, type Page } from '@playwright/test'

async function register(page: Page, username: string, password: string) {
  await page.goto('/register')
  await page.locator('input[type="text"]').first().fill(username)
  const passwordInputs = page.locator('input[type="password"]')
  await passwordInputs.nth(0).fill(password)
  await passwordInputs.nth(1).fill(password)

  await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/api/auth/register/') && response.request().method() === 'POST',
    ),
    page.locator('form button[type="submit"]').click(),
  ])

  await expect(page).toHaveURL('/')
}

test('register and login flow keeps session', async ({ page }) => {
  const username = `u${Date.now()}`
  const password = 'pass12345'

  await register(page, username, password)

  await page.goto('/profile')
  await expect(page.locator('input[type="text"]').first()).toHaveValue(username)

  await page.goto(`/users/${encodeURIComponent(username)}`)
  await page.getByTestId('logout-button').click()
  await expect(page).toHaveURL('/login')

  await page.locator('input[type="text"]').first().fill(username)
  await page.locator('input[type="password"]').first().fill(password)

  await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/api/auth/login/') && response.request().method() === 'POST',
    ),
    page.locator('form button[type="submit"]').click(),
  ])

  await expect(page).toHaveURL('/')
})
