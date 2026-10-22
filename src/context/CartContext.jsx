import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const Ctx = createContext(null)
export const useCart = () => useContext(Ctx)

const KEY = 'toolshop-cart-v1'

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || []
  } catch {
    return []
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items))
    } catch {
      /* storage unavailable */
    }
  }, [items])

  const api = useMemo(() => {
    const add = (p, qty = 1) =>
      setItems((cur) => {
        const found = cur.find((i) => i.id === p.id)
        const max = p.stock ?? 999
        if (found) {
          return cur.map((i) =>
            i.id === p.id ? { ...i, qty: Math.min(max, i.qty + qty), stock: p.stock } : i
          )
        }
        return [
          ...cur,
          {
            id: p.id,
            slug: p.slug,
            name: p.name,
            price: p.price,
            weight_grams: p.weight_grams,
            image: p.images?.[0] || null,
            stock: p.stock,
            qty: Math.min(max, qty),
          },
        ]
      })
    const setQty = (id, qty) =>
      setItems((cur) =>
        cur
          .map((i) => (i.id === id ? { ...i, qty: Math.max(0, Math.min(i.stock ?? 999, qty)) } : i))
          .filter((i) => i.qty > 0)
      )
    const remove = (id) => setItems((cur) => cur.filter((i) => i.id !== id))
    const clear = () => setItems([])
    const count = items.reduce((s, i) => s + i.qty, 0)
    const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0)
    const weight = items.reduce((s, i) => s + i.qty * (i.weight_grams || 0), 0)
    return { items, add, setQty, remove, clear, count, subtotal, weight }
  }, [items])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}
