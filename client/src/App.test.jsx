import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import App from './App.jsx'

afterEach(() => {
  cleanup()
})

describe('App', () => {
  it('renders the start heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Get started' })).toBeInTheDocument()
  })

  it('increments the counter on click', () => {
    render(<App />)
    const button = screen.getByRole('button', { name: 'Count is 0' })
    fireEvent.click(button)
    expect(screen.getByRole('button', { name: 'Count is 1' })).toBeInTheDocument()
  })
})
