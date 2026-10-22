import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { idr, kg } from '../lib/format'
import { useCart } from '../context/CartContext.jsx'

export default function ProductDetail() {
  const { slug } = useParams()
  const nav = useNavigate()
  const { add } = useCart()
  const [p, setP] = useState(undefined)
  const [img, setImg] = useState(0)
  const [qty, setQty] = useState(1)

  useEffect(() => {
    setP(undefined)
    supabase
      .from('products')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data }) => {
        setP(data)
        setImg(0)
        setQty(1)
      })
  }, [slug])

  if (p === undefined) return <div className="container page muted">Loading…</div>
  if (p === null)
    return (
      <div className="container page">
        <h1>Product not found</h1>
        <Link to="/products">Back to products</Link>
      </div>
    )

  const out = p.stock <= 0
  return (
    <div className="container page">
      <Link to="/products" className="muted small">← All products</Link>
      <div className="detail">
        <div>
          <div className="main-img">
            {p.images?.[img] ? <img src={p.images[img]} alt={p.name} /> : <div className="thumb-empty">No image</div>}
          </div>
          {p.images?.length > 1 && (
            <div className="thumbs">
              {p.images.map((u, i) => (
                <button key={u} className={i === img ? 'on' : ''} onClick={() => setImg(i)}>
                  <img src={u} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          {p.brand && <div className="muted">{p.brand}</div>}
          <h1 style={{ marginTop: 0 }}>{p.name}</h1>
          <div className="price big">{idr(p.price)}</div>
          <p className="muted small">
            Weight {kg(p.weight_grams)} · {out ? 'Out of stock' : `${p.stock} in stock`}
          </p>
          <p className="desc">{p.description}</p>
          <div className="qty-row">
            <div className="qty">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
              <span>{qty}</span>
              <button onClick={() => setQty((q) => Math.min(p.stock, q + 1))}>+</button>
            </div>
            <button className="btn" disabled={out} onClick={() => add(p, qty)}>
              Add to cart
            </button>
            <button
              className="btn ghost"
              disabled={out}
              onClick={() => {
                add(p, qty)
                nav('/cart')
              }}
            >
              Buy now
            </button>
          </div>
          <p className="muted small">Shipping is calculated at checkout and paid by the buyer.</p>
        </div>
      </div>
    </div>
  )
}
