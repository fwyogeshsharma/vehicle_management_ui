import { useEffect, useId, useState } from 'react'
import type { ApiError } from '../api/client'
import { geo } from '../api/resources'
import type { City } from '../api/types'
import { Field } from './Form'
import { useAsync, useDebounced } from './useAsync'

/**
 * A place, suggested from the city list but not restricted to it.
 *
 * <p>Loads leave factory gates that no city list contains, so a name that matches nothing is
 * kept as the text typed and the form's `city_id` is cleared. `onPick` gets the matched city, or
 * null with the text.
 */
export function PlaceInput({
  label,
  name,
  value,
  error,
  required,
  onPick,
}: {
  label: string
  /** The snake_case name the API uses for this input. */
  name: string
  value: string
  error: ApiError | null
  required?: boolean
  onPick: (city: City | null, typed: string) => void
}) {
  const listId = 'cities-' + useId()
  const [term, setTerm] = useState(value)
  const debounced = useDebounced(term)
  const found = useAsync(
    () =>
      debounced.trim().length < 2
        ? Promise.resolve(null)
        : geo.searchCities(debounced.trim(), null, 8),
    [debounced],
  )

  useEffect(() => setTerm(value), [value])

  return (
    <Field label={label} name={name} error={error}>
      <input
        list={listId}
        required={required}
        value={term}
        onChange={(e) => {
          setTerm(e.target.value)
          const match = (found.data?.items ?? []).find((c) => c.name === e.target.value)
          onPick(match ?? null, e.target.value)
        }}
      />
      <datalist id={listId}>
        {(found.data?.items ?? []).map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
    </Field>
  )
}
