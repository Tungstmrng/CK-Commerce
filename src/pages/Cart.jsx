import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'
import { idr, kg } from '../lib/format'

export default function Cart() {
  const { items, setQty, remove, subtotal, weight } = useCart()

  if (!items.length)
    return (
      <div className="container page">
        <h1>Your cart</h1>
        <p className="muted">Your cart is empty.</p>
        <Link className="btn" to="/products">Browse products</Link>
      </div>
    )

  return (
    <div className="container page">
      <h1>Your cart</h1>
      <div className="cart-layout">
        <div>
          {items.map((i) => (
            <div className="cart-item" key={i.id}>
              <div className="cart-img">
                {i.image ? <img src={i.image} alt="" /> : <div className="thumb-empty" />}
              </div>
              <div className="cart-info">
                <Link to={`/product/${i.slug}`}>{i.name}</Link>
                <div className="muted small">{idr(i.price)} · {kg(i.weight_grams || 0)} each</div>
                <div className="qty">
                  <button onClick={() => setQty(i.id, i.qty - 1)}>−</button>
                  <span>{i.qty}</span>
                  <button onClick={() => setQty(i.id, i.qty + 1)}>+</button>
                </div>
              </div>
              <div className="cart-right">
                <strong>{idr(i.price * i.qty)}</strong>
                <button className="linklike danger" onClick={() => remove(i.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
        <aside className="summary card">
          <div className="card-body">
            <div className="row-between"><span>Subtotal</span><strong>{idr(subtotal)}</strong></div>
            <div className="row-between muted small"><span>Total weight</span><span>{kg(weight)}</span></div>
            <p className="muted small">Shipping cost is added at checkout.</p>
            <Link className="btn block" to="/checkout">Checkout</Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
