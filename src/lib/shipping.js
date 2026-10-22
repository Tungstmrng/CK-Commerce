import { supabase } from './supabase'

export const cartPayload = (items) => items.map((i) => ({ product_id: i.id, qty: i.qty }))

// Postgres errors arrive as "Some message" or "ERROR: Some message"; show just the message.
export const friendlyError = (msg = '') => {
  if (msg.includes('INSUFFICIENT_STOCK')) {
    return 'Sorry, an item just went out of stock. Please review your cart.'
  }
  if (/function .* does not exist|schema cache/i.test(msg)) {
    return 'Shipping is not set up yet. The shop owner needs to run supabase/update_v2.sql.'
  }
  return msg.replace(/^.*?ERROR:\s*/, '')
}

// ---- manual mode: prices come from the admin rate table, calculated inside Postgres ----
// Returns [{ company, name, service, service_code, group, duration, price }]
export async function quoteManual(province, city, items) {
  const { data, error } = await supabase.rpc('get_shipping_quote', {
    p_items: cartPayload(items),
    p_province: province,
    p_city: city,
  })
  if (error) throw new Error(friendlyError(error.message))
  return data?.rates || []
}

export async function checkoutManual({ customer, address, courier, notes, items }) {
  const { data, error } = await supabase.rpc('place_order_manual', {
    p_customer: customer,
    p_address: address,
    p_courier: courier,
    p_items: cartPayload(items),
    p_notes: notes || null,
  })
  if (error) throw new Error(friendlyError(error.message))
  return data
}
