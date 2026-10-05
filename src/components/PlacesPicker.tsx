import { useEffect, useMemo, useRef, useState } from 'react'
import type { City, Place } from '../api/types'
import { useMasters } from './useMasters'

/**
 * Where a truck runs, picked by typing.
 *
 * <p>The existing {@link PlacesEditor} is two cascading dropdowns — pick a state, wait for its
 * cities, pick a city. That is fine on a form someone fills in at a desk. It is wrong for a CSR
 * on a call, who has just been told "Ludhiana" and does not know or care which state that is in;
 * making them answer a question the system can answer for them is the difference between typing
 * four letters and scrolling a list of thirty-six.
 *
 * <p>So: one box, type-ahead across every state at once, over the cities from `GET /api/masters`.
 * Results
 * always carry their state, because <b>several states have a city of the same name</b> — there
 * are Aurangabads in Maharashtra and Bihar — and a list that showed bare names would be asking
 * the CSR to guess.
 *
 * <p>A whole state is still expressible, and deliberately kept: "runs all over Punjab" is a real
 * answer and a genuinely different claim from naming its cities one by one.
 */
export function PlacesPicker({
  value,
  onChange,
  disabled,
}: {
  value: Place[]
  onChange: (places: Place[]) => void
  disabled?: boolean
}) {
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // Every state and city arrives in the one masters call, so there is nothing to search remotely
  // and nothing to resolve: a chip's city name is a lookup, never a request, and never an id.
  const { states, cities } = useMasters()
  const cityNames = useMemo(
    () => Object.fromEntries(cities.map((c) => [c.id, c.name])) as Record<number, string>,
    [cities],
  )

  // Matches by name prefix first, then by containing the text, eight at most.
  const q = term.trim().toLowerCase()
  const matches: City[] =
    q.length < 2
      ? []
      : [
          ...cities.filter((c) => c.name.toLowerCase().startsWith(q)),
          ...cities.filter((c) => {
            const n = c.name.toLowerCase()
            return !n.startsWith(q) && n.includes(q)
          }),
        ].slice(0, 8)

  useEffect(() => {
    function away(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  const stateName = (id: number) => states.find((s) => s.id === id)?.name ?? `State ${id}`
  const already = (p: Place) =>
    value.some((v) => v.state_id === p.state_id && v.city_id === p.city_id)

  function add(place: Place) {
    if (!already(place)) onChange([...value, place])
    setTerm('')
    setOpen(false)
  }

  // A state matches when its name starts with what was typed, so "pun" offers "all of Punjab"
  // alongside the cities. Offered second, because naming a city is the commoner answer.
  const stateMatches =
    term.trim().length >= 2
      ? states.filter((s) => s.name.toLowerCase().startsWith(term.trim().toLowerCase()))
      : []

  return (
    <div className="places-picker" ref={box}>
      <ul className="place-chips">
        {value.map((p, i) => (
          <li key={`${p.state_id}-${p.city_id ?? 'all'}`}>
            {p.city_id ? (
              <span>
                {cityNames[p.city_id] ?? '…'}
                <span className="muted"> · {stateName(p.state_id)}</span>
              </span>
            ) : (
              <span>All of {stateName(p.state_id)}</span>
            )}
            {!disabled && (
              <button
                type="button"
                className="chip-remove"
                aria-label="Remove"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      {!disabled && (
        <div className="place-search">
          <input
            value={term}
            onChange={(e) => {
              setTerm(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder="Type a city — Ludhiana, Nagpur…"
          />
          {open && (matches.length > 0 || stateMatches.length > 0) && (
            <ul className="place-suggestions">
              {matches.map((c) => (
                <li key={`c${c.id}`}>
                  <button
                    type="button"
                    onClick={() => add({ state_id: c.state_id, city_id: c.id })}
                  >
                    {c.name}
                    {/* The state is not decoration: there are two Aurangabads. */}
                    <span className="muted small"> {stateName(c.state_id)}</span>
                  </button>
                </li>
              ))}
              {stateMatches.map((st) => (
                <li key={`s${st.id}`}>
                  <button
                    type="button"
                    onClick={() => add({ state_id: st.id, city_id: null })}
                  >
                    All of {st.name}
                    <span className="muted small"> every city in the state</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
