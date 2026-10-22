import { createClient } from 'npm:@supabase/supabase-js@2'

export const adminClient = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

export type CartInput = { product_id: string; qty: number }[]

// Loads real prices/weights from the database. Never trust prices sent by the browser.
export async function loadLines(db: ReturnType<typeof adminClient>, cart: CartInput) {
  if (!Array.isArray(cart) || cart.length === 0) throw new Error('Cart is empty')
  if (cart.length > 50) throw new Error('Too many items')

  const qtyById = new Map<string, number>()
  for (const c of cart) {
    const qty = Math.floor(Number(c.qty))
    if (!c.product_id || !(qty > 0) || qty > 999) throw new Error('Invalid cart item')
    qtyById.set(c.product_id, (qtyById.get(c.product_id) || 0) + qty)
  }

  const { data, error } = await db
    .from('products')
    .select('id,name,price,stock,weight_grams')
    .in('id', [...qtyById.keys()])
    .eq('is_active', true)
  if (error) throw new Error(error.message)

  const byId = new Map((data || []).map((p: any) => [p.id, p]))
  return [...qtyById.entries()].map(([id, qty]) => {
    const p: any = byId.get(id)
    if (!p) throw new Error('A product in your cart is no longer available')
    if (p.stock < qty) throw new Error(`Not enough stock for ${p.name} (only ${p.stock} left)`)
    return {
      product_id: id,
      name: p.name as string,
      price: p.price as number,
      weight_grams: p.weight_grams as number,
      qty,
    }
  })
}

export async function loadOrigin(db: ReturnType<typeof adminClient>) {
  const { data } = await db
    .from('site_settings')
    .select('key,value')
    .in('key', ['origin_area_id', 'origin_lat', 'origin_lng'])
  const m: Record<string, string> = {}
  ;(data || []).forEach((r: any) => (m[r.key] = r.value))
  if (!m.origin_area_id) {
    throw new Error('Shop shipping origin is not configured yet (Admin → Settings)')
  }
  const num = (v?: string) => (v && v.trim() !== '' && !isNaN(Number(v)) ? Number(v) : null)
  return { areaId: m.origin_area_id, lat: num(m.origin_lat), lng: num(m.origin_lng) }
}

export const numOrNull = (v: unknown) =>
  v === undefined || v === null || v === '' || isNaN(Number(v)) ? null : Number(v)
