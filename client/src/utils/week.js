// Date helpers for the weekly schedule (M3). A week starts on Monday and is written as YYYY-MM-DD.

function pad(value) {
  return String(value).padStart(2, '0')
}

// Local date as YYYY-MM-DD (not toISOString, which would shift the day in UTC+3)
export function toDateString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseDateString(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

// The Monday of the week that contains the given date
export function getWeekStart(date = new Date()) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const daysSinceMonday = (monday.getDay() + 6) % 7
  monday.setDate(monday.getDate() - daysSinceMonday)
  return toDateString(monday)
}

export function addDays(dateString, days) {
  const date = parseDateString(dateString)
  date.setDate(date.getDate() + days)
  return toDateString(date)
}

// The seven days of the week that starts on weekStart
export function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
}

export function formatDayLabel(dateString) {
  return parseDateString(dateString).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function formatWeekRange(weekStart) {
  const options = { day: 'numeric', month: 'short', year: 'numeric' }
  const first = parseDateString(weekStart).toLocaleDateString('en-GB', options)
  const last = parseDateString(addDays(weekStart, 6)).toLocaleDateString('en-GB', options)
  return `${first} – ${last}`
}
