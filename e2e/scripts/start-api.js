// Starts the Express API for the E2E tests on a fresh database filled with the seed data,
// so every test run begins from the same users, child, links and tasks.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = fileURLToPath(new URL('../../server/', import.meta.url))
const dbPath = path.join(serverDir, 'data', 'e2e.db')

// Remove the database of the previous run (SQLite may also leave -wal and -shm files)
for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
  rmSync(file, { force: true })
}
mkdirSync(path.dirname(dbPath), { recursive: true })

process.env.DB_PATH = dbPath
process.env.PORT = '5000'

execFileSync(process.execPath, ['src/seed.js'], { cwd: serverDir, env: process.env, stdio: 'inherit' })

// Same as `npm start` in server/: server.js reads server/.env (if any) from the working directory
process.chdir(serverDir)
await import(new URL('../../server/src/server.js', import.meta.url).href)
