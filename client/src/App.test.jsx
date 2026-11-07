import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import App from './App.jsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('renders the task list page', () => {
    // Keep the request pending; TaskList.test.jsx covers the responses.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument()
  })
})
