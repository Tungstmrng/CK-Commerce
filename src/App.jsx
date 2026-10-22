import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import RequireAdmin from './components/RequireAdmin.jsx'
import Home from './pages/Home.jsx'
import Products from './pages/Products.jsx'
import ProductDetail from './pages/ProductDetail.jsx'
import Cart from './pages/Cart.jsx'
import Checkout from './pages/Checkout.jsx'
import OrderDone from './pages/OrderDone.jsx'
import Track from './pages/Track.jsx'
import Login from './pages/Login.jsx'
import AdminLayout from './pages/admin/AdminLayout.jsx'
import AdminProducts from './pages/admin/AdminProducts.jsx'
import AdminBanners from './pages/admin/AdminBanners.jsx'
import AdminOrders from './pages/admin/AdminOrders.jsx'
import AdminShipping from './pages/admin/AdminShipping.jsx'
import AdminSales from './pages/admin/AdminSales.jsx'
import AdminSettings from './pages/admin/AdminSettings.jsx'
import { configured } from './lib/supabase'

export default function App() {
  if (!configured) {
    return (
      <div className="container" style={{ padding: '3rem 1rem' }}>
        <h1>Almost there</h1>
        <p>
          Copy <code>.env.example</code> to <code>.env</code> and fill in your Supabase project URL
          and anon key, then restart <code>npm run dev</code>. See README.md for the full setup.
        </p>
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="products" element={<Products />} />
        <Route path="product/:slug" element={<ProductDetail />} />
        <Route path="cart" element={<Cart />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="order/:orderNo" element={<OrderDone />} />
        <Route path="track" element={<Track />} />
        <Route path="login" element={<Login />} />
        <Route
          path="admin"
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<Navigate to="orders" replace />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="promotions" element={<AdminBanners />} />
          <Route path="shipping" element={<AdminShipping />} />
          <Route path="sales" element={<AdminSales />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
        <Route path="*" element={<div className="container page"><h1>Page not found</h1></div>} />
      </Route>
    </Routes>
  )
}
