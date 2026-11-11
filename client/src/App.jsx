import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext.jsx'
import { getRoleHomePath, useAuth } from './auth/useAuth.js'
import AppLayout from './components/AppLayout.jsx'
import RoleRoute from './components/RoleRoute.jsx'
import ChildHomePage from './pages/ChildHomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ParentDashboardPage from './pages/ParentDashboardPage.jsx'
import ParentSpecialistsPage from './pages/ParentSpecialistsPage.jsx'
import SpecialistChildrenPage from './pages/SpecialistChildrenPage.jsx'
import './App.css'

function HomeRedirect() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="status-message" role="status">
        Loading session...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to={getRoleHomePath(user.role)} replace />
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RoleRoute allowedRoles={['parent']} />}>
          <Route element={<AppLayout />}>
            <Route path="/parent" element={<ParentDashboardPage />} />
            <Route path="/parent/specialists" element={<ParentSpecialistsPage />} />
          </Route>
        </Route>

        <Route element={<RoleRoute allowedRoles={['specialist']} />}>
          <Route element={<AppLayout />}>
            <Route path="/specialist" element={<SpecialistChildrenPage />} />
          </Route>
        </Route>

        <Route element={<RoleRoute allowedRoles={['child']} />}>
          <Route element={<AppLayout />}>
            <Route path="/child" element={<ChildHomePage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
