import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { uploadImage } from '../../lib/storage'
import { idr, slugify } from '../../lib/format'

const EMPTY = {
  name: '',
  brand: '',
  category: '',
  description: '',
  price: '',
  stock: 0,
  weight_grams: 1000,
  images: [],
  is_active: true,
  is_featured: false,
}

export default function AdminProducts() {
  const [list, setList] = useState([])
  const [editing, setEditing] = useState(null) // null | product object (id may be undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    setList(data || [])
  }
  useEffect(() => {
    load()
  }, [])

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const p = editing
    const payload = {
      name: p.name.trim(),
      brand: p.brand?.trim() || null,
      category: p.category?.trim() || null,
      description: p.description || '',
      price: Number(p.price),
      stock: Number(p.stock),
      weight_grams: Number(p.weight_grams),
      images: p.images,
      is_active: p.is_active,
      is_featured: p.is_featured,
    }
    let res
    if (p.id) {
      res = await supabase.from('products').update(payload).eq('id', p.id)
    } else {
      payload.slug = `${slugify(payload.name)}-${Math.random().toString(36).slice(2, 6)}`
      res = await supabase.from('products').insert(payload)
    }
    setBusy(false)
    if (res.error) return setError(res.error.message)
    setEditing(null)
    load()
  }

  const remove = async (p) => {
    if (!confirm(`Delete "${p.name}"? Consider unticking "Visible in shop" instead.`)) return
    const { error } = await supabase.from('products').delete().eq('id', p.id)
    if (error) setError(error.message)
    else load()
  }

  const onFiles = async (e) => {
    const files = [...e.target.files]
    if (!files.length) return
    setBusy(true)
    setError('')
    try {
      const urls = []
      for (const f of files) urls.push(await uploadImage(f, 'products'))
      setEditing((p) => ({ ...p, images: [...p.images, ...urls] }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  const upd = (k) => (e) =>
    setEditing((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  if (editing) {
    return (
      <form className="form card card-body" onSubmit={save}>
        <h3 style={{ marginTop: 0 }}>{editing.id ? 'Edit product' : 'New product'}</h3>
        <label>Name<input required value={editing.name} onChange={upd('name')} /></label>
        <div className="two">
          <label>Brand<input value={editing.brand || ''} onChange={upd('brand')} /></label>
          <label>Category<input placeholder="Drill, Grinder, Saw…" value={editing.category || ''} onChange={upd('category')} /></label>
        </div>
        <label>Description<textarea rows={5} value={editing.description} onChange={upd('description')} /></label>
        <div className="three">
          <label>Price (IDR)<input required type="number" min="0" value={editing.price} onChange={upd('price')} /></label>
          <label>Stock<input required type="number" min="0" value={editing.stock} onChange={upd('stock')} /></label>
          <label>Weight (grams, packed)<input required type="number" min="1" value={editing.weight_grams} onChange={upd('weight_grams')} /></label>
        </div>
        <div>
          <div className="muted small">Images (first one is the cover)</div>
          <div className="thumbs">
            {editing.images.map((u, i) => (
              <div key={u} className="thumb-edit">
                <img src={u} alt="" />
                <button
                  type="button"
                  onClick={() => setEditing((p) => ({ ...p, images: p.images.filter((x) => x !== u) }))}
                >
                  ✕
                </button>
                {i > 0 && (
                  <button
                    type="button"
                    className="cover"
                    title="Make cover"
                    onClick={() =>
                      setEditing((p) => ({ ...p, images: [u, ...p.images.filter((x) => x !== u)] }))
                    }
                  >
                    ★
                  </button>
                )}
              </div>
            ))}
          </div>
          <input type="file" accept="image/*" multiple onChange={onFiles} />
        </div>
        <label className="check"><input type="checkbox" checked={editing.is_active} onChange={upd('is_active')} /> Visible in shop</label>
        <label className="check"><input type="checkbox" checked={editing.is_featured} onChange={upd('is_featured')} /> Featured on home page</label>
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
        <h3>Products ({list.length})</h3>
        <button className="btn" onClick={() => setEditing({ ...EMPTY })}>+ Add product</button>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th></th><th>Name</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td className="td-img">{p.images?.[0] && <img src={p.images[0]} alt="" />}</td>
                <td>{p.name}<div className="muted small">{p.category}</div></td>
                <td>{idr(p.price)}</td>
                <td>{p.stock}</td>
                <td>{p.is_active ? 'Visible' : 'Hidden'}{p.is_featured ? ' · ★' : ''}</td>
                <td className="nowrap">
                  <button className="linklike" onClick={() => setEditing({ ...p })}>Edit</button>{' '}
                  <button className="linklike danger" onClick={() => remove(p)}>Delete</button>
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="6" className="muted">No products yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
