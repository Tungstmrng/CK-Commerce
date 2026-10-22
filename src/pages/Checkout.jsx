import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'
import { callFn } from '../lib/api'
import { idr } from '../lib/format'

const cartPayload = (items) => items.map((i) => ({ product_id: i.id, qty: i.qty }))
const rateKey = (r) => `${r.company}:${r.service_code}`

export default function Checkout() {
  const { items, subtotal, clear } = useCart()
  const nav = useNavigate()

  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' })
  const [areaQuery, setAreaQuery] = useState('')
  const [areaResults, setAreaResults] = useState([])
  const [area, setArea] = useState(null)
  const [coords, setCoords] = useState(null)
  const [rates, setRates] = useState([])
  const [ratesLoading, setRatesLoading] = useState(false)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [tab, setTab] = useState('instant')
  const searchSeq = useRef(0)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // Debounced destination search (kecamatan / kelurahan / postal code)
  useEffect(() => {
    if (area || areaQuery.trim().length < 3) {
      setAreaResults([])
      return
    }
    const seq = ++searchSeq.current
    const t = setTimeout(async () => {
      try {
        const { areas } = await callFn('shipping', { action: 'areas', input: areaQuery.trim() })
        if (seq === searchSeq.current) setAreaResults(areas || [])
      } catch (e) {
        if (seq === searchSeq.current) setError(e.message)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [areaQuery, area])

  // Any change to destination, location or cart invalidates the quoted rates
  const cartKey = items.map((i) => `${i.id}:${i.qty}`).join(',')
  useEffect(() => {
    setRates([])
    setSelected('')
  }, [area?.id, coords?.lat, coords?.lng, cartKey])

  const fetchRates = async () => {
    setError('')
    if (!area) return setError('Choose your area first.')
    setRatesLoading(true)
    try {
      const { rates } = await callFn('shipping', {
        action: 'rates',
        destination_area_id: area.id,
        destination_lat: coords?.lat,
        destination_lng: coords?.lng,
        items: cartPayload(items),
      })
      setRates(rates || [])
      const hasInstant = (rates || []).some((r) => r.group === 'instant')
      setTab(hasInstant ? 'instant' : 'regular')
      if (!rates?.length) setError('No courier is available for this destination.')
    } catch (e) {
      setError(e.message)
    } finally {
      setRatesLoading(false)
    }
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) return setError('Location is not supported by this browser.')
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setError('Could not get your location. You can still use regular couriers.'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const chosen = useMemo(() => rates.find((r) => rateKey(r) === selected), [rates, selected])
  const shownRates = rates.filter((r) => r.group === tab)
  const total = subtotal + (chosen?.price || 0)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!chosen) return setError('Please choose a courier.')
    setSubmitting(true)
    try {
      const res = await callFn('create-order', {
        customer: { name: form.name, phone: form.phone, email: form.email },
        address: {
          line: form.address,
          area_id: area.id,
          area_name: area.name,
          postal_code: area.postal_code,
          lat: coords?.lat,
          lng: coords?.lng,
        },
        courier: { company: chosen.company, service_code: chosen.service_code },
        notes: form.notes,
        items: cartPayload(items),
      })
      clear()
      nav(`/order/${res.order_no}`, {
        replace: true,
        state: {
          subtotal: res.subtotal,
          shipping_cost: res.shipping_cost,
          total: res.total,
          courier: `${chosen.name} ${chosen.service}`,
        },
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!items.length)
    return (
      <div className="container page">
        <h1>Checkout</h1>
        <p className="muted">Your cart is empty.</p>
        <Link className="btn" to="/products">Browse products</Link>
      </div>
    )

  return (
    <div className="container page">
      <h1>Checkout</h1>
      <form className="cart-layout" onSubmit={submit}>
        <div className="form">
          <h3>Contact</h3>
          <label>Full name<input required value={form.name} onChange={set('name')} /></label>
          <div className="two">
            <label>Phone / WhatsApp<input required type="tel" value={form.phone} onChange={set('phone')} /></label>
            <label>Email (optional)<input type="email" value={form.email} onChange={set('email')} /></label>
          </div>

          <h3>Delivery address</h3>
          <label className="relative">
            Area (district / sub-district / postal code)
            <input
              required
              placeholder="e.g. Bekasi Timur, Bekasi, 17113"
              value={areaQuery}
              onChange={(e) => {
                setAreaQuery(e.target.value)
                setArea(null)
              }}
            />
            {areaResults.length > 0 && (
              <ul className="suggest">
                {areaResults.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setArea(a)
                        setAreaQuery(a.name)
                        setAreaResults([])
                      }}
                    >
                      {a.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>
          <label>
            Street address
            <textarea required rows={3} placeholder="Street, number, RT/RW, landmarks" value={form.address} onChange={set('address')} />
          </label>
          <label>Notes for the seller (optional)<input value={form.notes} onChange={set('notes')} /></label>

          <h3>Shipping</h3>
          <p className="muted small">
            Instant couriers (Gojek / Grab) need your exact location for an accurate price.
          </p>
          <div className="btn-row">
            <button type="button" className="btn ghost" onClick={useMyLocation}>
              {coords ? '📍 Location set' : '📍 Use my current location'}
            </button>
            <button type="button" className="btn" onClick={fetchRates} disabled={!area || ratesLoading}>
              {ratesLoading ? 'Checking…' : 'Check shipping cost'}
            </button>
          </div>

          {rates.length > 0 && (
            <>
              <div className="tabs">
                <button type="button" className={tab === 'instant' ? 'on' : ''} onClick={() => setTab('instant')}>
                  Instant
                </button>
                <button type="button" className={tab === 'regular' ? 'on' : ''} onClick={() => setTab('regular')}>
                  Regular
                </button>
              </div>
              {shownRates.length === 0 && (
                <p className="muted small">
                  {tab === 'instant'
                    ? 'No instant courier available. Try "Use my current location".'
                    : 'No regular courier available.'}
                </p>
              )}
              <div className="rates">
                {shownRates.map((r) => (
                  <label key={rateKey(r)} className={`rate ${selected === rateKey(r) ? 'on' : ''}`}>
                    <input
                      type="radio"
                      name="rate"
                      checked={selected === rateKey(r)}
                      onChange={() => setSelected(rateKey(r))}
                    />
                    <span className="rate-main">
                      <strong>{r.name} {r.service}</strong>
                      <span className="muted small">{r.duration || r.description}</span>
                    </span>
                    <strong>{idr(r.price)}</strong>
                  </label>
                ))}
              </div>
            </>
          )}
          {error && <div className="alert">{error}</div>}
        </div>

        <aside className="summary card">
          <div className="card-body">
            <h3 style={{ marginTop: 0 }}>Order summary</h3>
            {items.map((i) => (
              <div key={i.id} className="row-between small">
                <span>{i.qty}× {i.name}</span>
                <span>{idr(i.qty * i.price)}</span>
              </div>
            ))}
            <hr />
            <div className="row-between"><span>Subtotal</span><span>{idr(subtotal)}</span></div>
            <div className="row-between">
              <span>Shipping</span>
              <span>{chosen ? idr(chosen.price) : '—'}</span>
            </div>
            <hr />
            <div className="row-between"><strong>Total</strong><strong>{idr(total)}</strong></div>
            <button className="btn block" disabled={submitting || !chosen}>
              {submitting ? 'Placing order…' : 'Place order'}
            </button>
            <p className="muted small">The shipping price is re-checked with the courier when you place the order.</p>
          </div>
        </aside>
      </form>
    </div>
  )
}
