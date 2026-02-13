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

test('profile update works with validation and save', async ({ page }) => {
  const username = `p${Date.now()}`
  const password = 'pass12345'
  const nextBio = 'Updated profile bio text'

  await register(page, username, password)

  await page.goto('/profile')
  const bioField = page.locator('textarea').first()
  await expect(bioField).toBeVisible()
  await bioField.fill(nextBio)
  await page.locator('.actions .btn.primary[type="submit"]').click()

  await expect(page).toHaveURL(`/users/${encodeURIComponent(username)}`)
  await expect(page.getByText(nextBio)).toBeVisible()
})
