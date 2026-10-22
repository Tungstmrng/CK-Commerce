import { Link, useLocation, useParams } from 'react-router-dom'
import { idr } from '../lib/format'
import { useSettings } from '../context/SettingsContext.jsx'

export default function OrderDone() {
  const { orderNo } = useParams()
  const { state } = useLocation()
  const { settings } = useSettings()

  return (
    <div className="container page narrow">
      <h1>Thank you! 🎉</h1>
      <p>
        Your order number is <strong>{orderNo}</strong>. Please keep it — you need it, together with your phone number,
        to track your order.
      </p>
      {state && (
        <div className="card">
          <div className="card-body">
            <div className="row-between"><span>Subtotal</span><span>{idr(state.subtotal)}</span></div>
            <div className="row-between">
              <span>Shipping ({state.courier})</span><span>{idr(state.shipping_cost)}</span>
            </div>
            <hr />
            <div className="row-between"><strong>Total</strong><strong>{idr(state.total)}</strong></div>
          </div>
        </div>
      )}
      <p className="muted">
        Payment instructions will be sent to you after we confirm the order.
        {settings.whatsapp && (
          <>
            {' '}Questions? Message us on{' '}
            <a href={`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent('Order ' + orderNo)}`} target="_blank" rel="noreferrer">
              WhatsApp
            </a>.
          </>
        )}
      </p>
      <div className="btn-row">
        <Link className="btn" to={`/track?order=${encodeURIComponent(orderNo)}`} state={state?.phone ? { phone: state.phone } : undefined}>
          Track this order
        </Link>
        <Link className="btn ghost" to="/products">Continue shopping</Link>
      </div>
    </div>
  )
}
