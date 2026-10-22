// Edge Function: create-order
// Re-computes the subtotal from the database and re-quotes the chosen courier with Biteship,
// so the browser can never set its own prices. Stock is decremented atomically in place_order().
import { corsHeaders, json } from '../_shared/cors.ts'
import { getRates } from '../_shared/biteship.ts'
import { adminClient, loadLines, loadOrigin, numOrNull } from '../_shared/cart.ts'

const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const b = await req.json()

    const name = clean(b.customer?.name, 100)
    const phone = clean(b.customer?.phone, 30)
    const email = clean(b.customer?.email, 120)
    const addressLine = clean(b.address?.line, 400)
    const areaId = clean(b.address?.area_id, 100)
    if (!name || !phone || !addressLine || !areaId) {
      return json({ error: 'Please fill in your name, phone, area and street address' }, 400)
    }
    if (!/^[0-9+\-\s()]{8,20}$/.test(phone)) return json({ error: 'Phone number looks invalid' }, 400)
    if (!b.courier?.company || !b.courier?.service_code) {
      return json({ error: 'Please choose a courier' }, 400)
    }

    const db = adminClient()
    const [lines, origin] = await Promise.all([loadLines(db, b.items), loadOrigin(db)])

    const destLat = numOrNull(b.address?.lat)
    const destLng = numOrNull(b.address?.lng)
    const rates = await getRates({
      originAreaId: origin.areaId,
      destinationAreaId: areaId,
      originLat: origin.lat,
      originLng: origin.lng,
      destLat,
      destLng,
      items: lines,
    })
    const rate = rates.find(
      (r) => r.company === String(b.courier.company).toLowerCase() && r.service_code === b.courier.service_code
    )
    if (!rate) return json({ error: 'That courier option is no longer available. Please check shipping again.' }, 409)

    const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
    const shipping = Math.round(rate.price)
    const total = subtotal + shipping

    const { data, error } = await db.rpc('place_order', {
      p_order: {
        customer_name: name,
        phone,
        email,
        address: addressLine,
        area_id: areaId,
        area_name: clean(b.address?.area_name, 200),
        postal_code: clean(b.address?.postal_code, 10),
        dest_lat: destLat,
        dest_lng: destLng,
        courier_company: rate.company,
        courier_service: `${rate.name} ${rate.service}`.trim(),
        courier_service_code: rate.service_code,
        shipping_cost: shipping,
        subtotal,
        total,
        notes: clean(b.notes, 300),
      },
      p_items: lines,
    })
    if (error) {
      if (error.message.includes('INSUFFICIENT_STOCK')) {
        return json({ error: 'Sorry, an item just went out of stock. Please review your cart.' }, 409)
      }
      throw new Error(error.message)
    }

    return json({ order_no: data, subtotal, shipping_cost: shipping, total })
  } catch (e) {
    return json({ error: (e as Error).message }, 400)
  }
})
