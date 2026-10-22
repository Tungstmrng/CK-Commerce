import { NavLink, Outlet } from 'react-router-dom'

export default function AdminLayout() {
  return (
    <div className="container page">
      <h1>Admin</h1>
      <div className="tabs admin-tabs">
        <NavLink to="orders">Orders</NavLink>
        <NavLink to="products">Products</NavLink>
        <NavLink to="promotions">Promotions</NavLink>
        <NavLink to="shipping">Shipping</NavLink>
        <NavLink to="sales">Sales</NavLink>
        <NavLink to="settings">Settings</NavLink>
      </div>
      <Outlet />
    </div>
  )
}
