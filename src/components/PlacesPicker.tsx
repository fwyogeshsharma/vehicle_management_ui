import { useEffect, useRef, useState } from 'react'
import { geo } from '../api/resources'
import type { City, Place, State } from '../api/types'

/**
 * Where a truck runs, picked by typing.
 *
 * <p>The existing {@link PlacesEditor} is two cascading dropdowns — pick a state, wait for its
 * cities, pick a city. That is fine on a form someone fills in at a desk. It is wrong for a CSR
 * on a call, who has just been told "Ludhiana" and does not know or care which state that is in;
 * making them answer a question the system can answer for them is the difference between typing
 * four letters and scrolling a list of thirty-six.
 *
 * <p>So: one box, type-ahead across every state at once, backed by `GET /api/cities?q=`. Results
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
  const [matches, setMatches] = useState<City[]>([])
  const [states, setStates] = useState<State[]>([])
  const [open, setOpen] = useState(false)
  // id -> name for every city this component has ever seen, from a search or from resolving a
  // place that arrived from the server. Chips outlive the search that produced them, and without
  // this the label falls back to the id — which this codebase has printed at a user before.
  const [cityNames, setCityNames] = useState<Record<number, string>>({})
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    geo.states().then(setStates).catch(() => setStates([]))
  }, [])

  // Resolve any city that came in on `value` but whose name we have never seen. The API has no
  // "get one city" endpoint, so this fetches the referenced state's cities — one request per
  // state, once, exactly as CompanyDetailPage does.
  const unresolved = value
    .map((p) => p.city_id)
    .filter((id): id is number => id !== null && cityNames[id] === undefined)
  const unresolvedKey = unresolved.join(',')
  useEffect(() => {
    if (unresolved.length === 0) return
    const statesToFetch = [
      ...new Set(value.filter((p) => p.city_id && !cityNames[p.city_id]).map((p) => p.state_id)),
    ]
    let live = true
    Promise.all(statesToFetch.map((id) => geo.citiesOfState(id).catch(() => [] as City[])))
      .then((lists) => {
        if (!live) return
        const found: Record<number, string> = {}
        for (const list of lists) for (const c of list) found[c.id] = c.name
        setCityNames((prev) => ({ ...found, ...prev }))
      })
    return () => {
      live = false
    }
  }, [unresolvedKey])

  // Debounced, and every stale answer discarded: without the `live` guard the reply for "Lud"
  // can land after the reply for "Ludhi" and replace a good list with a worse one.
  useEffect(() => {
    const q = term.trim()
    if (q.length < 2) {
      setMatches([])
      return
    }
    let live = true
    const timer = setTimeout(() => {
      geo
        .searchCities(q, null, 8)
        .then((page) => {
          if (!live) return
          setMatches(page.items)
          setCityNames((prev) => {
            const next = { ...prev }
            for (const c of page.items) next[c.id] = c.name
            return next
          })
        })
        .catch(() => live && setMatches([]))
    }, 250)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [term])

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

  function add(place: Place, name?: string) {
    if (place.city_id && name) {
      setCityNames((prev) => ({ ...prev, [place.city_id as number]: name }))
    }
    if (!already(place)) onChange([...value, place])
    setTerm('')
    setMatches([])
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
                    onClick={() => add({ state_id: c.state_id, city_id: c.id }, c.name)}
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
