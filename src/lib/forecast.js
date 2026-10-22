// Sales forecasting helpers (no external libraries).
// Method: weekly totals -> one-off spikes (e.g. a bulk order) are capped -> Holt's linear smoothing with a
// damped trend and deliberately slow settings, chosen by the smallest one-step-ahead error.
// The range shown is an ~80% band derived from the model's own past errors.
// It does NOT model seasons, holidays or promotions.
// Tested with rolling 4-week-ahead back-tests on demo data and on simulated shops (steady, growing,
// declining and lumpy): clearly more accurate than the first version, which over-reacted to noisy weeks.

const pad = (n) => String(n).padStart(2, '0')
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// `days` complete days ending yesterday, zero-filled. rows come from admin_sales_daily().
export function buildDaily(rows, days, today = new Date()) {
  const map = new Map(rows.map((r) => [String(r.sale_date).slice(0, 10), r]))
  const end = new Date(today)
  end.setHours(0, 0, 0, 0)
  end.setDate(end.getDate() - 1)
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end)
    d.setDate(end.getDate() - i)
    const r = map.get(ymd(d))
    out.push({
      date: d,
      revenue: Number(r?.revenue || 0),
      orders: Number(r?.order_count || 0),
      units: Number(r?.units || 0),
    })
  }
  return out
}

// Blocks of 7 days (daily.length should be a multiple of 7). Leading weeks before the first sale are dropped.
export function toWeekly(daily) {
  const weeks = []
  for (let i = 0; i + 7 <= daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7)
    weeks.push({
      start: chunk[0].date,
      revenue: chunk.reduce((s, d) => s + d.revenue, 0),
      orders: chunk.reduce((s, d) => s + d.orders, 0),
      units: chunk.reduce((s, d) => s + d.units, 0),
    })
  }
  const first = weeks.findIndex((w) => w.revenue > 0 || w.orders > 0 || w.units > 0)
  return first === -1 ? [] : weeks.slice(first)
}

export function sumRange(daily, fromEndOffset, toEndOffset, key) {
  // offsets count back from the last day: (-30, 0) = last 30 days, (-60, -30) = the 30 days before
  const n = daily.length
  return daily.slice(n + fromEndOffset, n + toEndOffset || undefined).reduce((s, d) => s + d[key], 0)
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length

function quantile(a, q) {
  const s = [...a].sort((x, y) => x - y)
  const i = (s.length - 1) * q
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return s[lo] + (s[hi] - s[lo]) * (i - lo)
}

// Cap unusually large weeks (Tukey upper fence) so one bulk order does not drive the forecast.
export function capSpikes(y) {
  if (y.length < 4) return y
  const q1 = quantile(y, 0.25)
  const q3 = quantile(y, 0.75)
  const cap = Math.max(0, q3 + 1.5 * (q3 - q1))
  return y.map((v) => Math.min(v, cap))
}

const START = 3 // the level starts as the mean of the first 3 weeks
const ALPHAS = [0.05, 0.1, 0.2, 0.3, 0.4]
const BETAS = [0.01, 0.03, 0.05, 0.1, 0.2]

function holtRun(y, raw, a, b, phi) {
  let level = mean(y.slice(0, START))
  let trend = 0
  let sse = 0 // on spike-capped data: used to choose a and b
  let sseRaw = 0 // on the real numbers: used for the width of the range
  for (let t = START; t < y.length; t++) {
    const f = level + phi * trend
    sse += (y[t] - f) ** 2
    sseRaw += (raw[t] - f) ** 2
    const newLevel = a * y[t] + (1 - a) * f
    trend = b * (newLevel - level) + (1 - b) * phi * trend
    level = newLevel
  }
  return { level, trend, sse, sseRaw, n: y.length - START }
}

export function forecastSeries(raw, horizon = 8, damping = 0.9) {
  const n = raw.length
  const total = raw.reduce((s, v) => s + v, 0)
  if (n < 4 || total === 0) {
    return { ok: false, reason: 'Not enough history yet. At least 4 weeks with sales are needed.' }
  }

  const y = capSpikes(raw)
  let best = null
  for (const a of ALPHAS) {
    for (const b of BETAS) {
      const r = holtRun(y, raw, a, b, damping)
      if (!best || r.sse < best.sse) best = { ...r, a, b }
    }
  }

  const sigma = Math.max(Math.sqrt(best.sseRaw / Math.max(1, best.n)), 0.05 * Math.abs(best.level))
  const forecast = []
  let trendSum = 0
  let phi = 1
  for (let h = 1; h <= horizon; h++) {
    phi *= damping
    trendSum += phi * best.trend
    const value = Math.max(0, best.level + trendSum)
    const half = BAND * sigma * Math.sqrt(1 + 0.25 * (h - 1)) // ~80% band, widening slowly
    forecast.push({ value, lo: Math.max(0, value - half), hi: value + half })
  }

  return {
    ok: true,
    forecast,
    weeksOfHistory: n,
    confidence: n >= 26 ? 'good' : n >= 12 ? 'fair' : 'low',
    alpha: best.a,
    beta: best.b,
  }
}

const BAND = 1.28 // z-value for an ~80% range

// Per-product restock hint from units sold in the last 14 / 28 / 90 days.
// Recent weeks weigh more, so a product that just took off is noticed quickly.
export function productOutlook(row, horizonDays = 30) {
  const u14 = Number(row.units_14 || 0)
  const u28 = Number(row.units_28 || 0)
  const u90 = Number(row.units_90 || 0)
  const stock = Number(row.stock || 0)
  const perDay = 0.5 * (u14 / 14) + 0.3 * (u28 / 28) + 0.2 * (u90 / 90)
  const demand = perDay * horizonDays
  const daysLeft = perDay > 0 ? stock / perDay : Infinity
  let status = 'ok'
  if (perDay === 0) status = 'nosales'
  else if (stock === 0 || daysLeft < 7) status = 'now'
  else if (daysLeft < 21) status = 'soon'
  return {
    perDay,
    demand,
    daysLeft,
    status,
    restock: Math.max(0, Math.ceil(demand - stock)),
  }
}
