import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

function Slide({ b }) {
  const content = (
    <div
      className="slide"
      style={b.image_url ? { backgroundImage: `url(${b.image_url})` } : undefined}
    >
      <div className="slide-text">
        <h2>{b.title}</h2>
        {b.subtitle && <p>{b.subtitle}</p>}
        {b.link_url && <span className="btn">Shop now</span>}
      </div>
    </div>
  )
  if (!b.link_url) return content
  return b.link_url.startsWith('http') ? (
    <a href={b.link_url}>{content}</a>
  ) : (
    <Link to={b.link_url}>{content}</Link>
  )
}

export default function BannerCarousel({ banners }) {
  const [i, setI] = useState(0)
  const n = banners.length

  useEffect(() => {
    if (n < 2) return
    const t = setInterval(() => setI((x) => (x + 1) % n), 5000)
    return () => clearInterval(t)
  }, [n])

  if (!n) return null
  const idx = i % n
  return (
    <div className="carousel">
      <Slide b={banners[idx]} />
      {n > 1 && (
        <div className="dots">
          {banners.map((b, k) => (
            <button
              key={b.id}
              aria-label={`Slide ${k + 1}`}
              className={k === idx ? 'on' : ''}
              onClick={() => setI(k)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
