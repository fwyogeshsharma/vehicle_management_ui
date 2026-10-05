import { useMemo } from 'react'
import { geo } from '../api/resources'
import type { BodyType, Capacity, City, GoodsTypeRef, State } from '../api/types'
import { useAsync } from './useAsync'

/**
 * The pick lists — states and their cities, capacities, body types, goods types — from the one
 * `GET /api/masters` call, shaped like the per-list endpoints so the forms need not care which
 * they came from.
 *
 * <p>The masters call lists what can be chosen today, so everything it returns is `active`. The
 * per-list endpoints remain for the screens that must also see retired entries: the Masters
 * admin page, and the vehicle list, which has to name a body type a truck still carries after
 * the type was retired.
 */
export function useMasters() {
  const masters = useAsync(() => geo.masters(), [])

  const lists = useMemo(() => {
    const m = masters.data
    const states: State[] = (m?.states ?? []).map((s) => ({ id: s.id, code: s.code, name: s.name }))
    const cities: City[] = (m?.states ?? []).flatMap((s) =>
      s.cities.map((c) => ({ id: c.id, name: c.name, state_id: s.id, active: true })),
    )
    const bodyTypes: BodyType[] = (m?.body_types ?? []).map((b) => ({ ...b, active: true }))
    const capacities: Capacity[] = (m?.capacities ?? []).map((c) => ({
      id: c.id,
      label: c.label,
      tons: String(c.tons),
      active: true,
    }))
    const goodsTypes: GoodsTypeRef[] = (m?.goods_types ?? []).map((g) => ({ ...g, active: true }))
    return { states, cities, bodyTypes, capacities, goodsTypes }
  }, [masters.data])

  return {
    ...lists,
    loading: masters.loading,
    error: masters.error,
    loaded: masters.data !== null,
  }
}
