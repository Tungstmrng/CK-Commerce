import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { idr } from '../../lib/format'

const STATUSES = ['pending_payment', 'paid', 'packed', 'shipped', 'completed', 'cancelled']

export default function AdminOrders() {
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')

  const load = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) setError(error.message)
    setOrders(data || [])
  }
  useEffect(() => {
    load()
  }, [])

  const patch = async (id, values) => {
    const { error } = await supabase.from('orders').update(values).eq('id', id)
    if (error) setError(error.message)
    else load()
  }

  return (
    <>
      <h3>Orders</h3>
      {error && <div className="alert">{error}</div>}
      {orders.map((o) => (
        <div key={o.id} className="card card-body order">
          <div className="row-between">
            <strong>{o.order_no}</strong>
            <span className="muted small">{new Date(o.created_at).toLocaleString('id-ID')}</span>
          </div>
          <div className="small">
            {o.customer_name} ·{' '}
            <a href={`https://wa.me/${o.phone.replace(/^0/, '62').replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
              {o.phone}
            </a>
          </div>
          <div className="small muted">
            {o.address}, {o.area_name} {o.postal_code}
          </div>
          {o.notes && <div className="small">Note: {o.notes}</div>}
          <ul className="small">
            {o.order_items.map((i) => (
              <li key={i.id}>{i.qty}× {i.name} — {idr(i.price * i.qty)}</li>
            ))}
          </ul>
          <div className="small">
            Courier: <strong>{o.courier_company?.toUpperCase()} {o.courier_service}</strong> · Shipping {idr(o.shipping_cost)} · Subtotal {idr(o.subtotal)} ·{' '}
            <strong>Total {idr(o.total)}</strong>
          </div>
          <div className="btn-row" style={{ marginTop: '.5rem' }}>
            <select value={o.status} onChange={(e) => patch(o.id, { status: e.target.value })}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <input
              placeholder="Tracking / waybill number"
              defaultValue={o.tracking_number || ''}
              onBlur={(e) => e.target.value !== (o.tracking_number || '') && patch(o.id, { tracking_number: e.target.value || null })}
            />
          </div>
        </div>
      ))}
      {!orders.length && <p className="muted">No orders yet.</p>}
    </>
  )
}
