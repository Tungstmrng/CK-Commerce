import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase'

// Calls a Supabase Edge Function and always returns parsed JSON.
// Throws an Error with a readable message when the function responds with an error.
export async function callFn(name, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}
