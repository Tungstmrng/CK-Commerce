import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useSettings } from '../../context/SettingsContext.jsx'
import { provinces, citiesOf } from '../../lib/regions'

const FIELDS = [
  { key: 'store_name', label: 'Store name' },
  { key: 'announcement', label: 'Announcement bar (top of every page, leave empty to hide)' },
  { key: 'home_headline', label: 'Home headline (shown when there are no banners)' },
  { key: 'home_subheadline', label: 'Home sub-headline' },
  { key: 'whatsapp', label: 'WhatsApp number, digits only with country code (e.g. 628123456789)' },
]

const BITESHIP_FIELDS = [
  { key: 'origin_area_id', label: 'Biteship: area ID of your shop' },
  { key: 'origin_lat', label: 'Biteship: shop latitude (needed for Gojek/Grab)' },
  { key: 'origin_lng', label: 'Biteship: shop longitude (needed for Gojek/Grab)' },
]

const KEYS = [
  ...FIELDS.map((f) => f.key),
  ...BITESHIP_FIELDS.map((f) => f.key),
  'shipping_mode',
  'origin_province',
  'origin_city',
]

export default function AdminSettings() {
  const { settings, reload } = useSettings()
  const [vals, setVals] = useState({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase
      .from('site_settings')
      .select('key,value')
      .then(({ data }) => {
        const m = {}
        KEYS.forEach((k) => (m[k] = settings[k] ?? ''))
        ;(data || []).forEach((r) => (m[r.key] = r.value))
        if (!m.shipping_mode) m.shipping_mode = 'manual'
        setVals(m)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const cities = useMemo(() => citiesOf(vals.origin_province), [vals.origin_province])
  const set = (k) => (e) => setVals((v) => ({ ...v, [k]: e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const rows = KEYS.map((k) => ({ key: k, value: String(vals[k] ?? '') }))
    const { error } = await supabase.from('site_settings').upsert(rows)
    setBusy(false)
    if (error) setMsg(error.message)
    else {
      setMsg('Saved.')
      reload()
    }
  }

  const input = (f) => (
    <label key={f.key}>
      {f.label}
      <input value={vals[f.key] ?? ''} onChange={set(f.key)} />
    </label>
  )

  return (
    <form className="form card card-body" onSubmit={save}>
      <h3 style={{ marginTop: 0 }}>Store settings</h3>
      {FIELDS.map(input)}

      <h3>Shipping</h3>
      <label>
        How are shipping prices calculated at checkout?
        <select value={vals.shipping_mode || 'manual'} onChange={set('shipping_mode')}>
          <option value="manual">Manual: my own prices (Admin → Shipping)</option>
          <option value="biteship">Biteship: live prices (needs the Biteship functions deployed)</option>
        </select>
      </label>

      {vals.shipping_mode !== 'biteship' ? (
        <>
          <p className="muted small">
            Your shop's location decides which price a buyer gets: same city, same province, or the rest of Indonesia.
          </p>
          <div className="two">
            <label>
              Shop province
              <select
                value={vals.origin_province || ''}
                onChange={(e) => setVals((v) => ({ ...v, origin_province: e.target.value, origin_city: '' }))}
              >
                <option value="">Select…</option>
                {provinces.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label>
              Shop city / regency
              <select value={vals.origin_city || ''} disabled={!vals.origin_province} onChange={set('origin_city')}>
                <option value="">Select…</option>
                {cities.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
        </>
      ) : (
        <>
          <p className="muted small">
            Only switch to Biteship after your account is verified and the two Edge Functions are deployed (see README).
          </p>
          {BITESHIP_FIELDS.map(input)}
        </>
      )}

      {msg && <div className={msg === 'Saved.' ? 'ok' : 'alert'}>{msg}</div>}
      <div><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></div>
    </form>
  )
}
