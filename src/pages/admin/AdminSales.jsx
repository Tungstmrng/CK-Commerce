import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { idr, idrCompact } from '../../lib/format'
import { buildDaily, toWeekly, sumRange, forecastSeries, productOutlook } from '../../lib/forecast'
import SalesChart from '../../components/SalesChart.jsx'

const DAYS = 364 // 52 complete weeks
const HISTORY_WEEKS = 26
const HORIZON = 8

const METRICS = {
  revenue: { label: 'Revenue', fmt: idr, tick: idrCompact },
  units: { label: 'Units sold', fmt: (n) => String(Math.round(n)), tick: (n) => String(Math.round(n)) },
  orders: { label: 'Orders', fmt: (n) => String(Math.round(n)), tick: (n) => String(Math.round(n)) },
}

const pct = (a, b) => (b > 0 ? ((a - b) / b) * 100 : null)

function Delta({ now, before }) {
  const p = pct(now, before)
  if (p === null) return <div className="delta muted">no data for the previous 30 days</div>
  return (
    <div className={`delta ${p >= 0 ? 'up' : 'down'}`}>
      {p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(0)}% vs previous 30 days
    </div>
  )
}

const STATUS = {
  now: ['Restock now', 'red'],
  soon: ['Restock soon', 'amber'],
  ok: ['OK', 'green'],
  nosales: ['No recent sales', 'grey'],
}

export default function AdminSales() {
  const [daily, setDaily] = useState(null)
  const [velocity, setVelocity] = useState([])
  const [metric, setMetric] = useState('revenue')
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      const [d, v] = await Promise.all([
        supabase.rpc('admin_sales_daily', { p_days: DAYS + 7 }),
        supabase.rpc('admin_product_velocity'),
      ])
      if (d.error || v.error) {
        const msg = (d.error || v.error).message
        setError(
          /function .* does not exist|schema cache/i.test(msg)
            ? 'The sales functions are missing. Run supabase/update_v2.sql in the Supabase SQL Editor.'
            : msg
        )
        setDaily([])
        return
      }
      setDaily(buildDaily(d.data || [], DAYS))
      setVelocity(v.data || [])
    })()
  }, [])

  const weekly = useMemo(() => (daily ? toWeekly(daily) : []), [daily])

  const result = useMemo(
    () => forecastSeries(weekly.map((w) => w[metric]), HORIZON),
    [weekly, metric]
  )

  const kpi = useMemo(() => {
    if (!daily?.length) return null
    return {
      rev: sumRange(daily, -30, 0, 'revenue'),
      revPrev: sumRange(daily, -60, -30, 'revenue'),
      orders: sumRange(daily, -30, 0, 'orders'),
      ordersPrev: sumRange(daily, -60, -30, 'orders'),
      units: sumRange(daily, -30, 0, 'units'),
    }
  }, [daily])

  const revForecast = useMemo(
    () => forecastSeries(weekly.map((w) => w.revenue), HORIZON),
    [weekly]
  )
  const next4 = revForecast.ok ? revForecast.forecast.slice(0, 4).reduce((s, f) => s + f.value, 0) : null

  const outlook = useMemo(
    () =>
      velocity
        .map((r) => ({ ...r, o: productOutlook(r) }))
        .sort((a, b) => {
          const rank = { now: 0, soon: 1, ok: 2, nosales: 3 }
          return rank[a.o.status] - rank[b.o.status] || a.o.daysLeft - b.o.daysLeft
        }),
    [velocity]
  )

  if (daily === null) return <p className="muted">Loading…</p>
  if (error) return <div className="alert">{error}</div>

  const m = METRICS[metric]
  const hist = weekly.slice(-HISTORY_WEEKS)
  const lastStart = hist.length ? hist[hist.length - 1].start : new Date()
  const forecastPoints = result.ok
    ? result.forecast.map((f, i) => {
        const start = new Date(lastStart)
        start.setDate(start.getDate() + 7 * (i + 1))
        return { ...f, start }
      })
    : []

  const noSales = weekly.length === 0

  return (
    <>
      <div className="row-between">
        <h3>Sales &amp; forecast</h3>
        <div className="seg" role="tablist" aria-label="Metric">
          {Object.entries(METRICS).map(([k, v]) => (
            <button key={k} className={metric === k ? 'on' : ''} onClick={() => setMetric(k)}>{v.label}</button>
          ))}
        </div>
      </div>

      {noSales ? (
        <div className="card card-body">
          <strong>No sales recorded yet.</strong>
          <p className="muted" style={{ marginBottom: 0 }}>
            Orders count once their status is Paid, Packed, Shipped or Completed. To preview this page with sample
            data, run <code>supabase/demo_sales.sql</code> in the Supabase SQL Editor (it can be removed again).
          </p>
        </div>
      ) : (
        <>
          <div className="kpis">
            <div className="card kpi">
              <div className="label">Revenue, last 30 days</div>
              <div className="value">{idr(kpi.rev)}</div>
              <Delta now={kpi.rev} before={kpi.revPrev} />
            </div>
            <div className="card kpi">
              <div className="label">Orders, last 30 days</div>
              <div className="value">{kpi.orders}</div>
              <Delta now={kpi.orders} before={kpi.ordersPrev} />
            </div>
            <div className="card kpi">
              <div className="label">Average order</div>
              <div className="value">{kpi.orders ? idr(kpi.rev / kpi.orders) : '—'}</div>
              <div className="delta muted">{kpi.units} units sold</div>
            </div>
            <div className="card kpi">
              <div className="label">Forecast revenue, next 4 weeks</div>
              <div className="value">{next4 === null ? '—' : idr(next4)}</div>
              <div className="delta muted">estimate</div>
            </div>
          </div>

          <div className="card chart-card">
            <strong>{m.label} per week</strong>
            {result.ok ? (
              <>
                <SalesChart history={hist.map((w) => ({ start: w.start, value: w[metric] }))}
                  forecast={forecastPoints} tick={m.tick} label={m.label} />
                <p className="muted small" style={{ marginBottom: 0 }}>
                  Next {HORIZON} weeks: about <strong>{m.fmt(result.forecast.reduce((s, f) => s + f.value, 0))}</strong> in total
                  ({m.fmt(result.forecast.reduce((s, f) => s + f.lo, 0))} – {m.fmt(result.forecast.reduce((s, f) => s + f.hi, 0))}).
                  Based on {result.weeksOfHistory} weeks of history; confidence <strong>{result.confidence}</strong>
                  {result.confidence !== 'good' && ' (it improves with more weeks of sales)'}.
                  The model follows recent level and trend only. It does not know about holidays, promotions or stock-outs.
                </p>
              </>
            ) : (
              <p className="muted">{result.reason}</p>
            )}
          </div>
        </>
      )}

      <h3>Stock outlook (next 30 days)</h3>
      <p className="muted small">
        Expected daily sales blend the last 14, 28 and 90 days, with recent days counting most. “Suggested restock”
        is the expected 30-day demand minus the stock you have now.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Product</th><th>Stock</th><th>Sold (28 d)</th><th>Expected 30 d</th><th>Stock lasts</th><th>Suggested restock</th><th></th></tr>
          </thead>
          <tbody>
            {outlook.map((r) => {
              const [text, color] = STATUS[r.o.status]
              return (
                <tr key={r.product_id}>
                  <td>{r.product_name}</td>
                  <td>{r.stock}</td>
                  <td>{r.units_28}</td>
                  <td>{r.o.demand.toFixed(r.o.demand < 10 ? 1 : 0)}</td>
                  <td>{Number.isFinite(r.o.daysLeft) ? `${Math.round(r.o.daysLeft)} days` : '—'}</td>
                  <td>{r.o.restock > 0 ? <strong>{r.o.restock}</strong> : '—'}</td>
                  <td><span className={`pill ${color}`}>{text}</span></td>
                </tr>
              )
            })}
            {!outlook.length && <tr><td colSpan="7" className="muted">No products yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
