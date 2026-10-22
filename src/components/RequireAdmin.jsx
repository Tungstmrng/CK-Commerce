import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

// UI guard only. Real protection is enforced by Row Level Security in the database.
export default function RequireAdmin({ children }) {
  const { loading, user, isAdmin } = useAuth()
  if (loading) return <div className="container page">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) {
    return (
      <div className="container page">
        <h1>No access</h1>
        <p>This account is not an admin.</p>
      </div>
    )
  }
  return children
}
