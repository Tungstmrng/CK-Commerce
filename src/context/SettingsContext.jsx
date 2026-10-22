import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, configured } from '../lib/supabase'

const Ctx = createContext({ settings: {}, reload: () => {} })
export const useSettings = () => useContext(Ctx)

const DEFAULTS = {
  store_name: 'Tool Shop',
  announcement: '',
  whatsapp: '',
  home_headline: 'Power tools for every job',
  home_subheadline: 'Drills, grinders, saws and more — shipped across Indonesia.',
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS)

  const reload = useCallback(async () => {
    if (!configured) return
    const { data } = await supabase.from('site_settings').select('key,value')
    if (data) {
      const map = { ...DEFAULTS }
      data.forEach((r) => {
        map[r.key] = r.value
      })
      setSettings(map)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return <Ctx.Provider value={{ settings, reload }}>{children}</Ctx.Provider>
}
