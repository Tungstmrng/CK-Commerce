import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useSettings } from '../../context/SettingsContext.jsx'
import { idr } from '../../lib/format'

const PRESETS = [
  { label: 'JNE Regular', company: 'jne', courier_name: 'JNE', service_name: 'REG', service_code: 'reg', grp: 'regular', sort_order: 10 },
  { label: 'Lion Parcel Regular', company: 'lion', courier_name: 'Lion Parcel', service_name: 'REGPACK', service_code: 'regpack', grp: 'regular', sort_order: 11 },
  { label: 'J&T Regular', company: 'jnt', courier_name: 'J&T', service_name: 'EZ', service_code: 'ez', grp: 'regular', sort_order: 12 },
  { label: 'Gojek Instant', company: 'gojek', courier_name: 'Gojek', service_name: 'Instant', service_code: 'instant', grp: 'instant', coverage: 'city', sort_order: 1 },
  { label: 'Grab Instant', company: 'grab', courier_name: 'Grab', service_name: 'Instant', service_code: 'instant', grp: 'instant', coverage: 'city', sort_order: 2 },
]

const COVERAGE = {
  city: 'Same city as my shop',
  province: 'Same province (other cities)',
  nationwide: 'Rest of Indonesia',
}
const COVERAGE_ORDER = ['city', 'province', 'nationwide']

const EMPTY = {
  company: '',
  courier_name: '',
  service_name: 'REG',
  service_code: 'reg',
  grp: 'regular',
  coverage: 'nationwide',
  first_kg_price: '',
  next_kg_price: 0,
  duration: '',
  sort_order: 10,
  is_active: true,
}

export default function AdminShipping() {
  const { settings } = useSettings()
  const [list, setList] = useState([])
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const { data, error } = await supabase
      .from('shipping_rates')
      .select('*')
      .order('sort_order')
      .order('company')
    if (error) {
      setError(
        /does not exist|schema cache/i.test(error.message)
          ? 'The shipping table is missing. Run supabase/update_v2.sql in the Supabase SQL Editor.'
          : error.message
      )
    }
    const rows = (data || []).sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        a.company.localeCompare(b.company) ||
        COVERAGE_ORDER.indexOf(a.coverage) - COVERAGE_ORDER.indexOf(b.coverage)
    )
    setList(rows)
  }
  useEffect(() => {
    load()
  }, [])

  const upd = (k) => (e) =>
    setEditing((r) => ({ ...r, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const applyPreset = (label) => {
    const p = PRESETS.find((x) => x.label === label)
    if (p) {
      const { label: _l, ...rest } = p
      setEditing((r) => ({ ...r, ...rest }))
    }
  }

  const save = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    const r = editing
    const payload = {
      company: r.company.trim().toLowerCase(),
      courier_name: r.courier_name.trim(),
      service_name: r.service_name.trim(),
      service_code: r.service_code.trim().toLowerCase(),
      grp: r.grp,
      coverage: r.coverage,
      first_kg_price: Math.round(Number(r.first_kg_price)),
      next_kg_price: Math.round(Number(r.next_kg_price) || 0),
      duration: r.duration?.trim() || null,
      sort_order: Math.round(Number(r.sort_order) || 0),
      is_active: r.is_active,
    }
    const res = r.id
      ? await supabase.from('shipping_rates').update(payload).eq('id', r.id)
      : await supabase.from('shipping_rates').insert(payload)
    setBusy(false)
    if (res.error) {
      return setError(
        res.error.code === '23505'
          ? 'This courier service already has a price for that coverage. Edit the existing row instead.'
          : res.error.message
      )
    }
    setEditing(null)
    load()
  }

  const remove = async (r) => {
    if (!confirm(`Delete ${r.courier_name} ${r.service_name} (${COVERAGE[r.coverage]})?`)) return
    const { error } = await supabase.from('shipping_rates').delete().eq('id', r.id)
    if (error) setError(error.message)
    else load()
  }

  const toggle = async (r) => {
    const { error } = await supabase.from('shipping_rates').update({ is_active: !r.is_active }).eq('id', r.id)
    if (error) setError(error.message)
    else load()
  }

  // Copy a row to a coverage that this courier service does not have yet
  const copyRow = (r) => {
    const used = list.filter((x) => x.company === r.company && x.service_code === r.service_code).map((x) => x.coverage)
    const next = COVERAGE_ORDER.find((c) => !used.includes(c)) || r.coverage
    const { id: _id, created_at: _c, ...rest } = r
    setEditing({ ...rest, coverage: next })
  }

  const originMissing = !settings.origin_city || !settings.origin_province

  if (editing) {
    return (
      <form className="form card card-body" onSubmit={save}>
        <h3 style={{ marginTop: 0 }}>{editing.id ? 'Edit shipping price' : 'New shipping price'}</h3>

        {!editing.id && (
          <label>
            Start from a preset
            <select defaultValue="" onChange={(e) => applyPreset(e.target.value)}>
              <option value="">Custom…</option>
              {PRESETS.map((p) => <option key={p.label}>{p.label}</option>)}
            </select>
          </label>
        )}

        <div className="two">
          <label>Courier name (shown to buyer)<input required value={editing.courier_name} onChange={upd('courier_name')} /></label>
          <label>Service name<input required value={editing.service_name} onChange={upd('service_name')} /></label>
        </div>
        <div className="three">
          <label>Courier code<input required value={editing.company} onChange={upd('company')} /></label>
          <label>Service code<input required value={editing.service_code} onChange={upd('service_code')} /></label>
          <label>
            Type
            <select value={editing.grp} onChange={upd('grp')}>
              <option value="regular">Regular</option>
              <option value="instant">Instant (Gojek / Grab)</option>
            </select>
          </label>
        </div>

        <label>
          Where does this price apply?
          <select value={editing.coverage} onChange={upd('coverage')}>
            {COVERAGE_ORDER.map((c) => <option key={c} value={c}>{COVERAGE[c]}</option>)}
          </select>
        </label>
        <div className="three">
          <label>First kg (IDR)<input required type="number" min="0" value={editing.first_kg_price} onChange={upd('first_kg_price')} /></label>
          <label>Each extra kg (IDR)<input type="number" min="0" value={editing.next_kg_price} onChange={upd('next_kg_price')} /></label>
          <label>Sort order<input type="number" value={editing.sort_order} onChange={upd('sort_order')} /></label>
        </div>
        <label>Delivery time shown to buyer<input placeholder="e.g. 2-3 days or 1-3 hours" value={editing.duration || ''} onChange={upd('duration')} /></label>
        <label className="check"><input type="checkbox" checked={editing.is_active} onChange={upd('is_active')} /> Active</label>
        <p className="muted small">
          Price = first kg + (billable kg − 1) × each extra kg. The cart weight is rounded up to whole kilograms.
          A courier that only has a “same city” price is only offered to buyers in your city (use this for Gojek and Grab).
        </p>
        {error && <div className="alert">{error}</div>}
        <div className="btn-row">
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" className="btn ghost" onClick={() => { setEditing(null); setError('') }}>Cancel</button>
        </div>
      </form>
    )
  }

  return (
    <>
      <div className="row-between">
        <h3>Shipping prices</h3>
        <button className="btn" onClick={() => setEditing({ ...EMPTY })}>+ Add price</button>
      </div>
      {settings.shipping_mode === 'biteship' && (
        <div className="alert">
          Shipping mode is set to <strong>Biteship</strong>, so this table is not used at checkout. Switch back to “manual” in Settings to use it.
        </div>
      )}
      {originMissing && settings.shipping_mode !== 'biteship' && (
        <div className="alert">
          Your shop's city and province are not set. Until you set them in <strong>Settings</strong>, every buyer is treated as “rest of Indonesia” and instant couriers will not appear.
        </div>
      )}
      <p className="muted small">
        Buyers pay these prices at checkout. The sample prices are placeholders: replace them with your real courier prices.
      </p>
      {error && <div className="alert">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Courier</th><th>Type</th><th>Applies to</th><th>First kg</th><th>Extra kg</th><th></th></tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} style={r.is_active ? undefined : { opacity: 0.5 }}>
                <td>{r.courier_name} {r.service_name}<div className="muted small">{r.duration}</div></td>
                <td>{r.grp}</td>
                <td>{COVERAGE[r.coverage]}</td>
                <td>{idr(r.first_kg_price)}</td>
                <td>{idr(r.next_kg_price)}</td>
                <td className="nowrap">
                  <button className="linklike" onClick={() => setEditing({ ...r })}>Edit</button>{' '}
                  <button className="linklike" onClick={() => copyRow(r)}>Copy</button>{' '}
                  <button className="linklike" onClick={() => toggle(r)}>{r.is_active ? 'Disable' : 'Enable'}</button>{' '}
                  <button className="linklike danger" onClick={() => remove(r)}>Delete</button>
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="6" className="muted">No prices yet. Buyers will see “no courier available”.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
