import { useEffect, useState } from 'react'

// Walking skeleton (WEB-31): shows the sample tasks from the temporary
// GET /api/tasks endpoint (WEB-30). The final page will read
// GET /api/children/:childId/tasks instead (SDD section 3).
function TaskList() {
  const [tasks, setTasks] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'

  useEffect(() => {
    // Ignore the answer if the component is removed before it arrives
    // (React StrictMode runs effects twice in development).
    let ignore = false

    fetch('/api/tasks')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`)
        }
        return response.json()
      })
      .then((data) => {
        if (!ignore) {
          setTasks(data)
          setStatus('ready')
        }
      })
      .catch(() => {
        if (!ignore) {
          setStatus('error')
        }
      })

    return () => {
      ignore = true
    }
  }, [])

  if (status === 'loading') {
    return <p>Loading tasks...</p>
  }

  if (status === 'error') {
    return <p role="alert">Could not load the tasks. Is the server running?</p>
  }

  if (tasks.length === 0) {
    return <p>No tasks yet.</p>
  }

  return (
    <ul className="task-list">
      {tasks.map((task) => (
        // The API sends done as 0 or 1, so a ternary is used here.
        // With `task.done && ...` React would print a "0" on the page.
        <li key={task.id} className={task.done ? 'task task-done' : 'task'}>
          <span className="task-title">{task.title}</span>
          <span className="task-status">{task.done ? 'Done' : 'To do'}</span>
        </li>
      ))}
    </ul>
  )
}

export default TaskList
