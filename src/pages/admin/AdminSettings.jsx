import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useSettings } from '../../context/SettingsContext.jsx'

const FIELDS = [
  { key: 'store_name', label: 'Store name' },
  { key: 'announcement', label: 'Announcement bar (top of every page, leave empty to hide)' },
  { key: 'home_headline', label: 'Home headline (shown when there are no banners)' },
  { key: 'home_subheadline', label: 'Home sub-headline' },
  { key: 'whatsapp', label: 'WhatsApp number, digits only with country code (e.g. 628123456789)' },
  { key: 'origin_area_id', label: 'Shipping origin: Biteship area ID of your shop', shipping: true },
  { key: 'origin_lat', label: 'Shipping origin latitude (needed for Gojek/Grab)', shipping: true },
  { key: 'origin_lng', label: 'Shipping origin longitude (needed for Gojek/Grab)', shipping: true },
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
        FIELDS.forEach((f) => (m[f.key] = settings[f.key] ?? ''))
        ;(data || []).forEach((r) => (m[r.key] = r.value))
        setVals(m)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const rows = FIELDS.map((f) => ({ key: f.key, value: String(vals[f.key] ?? '') }))
    const { error } = await supabase.from('site_settings').upsert(rows)
    setBusy(false)
    if (error) setMsg(error.message)
    else {
      setMsg('Saved.')
      reload()
    }
  }

  return (
    <form className="form card card-body" onSubmit={save}>
      <h3 style={{ marginTop: 0 }}>Store settings</h3>
      {FIELDS.map((f) => (
        <label key={f.key}>
          {f.label}
          <input value={vals[f.key] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} />
        </label>
      ))}
      <p className="muted small">
        To find your origin area ID, search your district name in the Biteship maps API (see README, “Shipping origin”).
      </p>
      {msg && <div className={msg === 'Saved.' ? 'ok' : 'alert'}>{msg}</div>}
      <div><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></div>
    </form>
  )
}
