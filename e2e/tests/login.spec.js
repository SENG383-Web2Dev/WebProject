import { test, expect } from '@playwright/test'
import { USERS, login } from './helpers.js'

// M1 Login and roles (FR-M1-01, FR-M1-05, FR-M1-06)
test.describe('Login', () => {
  for (const user of Object.values(USERS)) {
    test(`${user.role.toLowerCase()} logs in and lands on their own home page`, async ({ page }) => {
      await login(page, user)

      await expect(page.getByRole('heading', { level: 1, name: user.heading })).toBeVisible()
      await expect(page.getByText(`${user.name} (${user.role})`)).toBeVisible()
    })
  }

  test('a wrong password shows an error and stays on the login page', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(USERS.parent.email)
    await page.getByLabel('Password').fill('not-the-password')
    await page.getByRole('button', { name: 'Log in' }).click()

    await expect(page.getByRole('alert')).toHaveText('Wrong email or password.')
    await expect(page).toHaveURL('/login')
  })

  test("the child cannot open the parent's page", async ({ page }) => {
    await login(page, USERS.child)

    await page.goto('/parent')

    await expect(page).toHaveURL(USERS.child.home)
    await expect(page.getByRole('heading', { level: 1, name: USERS.child.heading })).toBeVisible()
  })

  test('after logging out, the home page asks for a login again', async ({ page }) => {
    await login(page, USERS.parent)

    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL('/login')

    await page.goto(USERS.parent.home)
    await expect(page).toHaveURL('/login')
  })
})
