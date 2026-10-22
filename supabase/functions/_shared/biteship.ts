// Thin wrapper around the Biteship REST API (https://biteship.com).
// One API key gives access to many couriers; activate the ones you want in the Biteship dashboard.

const BASE = 'https://api.biteship.com/v1'

// Courier codes sent to Biteship. Edit this list to add/remove couriers
// (e.g. add "sicepat", "anteraja", "lalamove").
export const COURIERS = 'gojek,grab,jne,lion,jnt'

// Couriers shown under the "Instant" tab. Anything else is "Regular".
const INSTANT_COMPANIES = ['gojek', 'grab', 'lalamove', 'borzo']
const INSTANT_TYPES = ['instant', 'same_day']

function headers() {
  const key = Deno.env.get('BITESHIP_API_KEY')
  if (!key) throw new Error('BITESHIP_API_KEY secret is not set')
  return { 'Content-Type': 'application/json', authorization: key }
}

export async function searchAreas(input: string) {
  const url = `${BASE}/maps/areas?countries=ID&type=single&input=${encodeURIComponent(input)}`
  const res = await fetch(url, { headers: headers() })
  const data = await res.json()
  if (!res.ok || data.success === false) throw new Error(data.error || 'Area search failed')
  return (data.areas || []).slice(0, 8).map((a: any) => ({
    id: a.id,
    name: a.name,
    postal_code: a.postal_code ? String(a.postal_code) : '',
  }))
}

export type RateInput = {
  originAreaId: string
  destinationAreaId: string
  originLat?: number | null
  originLng?: number | null
  destLat?: number | null
  destLng?: number | null
  items: { name: string; price: number; weight_grams: number; qty: number }[]
}

export async function getRates(i: RateInput) {
  const body: Record<string, unknown> = {
    origin_area_id: i.originAreaId,
    destination_area_id: i.destinationAreaId,
    couriers: COURIERS,
    items: i.items.map((x) => ({
      name: x.name,
      value: x.price,
      weight: x.weight_grams, // grams
      quantity: x.qty,
    })),
  }
  // Instant couriers (Gojek / Grab) price by coordinates.
  if (i.originLat != null && i.originLng != null) {
    body.origin_latitude = i.originLat
    body.origin_longitude = i.originLng
  }
  if (i.destLat != null && i.destLng != null) {
    body.destination_latitude = i.destLat
    body.destination_longitude = i.destLng
  }

  const res = await fetch(`${BASE}/rates/couriers`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok || data.success === false) {
    throw new Error(data.error || 'Could not get shipping rates')
  }
  return normalize(data.pricing || [])
}

function normalize(pricing: any[]) {
  return pricing
    .map((p) => ({
      company: String(p.courier_code || p.company || '').toLowerCase(),
      name: p.courier_name || p.company,
      service: p.courier_service_name,
      service_code: p.courier_service_code,
      type: p.type,
      description: p.description,
      duration: p.duration,
      price: Number(p.price),
      group:
        INSTANT_COMPANIES.includes(String(p.courier_code || p.company || '').toLowerCase()) ||
        INSTANT_TYPES.includes(p.type)
          ? 'instant'
          : 'regular',
    }))
    .filter((r) => Number.isFinite(r.price) && r.price > 0)
    .sort((a, b) => a.price - b.price)
}
