import { test, expect } from '@playwright/test'
import { USERS, login } from './helpers.js'

// M4 Tasks: the task list for the child and the status list for the parent (FR-M4-02, FR-M4-03, FR-M4-04).
// Seed data: Deniz has four tasks; "Finish a 24-piece puzzle" is already done.
test.describe('Task list', () => {
  test('the child sees their tasks and marks one as done', async ({ page }) => {
    await login(page, USERS.child)

    await expect(page.getByRole('heading', { name: 'My Tasks' })).toBeVisible()
    const tasks = page.locator('.task-list').getByRole('listitem')
    await expect(tasks).toHaveCount(4)
    await expect(tasks.filter({ hasText: 'Finish a 24-piece puzzle' })).toContainText('✓ Done')

    const readTask = tasks.filter({ hasText: 'Read a picture book aloud' })
    await expect(readTask).toContainText('Due Wed 18 Nov · Language')
    await readTask.getByRole('button', { name: 'Mark as done' }).click()
    await expect(readTask).toContainText('✓ Done')
    await expect(readTask.getByRole('button', { name: 'Mark as done' })).toHaveCount(0)

    // The change is saved on the server, so it is still done after a reload
    await page.reload()
    await expect(page.locator('.task-list').getByRole('listitem').filter({ hasText: 'Read a picture book aloud' }))
      .toContainText('✓ Done')
  })

  test("the parent sees the status of all of the child's tasks", async ({ page }) => {
    await login(page, USERS.parent)

    await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible()
    const rows = page.getByRole('row')
    // Header row and the four tasks
    await expect(rows).toHaveCount(5)

    const puzzle = rows.filter({ hasText: 'Finish a 24-piece puzzle' })
    await expect(puzzle).toContainText('Cognitive')
    await expect(puzzle).toContainText('Mehmet Kaya')
    await expect(puzzle).toContainText('Done')

    await expect(rows.filter({ hasText: 'Button up your own shirt' })).toContainText('Pending')
    // The parent can assign tasks but cannot mark them as done
    await expect(page.getByRole('button', { name: 'Assign task' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mark as done' })).toHaveCount(0)
  })
})
