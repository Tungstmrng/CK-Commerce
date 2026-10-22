import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext.jsx'
import BannerCarousel from '../components/BannerCarousel.jsx'
import ProductCard from '../components/ProductCard.jsx'

export default function Home() {
  const { settings } = useSettings()
  const [banners, setBanners] = useState([])
  const [featured, setFeatured] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [b, f, c] = await Promise.all([
        supabase.from('banners').select('*').eq('is_active', true).order('sort_order'),
        supabase
          .from('products')
          .select('*')
          .eq('is_active', true)
          .eq('is_featured', true)
          .order('created_at', { ascending: false })
          .limit(8),
        supabase.from('products').select('category').eq('is_active', true),
      ])
      if (!alive) return
      setBanners(b.data || [])
      setFeatured(f.data || [])
      setCategories([...new Set((c.data || []).map((r) => r.category).filter(Boolean))])
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <>
      {banners.length > 0 ? (
        <div className="container" style={{ paddingTop: '1rem' }}>
          <BannerCarousel banners={banners} />
        </div>
      ) : (
        <section className="hero">
          <div className="container">
            <h1>{settings.home_headline}</h1>
            <p>{settings.home_subheadline}</p>
            <Link className="btn" to="/products">Browse products</Link>
          </div>
        </section>
      )}

      {categories.length > 0 && (
        <section className="container section">
          <h2>Categories</h2>
          <div className="chips">
            {categories.map((c) => (
              <Link key={c} className="chip" to={`/products?category=${encodeURIComponent(c)}`}>
                {c}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="container section">
        <div className="row-between">
          <h2>Featured</h2>
          <Link to="/products">View all →</Link>
        </div>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : featured.length ? (
          <div className="grid">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <p className="muted">No featured products yet. Mark products as featured in the admin.</p>
        )}
      </section>
    </>
  )
}
