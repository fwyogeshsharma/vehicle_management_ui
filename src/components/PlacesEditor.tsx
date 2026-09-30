import { useEffect, useState } from 'react'
import { geo } from '../api/resources'
import type { City, Place, State } from '../api/types'
import { useAsync } from './useAsync'

/**
 * Editing a set of "where does this run?" rows.
 *
 * A row is a state and, optionally, one city inside it. **A row with no city means the whole
 * state, and matches every city in it** — which is a genuinely different thing from listing the
 * cities individually, so the control says so rather than leaving a blank dropdown to be
 * interpreted.
 *
 * The city list is fetched per state and the choice is reset when the state changes: the API
 * refuses "Nagpur, Gujarat" with a 422, and offering the combination at all would be inviting it.
 */
export function PlacesEditor({
  value,
  onChange,
  disabled,
}: {
  value: Place[]
  onChange: (places: Place[]) => void
  disabled?: boolean
}) {
  const states = useAsync(() => geo.states(), [])

  function add() {
    const first = states.data?.[0]
    if (!first) return
    onChange([...value, { state_id: first.id, city_id: null }])
  }

  return (
    <div className="places">
      {value.length === 0 && (
        <p className="muted">
          No locations. <strong>That means it serves nowhere</strong> — it will not match any city
          search.
        </p>
      )}
      {value.map((place, i) => (
        <PlaceRow
          key={i}
          place={place}
          states={states.data ?? []}
          disabled={disabled}
          onChange={(next) => onChange(value.map((p, j) => (i === j ? next : p)))}
          onRemove={() => onChange(value.filter((_, j) => j !== i))}
        />
      ))}
      <button type="button" onClick={add} disabled={disabled || !states.data}>
        + Add a location
      </button>
    </div>
  )
}

function PlaceRow({
  place,
  states,
  disabled,
  onChange,
  onRemove,
}: {
  place: Place
  states: State[]
  disabled?: boolean
  onChange: (place: Place) => void
  onRemove: () => void
}) {
  const [cities, setCities] = useState<City[]>([])

  useEffect(() => {
    let live = true
    geo
      .citiesOfState(place.state_id)
      .then((list) => live && setCities(list))
      .catch(() => live && setCities([]))
    return () => {
      live = false
    }
  }, [place.state_id])

  return (
    <div className="place-row">
      <select
        value={place.state_id}
        disabled={disabled}
        onChange={(e) =>
          // The city must be in the named state, so changing the state clears it rather than
          // carrying over a city that now belongs somewhere else.
          onChange({ state_id: Number(e.target.value), city_id: null })
        }
      >
        {states.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select
        value={place.city_id ?? ''}
        disabled={disabled}
        onChange={(e) =>
          onChange({ ...place, city_id: e.target.value === '' ? null : Number(e.target.value) })
        }
      >
        <option value="">— the whole state —</option>
        {cities.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button type="button" className="link danger" onClick={onRemove} disabled={disabled}>
        Remove
      </button>
    </div>
  )
}

/** How a resolved location reads in a list. A null city is the whole state. */
export function placeLabel(stateName: string, cityName: string | null) {
  return cityName ?? `Anywhere in ${stateName}`
}
