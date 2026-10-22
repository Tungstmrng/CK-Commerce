import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useSettings } from '../context/SettingsContext.jsx'
import { useEffect } from 'react'

export default function Layout() {
  const { count } = useCart()
  const { isAdmin, user, signOut } = useAuth()
  const { settings } = useSettings()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setOpen(false)
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <>
      {settings.announcement && <div className="announce">{settings.announcement}</div>}
      <header className="header">
        <div className="container header-inner">
          <Link to="/" className="brand">
            <span className="brand-mark"></span> {settings.store_name}
          </Link>
          <button className="burger" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
            ☰
          </button>
          <nav className={`nav ${open ? 'open' : ''}`}>
            <NavLink to="/" end>Home</NavLink>
            <NavLink to="/products">Products</NavLink>
            {isAdmin && <NavLink to="/admin">Admin</NavLink>}
            {user ? (
              <button className="linklike" onClick={signOut}>Sign out</button>
            ) : (
              <NavLink to="/login">Login</NavLink>
            )}
            <NavLink to="/cart" className="cart-link">
              Cart {count > 0 && <span className="badge">{count}</span>}
            </NavLink>
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="footer">
        <div className="container">
          <strong>{settings.store_name}</strong>
          {settings.whatsapp && (
            <span>
              {' '}· WhatsApp{' '}
              <a href={`https://wa.me/${settings.whatsapp}`} target="_blank" rel="noreferrer">
                +{settings.whatsapp}
              </a>
            </span>
          )}
        </div>
      </footer>
    </>
  )
}
