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

test('direct chat by username opens and shows realtime unread badge', async ({ page, browser }) => {
  const alice = `alice${Date.now()}`
  const bob = `bob${Date.now()}`
  const password = 'pass12345'
  const text = `dm-${Date.now()}`

  await register(page, alice, password)

  const bobContext = await browser.newContext()
  const bobPage = await bobContext.newPage()
  await register(bobPage, bob, password)

  await bobPage.goto(`/users/${encodeURIComponent(alice)}`)
  await bobPage.locator('.actions .btn.primary').first().click()
  await expect(bobPage).toHaveURL(`/direct/@${encodeURIComponent(alice)}`)

  const input = bobPage.locator('.chat-input input').first()
  await expect(input).toBeVisible({ timeout: 15_000 })
  await input.fill(text)
  await bobPage.locator('.chat-input button').first().click()
  await expect(bobPage.getByText(text)).toBeVisible()

  await expect(page.locator('.link-with-badge .badge')).toHaveText('1')

  await page.goto(`/direct/@${encodeURIComponent(bob)}`)
  await expect(page.locator('.chat')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.link-with-badge .badge')).toHaveCount(0)

  await bobPage.goto('/direct')
  await expect(bobPage.getByText(alice)).toBeVisible()

  await bobContext.close()
})
