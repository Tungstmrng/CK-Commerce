// Edge Function: shipping
//   { action: "areas", input: "lowokwaru malang" }   -> destination autocomplete
//   { action: "rates", destination_area_id, destination_lat?, destination_lng?, items: [{product_id, qty}] }
//                                                    -> courier options with prices
import { corsHeaders, json } from '../_shared/cors.ts'
import { searchAreas, getRates } from '../_shared/biteship.ts'
import { adminClient, loadLines, loadOrigin, numOrNull } from '../_shared/cart.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json()

    if (body.action === 'areas') {
      const input = String(body.input || '').trim()
      if (input.length < 3) return json({ areas: [] })
      return json({ areas: await searchAreas(input) })
    }

    if (body.action === 'rates') {
      if (!body.destination_area_id) return json({ error: 'Destination area is required' }, 400)
      const db = adminClient()
      const [lines, origin] = await Promise.all([loadLines(db, body.items), loadOrigin(db)])
      const rates = await getRates({
        originAreaId: origin.areaId,
        destinationAreaId: String(body.destination_area_id),
        originLat: origin.lat,
        originLng: origin.lng,
        destLat: numOrNull(body.destination_lat),
        destLng: numOrNull(body.destination_lng),
        items: lines,
      })
      return json({ rates })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 400)
  }
})
