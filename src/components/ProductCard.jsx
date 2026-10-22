import { Link } from 'react-router-dom'
import { idr } from '../lib/format'
import { useCart } from '../context/CartContext.jsx'

export default function ProductCard({ product }) {
  const { add } = useCart()
  const out = product.stock <= 0
  return (
    <div className="card product-card">
      <Link to={`/product/${product.slug}`} className="thumb">
        {product.images?.[0] ? (
          <img src={product.images[0]} alt={product.name} loading="lazy" />
        ) : (
          <div className="thumb-empty">No image</div>
        )}
      </Link>
      <div className="card-body">
        {product.brand && <div className="muted small">{product.brand}</div>}
        <Link to={`/product/${product.slug}`} className="product-name">
          {product.name}
        </Link>
        <div className="price">{idr(product.price)}</div>
        <button className="btn" disabled={out} onClick={() => add(product, 1)}>
          {out ? 'Out of stock' : 'Add to cart'}
        </button>
      </div>
    </div>
  )
}
