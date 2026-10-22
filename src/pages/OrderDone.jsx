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
        Your order number is <strong>{orderNo}</strong>. Please keep it for reference.
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
      <Link className="btn" to="/products">Continue shopping</Link>
    </div>
  )
}
