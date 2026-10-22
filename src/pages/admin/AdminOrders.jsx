import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { idr } from '../../lib/format'
import { ALL_STATUSES, STATUS_LABEL } from '../../lib/status'

const waLink = (phone) => {
  const d = phone.replace(/\D/g, '')
  return `https://wa.me/${d.startsWith('0') ? '62' + d.slice(1) : d}`
}

function OrderCard({ o, onChange, onError }) {
  const [note, setNote] = useState('')

  const patch = async (values) => {
    const { error } = await supabase.from('orders').update(values).eq('id', o.id)
    if (error) onError(error.message)
    else onChange()
  }

  const addNote = async () => {
    if (!note.trim()) return
    const { error } = await supabase
      .from('order_events')
      .insert({ order_id: o.id, status: o.status, note: note.trim() })
    if (error) return onError(error.message)
    setNote('')
    onChange()
  }

  return (
    <div className="card card-body order">
      <div className="row-between">
        <strong>{o.order_no}</strong>
        <span className="muted small">{new Date(o.created_at).toLocaleString('id-ID')}</span>
      </div>
      <div className="small">
        {o.customer_name} ·{' '}
        <a href={waLink(o.phone)} target="_blank" rel="noreferrer">{o.phone}</a>
      </div>
      <div className="small muted">
        {o.address}, {[o.district, o.city, o.province].filter(Boolean).join(', ') || o.area_name} {o.postal_code}
      </div>
      {o.notes && <div className="small">Note: {o.notes}</div>}
      <ul className="small">
        {o.order_items.map((i) => (
          <li key={i.id}>{i.qty}× {i.name} — {idr(i.price * i.qty)}</li>
        ))}
      </ul>
      <div className="small">
        Courier: <strong>{o.courier_service}</strong> · Shipping {idr(o.shipping_cost)} · Subtotal {idr(o.subtotal)} ·{' '}
        <strong>Total {idr(o.total)}</strong>
      </div>

      <div className="form" style={{ marginTop: '.6rem' }}>
        <div className="two">
          <label>
            Status
            <select value={o.status} onChange={(e) => patch({ status: e.target.value })}>
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          <label>
            Waybill / tracking number
            <input
              defaultValue={o.tracking_number || ''}
              onBlur={(e) => e.target.value.trim() !== (o.tracking_number || '') && patch({ tracking_number: e.target.value.trim() || null })}
            />
          </label>
        </div>
        <div className="btn-row" style={{ flexWrap: 'nowrap' }}>
          <input placeholder="Message for the customer's tracking page (links become clickable)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="btn ghost" onClick={addNote}>Post</button>
        </div>
      </div>
    </div>
  )
}

export default function AdminOrders() {
  const [orders, setOrders] = useState([])
  const [filter, setFilter] = useState('active')
  const [q, setQ] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) setError(error.message)
    setOrders(data || [])
  }
  useEffect(() => {
    load()
  }, [])

  const counts = useMemo(() => {
    const c = {}
    orders.forEach((o) => (c[o.status] = (c[o.status] || 0) + 1))
    return c
  }, [orders])

  const shown = orders.filter((o) => {
    if (filter === 'active' && ['completed', 'cancelled'].includes(o.status)) return false
    if (filter !== 'active' && filter !== 'all' && o.status !== filter) return false
    if (q) {
      const s = q.toLowerCase()
      return `${o.order_no} ${o.customer_name} ${o.phone}`.toLowerCase().includes(s)
    }
    return true
  })

  return (
    <>
      <h3>Orders</h3>
      <div className="filters">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="active">Open orders</option>
          <option value="all">All orders</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]} ({counts[s] || 0})</option>
          ))}
        </select>
        <input type="search" placeholder="Search order no, name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <div className="alert">{error}</div>}
      {shown.map((o) => (
        <OrderCard key={o.id} o={o} onChange={load} onError={setError} />
      ))}
      {!shown.length && <p className="muted">No orders here.</p>}
    </>
  )
}
