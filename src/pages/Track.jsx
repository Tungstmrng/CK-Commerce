import { useEffect, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { idr } from '../lib/format'
import { friendlyError } from '../lib/shipping'
import { STATUS_LABEL, STATUS_COLOR, STEPS } from '../lib/status'

const fmt = (d) =>
  new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })

// Turns links inside a note (e.g. a Gojek/Grab live-tracking link) into clickable links
function Note({ text }) {
  const parts = String(text).split(/(https?:\/\/\S+)/g)
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a>
    ) : (
      <span key={i}>{p}</span>
    )
  )
}

export default function Track() {
  const [params] = useSearchParams()
  const { state } = useLocation()
  const [orderNo, setOrderNo] = useState(params.get('order') || '')
  const [phone, setPhone] = useState(state?.phone || '')
  const [result, setResult] = useState(null)
  const [searched, setSearched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const auto = useRef(false)

  const lookup = async (no = orderNo, ph = phone) => {
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('track_order', { p_order_no: no, p_phone: ph })
    setBusy(false)
    setSearched(true)
    if (error) return setError(friendlyError(error.message))
    setResult(data)
  }

  // Coming straight from the "order placed" page: we already know both values
  useEffect(() => {
    if (!auto.current && orderNo && phone && state?.phone) {
      auto.current = true
      lookup(orderNo, phone)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e) => {
    e.preventDefault()
    lookup()
  }

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard not available */
    }
  }

  const stepIndex = result ? STEPS.indexOf(result.status) : -1

  return (
    <div className="container page narrow">
      <h1>Track your order</h1>
      <form className="form" onSubmit={submit}>
        <label>
          Order number
          <input required placeholder="TS-261022-AB12C" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />
        </label>
        <label>
          Phone number used for the order
          <input required type="tel" placeholder="0812…" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <button className="btn" disabled={busy}>{busy ? 'Searching…' : 'Track order'}</button>
      </form>
      {error && <div className="alert" style={{ marginTop: '1rem' }}>{error}</div>}
      {searched && !result && !error && (
        <div className="alert" style={{ marginTop: '1rem' }}>
          We could not find an order with that number and phone. Please check both and try again.
        </div>
      )}

      {result && (
        <div style={{ marginTop: '1.5rem' }}>
          <div className="card">
            <div className="card-body">
              <div className="row-between">
                <strong>{result.order_no}</strong>
                <span className={`pill ${STATUS_COLOR[result.status] || 'grey'}`}>{STATUS_LABEL[result.status] || result.status}</span>
              </div>
              <div className="muted small">Placed {fmt(result.created_at)}</div>

              {result.status === 'cancelled' ? (
                <div className="alert" style={{ marginTop: '.75rem' }}>This order was cancelled.</div>
              ) : (
                <ol className="steps" style={{ marginTop: '1rem' }}>
                  {STEPS.map((s, i) => (
                    <li key={s} className={i < stepIndex ? 'done' : i === stepIndex ? 'now' : ''}>
                      <span className="dot" />
                      <span>{STATUS_LABEL[s]}</span>
                    </li>
                  ))}
                </ol>
              )}

              <hr />
              <div className="small">
                <div>Courier: <strong>{result.courier}</strong></div>
                {result.tracking_number ? (
                  <div>
                    Waybill: <strong>{result.tracking_number}</strong>{' '}
                    <button type="button" className="linklike" onClick={() => copy(result.tracking_number)}>
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <div className="muted">You can also enter this number on the courier's own tracking page.</div>
                  </div>
                ) : (
                  <div className="muted">The waybill number will appear here once the order is shipped.</div>
                )}
                {result.destination && <div className="muted">Deliver to: {result.destination}</div>}
              </div>
            </div>
          </div>

          <h3>Updates</h3>
          <ul className="timeline">
            {[...result.events].reverse().map((e, i) => (
              <li key={i}>
                <div>
                  <strong>{STATUS_LABEL[e.status] || e.status}</strong>
                  {e.note ? <> — <Note text={e.note} /></> : null}
                </div>
                <div className="muted small">{fmt(e.at)}</div>
              </li>
            ))}
          </ul>

          <h3>Items</h3>
          <div className="card">
            <div className="card-body small">
              {result.items.map((i, k) => (
                <div key={k} className="row-between"><span>{i.qty}× {i.name}</span><span>{idr(i.qty * i.price)}</span></div>
              ))}
              <hr />
              <div className="row-between"><span>Subtotal</span><span>{idr(result.subtotal)}</span></div>
              <div className="row-between"><span>Shipping</span><span>{idr(result.shipping_cost)}</span></div>
              <div className="row-between"><strong>Total</strong><strong>{idr(result.total)}</strong></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
