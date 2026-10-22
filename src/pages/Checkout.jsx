import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'
import { useSettings } from '../context/SettingsContext.jsx'
import { callFn } from '../lib/api'
import { cartPayload, quoteManual, checkoutManual } from '../lib/shipping'
import { provinces, citiesOf } from '../lib/regions'
import { idr } from '../lib/format'

const rateKey = (r) => `${r.company}:${r.service_code}`

export default function Checkout() {
  const { items, subtotal, clear } = useCart()
  const { settings, loaded } = useSettings()
  const nav = useNavigate()
  const mode = settings.shipping_mode === 'biteship' ? 'biteship' : 'manual'

  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', district: '', postal: '', notes: '' })
  // manual mode destination
  const [province, setProvince] = useState('')
  const [city, setCity] = useState('')
  // biteship mode destination
  const [areaQuery, setAreaQuery] = useState('')
  const [areaResults, setAreaResults] = useState([])
  const [area, setArea] = useState(null)
  const [coords, setCoords] = useState(null)

  const [rates, setRates] = useState([])
  const [ratesLoading, setRatesLoading] = useState(false)
  const [ratesChecked, setRatesChecked] = useState(false)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [tab, setTab] = useState('instant')
  const searchSeq = useRef(0)
  const rateSeq = useRef(0)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const cartKey = items.map((i) => `${i.id}:${i.qty}`).join(',')
  const cities = useMemo(() => citiesOf(province), [province])

  const applyRates = (list) => {
    setRates(list)
    setRatesChecked(true)
    setSelected('')
    setTab(list.some((r) => r.group === 'instant') ? 'instant' : 'regular')
  }

  // ---- manual mode: quote automatically when province + city are chosen ----
  useEffect(() => {
    if (mode !== 'manual') return
    setRates([])
    setRatesChecked(false)
    setSelected('')
    if (!province || !city || !items.length) return
    const seq = ++rateSeq.current
    setRatesLoading(true)
    setError('')
    quoteManual(province, city, items)
      .then((list) => seq === rateSeq.current && applyRates(list))
      .catch((e) => seq === rateSeq.current && setError(e.message))
      .finally(() => seq === rateSeq.current && setRatesLoading(false))
  }, [mode, province, city, cartKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- biteship mode: destination search ----
  useEffect(() => {
    if (mode !== 'biteship') return
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
  }, [mode, areaQuery, area])

  useEffect(() => {
    if (mode !== 'biteship') return
    setRates([])
    setRatesChecked(false)
    setSelected('')
  }, [mode, area?.id, coords?.lat, coords?.lng, cartKey])

  const fetchBiteshipRates = async () => {
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
      applyRates(rates || [])
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
      let res
      if (mode === 'manual') {
        res = await checkoutManual({
          customer: { name: form.name, phone: form.phone, email: form.email },
          address: { line: form.address, province, city, district: form.district, postal_code: form.postal },
          courier: { company: chosen.company, service_code: chosen.service_code },
          notes: form.notes,
          items,
        })
      } else {
        res = await callFn('create-order', {
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
      }
      clear()
      nav(`/order/${res.order_no}`, {
        replace: true,
        state: {
          phone: form.phone,
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

  if (!loaded) return <div className="container page muted">Loading…</div>

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
          {mode === 'manual' ? (
            <div className="two">
              <label>
                Province
                <select
                  required
                  value={province}
                  onChange={(e) => {
                    setProvince(e.target.value)
                    setCity('')
                  }}
                >
                  <option value="">Select province…</option>
                  {provinces.map((p) => <option key={p}>{p}</option>)}
                </select>
              </label>
              <label>
                City / Regency
                <select required value={city} disabled={!province} onChange={(e) => setCity(e.target.value)}>
                  <option value="">Select city…</option>
                  {cities.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label>District (kecamatan, optional)<input value={form.district} onChange={set('district')} /></label>
              <label>Postal code (optional)<input inputMode="numeric" maxLength={5} value={form.postal} onChange={set('postal')} /></label>
            </div>
          ) : (
            <label className="relative">
              Area (district / sub-district / postal code)
              <input
                required
                placeholder="e.g. Lowokwaru Malang or 65141"
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
          )}
          <label>
            Street address
            <textarea required rows={3} placeholder="Street, number, RT/RW, district, postal code, landmarks" value={form.address} onChange={set('address')} />
          </label>
          <label>Notes for the seller (optional)<input value={form.notes} onChange={set('notes')} /></label>

          <h3>Shipping</h3>
          {mode === 'biteship' && (
            <>
              <p className="muted small">
                Instant couriers (Gojek / Grab) need your exact location for an accurate price.
              </p>
              <div className="btn-row">
                <button type="button" className="btn ghost" onClick={useMyLocation}>
                  {coords ? '📍 Location set' : '📍 Use my current location'}
                </button>
                <button type="button" className="btn" onClick={fetchBiteshipRates} disabled={!area || ratesLoading}>
                  {ratesLoading ? 'Checking…' : 'Check shipping cost'}
                </button>
              </div>
            </>
          )}
          {mode === 'manual' && !city && (
            <p className="muted small">Choose your province and city to see courier options.</p>
          )}
          {ratesLoading && mode === 'manual' && <p className="muted small">Checking couriers…</p>}
          {ratesChecked && rates.length === 0 && (
            <div className="alert">No courier is available for this destination yet. Please contact us via WhatsApp.</div>
          )}

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
                    ? 'Instant delivery (Gojek / Grab) is not available for your city or for this cart weight.'
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
            <p className="muted small">The shipping price is checked again on our server when you place the order.</p>
          </div>
        </aside>
      </form>
    </div>
  )
}
