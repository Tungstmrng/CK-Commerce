import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ProductCard from '../components/ProductCard.jsx'

export default function Products() {
  const [params, setParams] = useSearchParams()
  const [all, setAll] = useState([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState('new')

  const q = params.get('q') || ''
  const category = params.get('category') || ''

  useEffect(() => {
    supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setAll(data || [])
        setLoading(false)
      })
  }, [])

  const categories = useMemo(
    () => [...new Set(all.map((p) => p.category).filter(Boolean))],
    [all]
  )

  const list = useMemo(() => {
    let r = all
    if (category) r = r.filter((p) => p.category === category)
    if (q) {
      const s = q.toLowerCase()
      r = r.filter((p) => `${p.name} ${p.brand || ''} ${p.category || ''}`.toLowerCase().includes(s))
    }
    if (sort === 'low') r = [...r].sort((a, b) => a.price - b.price)
    if (sort === 'high') r = [...r].sort((a, b) => b.price - a.price)
    return r
  }, [all, q, category, sort])

  const set = (k, v) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  return (
    <div className="container page">
      <h1>Products</h1>
      <div className="filters">
        <input
          type="search"
          placeholder="Search tools…"
          value={q}
          onChange={(e) => set('q', e.target.value)}
        />
        <select value={category} onChange={(e) => set('category', e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="new">Newest</option>
          <option value="low">Price: low to high</option>
          <option value="high">Price: high to low</option>
        </select>
      </div>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : list.length ? (
        <div className="grid">
          {list.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <p className="muted">No products found.</p>
      )}
    </div>
  )
}
