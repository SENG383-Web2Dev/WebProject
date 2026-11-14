import { expect } from '@playwright/test'

// Synthetic seed accounts from server/src/seed.js; they all use the seed password
export const SEED_PASSWORD = 'password123'

export const USERS = {
  parent: { email: 'ayse.demir@example.com', name: 'Ayşe Demir', role: 'Parent', home: '/parent', heading: 'Parent Dashboard' },
  specialist: { email: 'mehmet.kaya@example.com', name: 'Mehmet Kaya', role: 'Specialist', home: '/specialist', heading: 'My Children' },
  child: { email: 'deniz.demir@example.com', name: 'Deniz Demir', role: 'Child', home: '/child', heading: 'My Week' },
}

// Logs in through the login page and waits for the role's home page
export async function login(page, user, password = SEED_PASSWORD) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(user.home)
}
