// Weekly bars for history, lighter bars with a whisker (≈80% range) for the forecast. Pure SVG.
function niceMax(v) {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const m = v / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p
}

const short = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export default function SalesChart({ history, forecast, tick, label }) {
  const W = 720
  const H = 280
  const L = 54
  const R = 10
  const T = 14
  const B = 34
  const all = [...history, ...forecast]
  const n = all.length
  const max = niceMax(Math.max(1, ...history.map((h) => h.value), ...forecast.map((f) => f.hi)))
  const bw = (W - L - R) / n
  const y = (v) => T + (H - T - B) * (1 - v / max)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * max)
  const every = Math.ceil(n / 8)

  return (
    <div>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: weekly history and forecast`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e3e3de" strokeWidth="1" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end">{tick(t)}</text>
          </g>
        ))}

        {history.map((h, i) => {
          const x = L + i * bw
          return (
            <rect key={`h${i}`} x={x + bw * 0.12} y={y(h.value)} width={bw * 0.76}
              height={Math.max(0, H - B - y(h.value))} rx="2" fill="#f5b800" />
          )
        })}

        {forecast.map((f, i) => {
          const x = L + (history.length + i) * bw
          const cx = x + bw / 2
          return (
            <g key={`f${i}`}>
              <rect x={x + bw * 0.12} y={y(f.value)} width={bw * 0.76}
                height={Math.max(0, H - B - y(f.value))} rx="2"
                fill="#f5b800" fillOpacity="0.35" stroke="#c99600" strokeDasharray="3 2" />
              <line x1={cx} x2={cx} y1={y(f.hi)} y2={y(f.lo)} stroke="#6b6b6b" strokeWidth="1.5" />
              <line x1={cx - 4} x2={cx + 4} y1={y(f.hi)} y2={y(f.hi)} stroke="#6b6b6b" strokeWidth="1.5" />
              <line x1={cx - 4} x2={cx + 4} y1={y(f.lo)} y2={y(f.lo)} stroke="#6b6b6b" strokeWidth="1.5" />
            </g>
          )
        })}

        {all.map((p, i) =>
          i % every === 0 ? (
            <text key={`x${i}`} x={L + i * bw + bw / 2} y={H - 12} textAnchor="middle">{short(p.start)}</text>
          ) : null
        )}

        {forecast.length > 0 && (
          <line x1={L + history.length * bw} x2={L + history.length * bw} y1={T} y2={H - B}
            stroke="#6b6b6b" strokeDasharray="4 3" />
        )}
      </svg>
      <div className="chart-legend">
        <span><i style={{ background: '#f5b800' }} />Actual (per week)</span>
        <span><i style={{ background: 'rgba(245,184,0,.35)', border: '1px dashed #c99600' }} />Forecast</span>
        <span><i style={{ background: '#6b6b6b', width: 2, height: 12 }} />Likely range (~80%)</span>
      </div>
    </div>
  )
}
