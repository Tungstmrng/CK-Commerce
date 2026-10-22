import regions from '../data/regions.json'

// Province and city/regency names for Indonesia.
// Source: idn-area-data (https://github.com/fityannugroho/idn-area-data), ODbL licence.
export const provinces = regions.map((p) => p.name)
export const citiesOf = (province) => regions.find((p) => p.name === province)?.cities || []
