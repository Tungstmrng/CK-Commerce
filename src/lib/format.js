export const idr = (n) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0)

// Short axis labels: 1.5 jt, 250 rb, 2 M
export const idrCompact = (n) => {
  const v = Number(n) || 0
  const abs = Math.abs(v)
  const trim = (x) => String(Math.round(x * 10) / 10).replace('.', ',')
  if (abs >= 1e9) return `${trim(v / 1e9)} M`
  if (abs >= 1e6) return `${trim(v / 1e6)} jt`
  if (abs >= 1e3) return `${trim(v / 1e3)} rb`
  return String(Math.round(v))
}

export const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

export const kg = (grams) => `${(grams / 1000).toFixed(grams % 1000 === 0 ? 0 : 2)} kg`
