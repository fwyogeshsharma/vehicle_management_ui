import { useState } from 'react'
import type { Capacity } from '../api/types'

/** The select value standing for "keep the saved capacity, which is not on the list". */
export const SAVED_CAPACITY = 'saved'

type Pick = number | '' | typeof SAVED_CAPACITY

/**
 * The capacity dropdown on a form that edits an existing vehicle.
 *
 * `vehicles.capacity` is free text, so a vehicle can hold a label the pick list does not have —
 * an import's "20 Ton", or a rung retired since. Matching only against the list showed such a
 * vehicle as "Not known" and sent no capacity, which the API refuses: the form could not be
 * saved without the user changing a field they never touched. The saved label is offered as its
 * own option instead, and sent back as text when it is still the choice.
 *
 * The pick stays `null` until the user changes it, so the saved value shows even if the list
 * arrives after the form opens.
 */
export function useCapacityPick(saved: string | null, list: Capacity[]) {
  const [pick, setPick] = useState<Pick | null>(null)
  const onList = list.find((c) => c.label === saved)
  const offList = saved && !onList ? saved : null
  const value: Pick = pick ?? onList?.id ?? (offList ? SAVED_CAPACITY : '')

  function onChange(raw: string) {
    setPick(raw === '' ? '' : raw === SAVED_CAPACITY ? SAVED_CAPACITY : Number(raw))
  }

  /** What to put in the request: the pick-list id, or the saved text when that is kept. */
  const body =
    value === SAVED_CAPACITY
      ? { capacity: offList, capacity_id: null }
      : { capacity_id: value === '' ? null : value }

  return { value, onChange, offList, body }
}
