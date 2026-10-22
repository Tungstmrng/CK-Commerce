import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { uploadImage } from '../../lib/storage'

const EMPTY = { title: '', subtitle: '', image_url: '', link_url: '/products', sort_order: 0, is_active: true }

export default function AdminBanners() {
  const [list, setList] = useState([])
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const { data, error } = await supabase.from('banners').select('*').order('sort_order')
    if (error) setError(error.message)
    setList(data || [])
  }
  useEffect(() => {
    load()
  }, [])

  const upd = (k) => (e) =>
    setEditing((b) => ({ ...b, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const onFile = async (e) => {
    const f = e.target.files[0]
    if (!f) return
    setBusy(true)
    setError('')
    try {
      const url = await uploadImage(f, 'banners')
      setEditing((b) => ({ ...b, image_url: url }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const payload = {
      title: editing.title,
      subtitle: editing.subtitle || null,
      image_url: editing.image_url || null,
      link_url: editing.link_url || null,
      sort_order: Number(editing.sort_order) || 0,
      is_active: editing.is_active,
    }
    const res = editing.id
      ? await supabase.from('banners').update(payload).eq('id', editing.id)
      : await supabase.from('banners').insert(payload)
    setBusy(false)
    if (res.error) return setError(res.error.message)
    setEditing(null)
    load()
  }

  const remove = async (b) => {
    if (!confirm(`Delete banner "${b.title}"?`)) return
    const { error } = await supabase.from('banners').delete().eq('id', b.id)
    if (error) setError(error.message)
    else load()
  }

  if (editing) {
    return (
      <form className="form card card-body" onSubmit={save}>
        <h3 style={{ marginTop: 0 }}>{editing.id ? 'Edit promotion' : 'New promotion'}</h3>
        <label>Headline<input required value={editing.title} onChange={upd('title')} /></label>
        <label>Sub-headline<input value={editing.subtitle || ''} onChange={upd('subtitle')} /></label>
        <label>
          Link (e.g. /products?category=Drill or a full URL)
          <input value={editing.link_url || ''} onChange={upd('link_url')} />
        </label>
        <div className="two">
          <label>Order (smaller first)<input type="number" value={editing.sort_order} onChange={upd('sort_order')} /></label>
          <label className="check" style={{ alignSelf: 'end' }}>
            <input type="checkbox" checked={editing.is_active} onChange={upd('is_active')} /> Show on home page
          </label>
        </div>
        <div>
          <div className="muted small">Banner image (wide, e.g. 1600×600)</div>
          {editing.image_url && <img className="banner-preview" src={editing.image_url} alt="" />}
          <input type="file" accept="image/*" onChange={onFile} />
        </div>
        {error && <div className="alert">{error}</div>}
        <div className="btn-row">
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </form>
    )
  }

  return (
    <>
      <div className="row-between">
        <h3>Home page promotions</h3>
        <button className="btn" onClick={() => setEditing({ ...EMPTY })}>+ Add promotion</button>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Image</th><th>Headline</th><th>Order</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id}>
                <td className="td-img wide">{b.image_url && <img src={b.image_url} alt="" />}</td>
                <td>{b.title}<div className="muted small">{b.subtitle}</div></td>
                <td>{b.sort_order}</td>
                <td>{b.is_active ? 'Live' : 'Hidden'}</td>
                <td className="nowrap">
                  <button className="linklike" onClick={() => setEditing({ ...b })}>Edit</button>{' '}
                  <button className="linklike danger" onClick={() => remove(b)}>Delete</button>
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="5" className="muted">No promotions yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
