import { useState } from 'react'
import { Link } from 'react-router-dom'
import { companies, geo, users, vehicles } from '../api/resources'
import type { City } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Empty, Notice, Spinner } from '../components/Form'
import { useAsync, useDebounced } from '../components/useAsync'

/**
 * The dashboard.
 *
 * Counts come from `total` on a one-row page rather than by fetching everything and calling
 * `.length` — the list endpoints are paged, so counting client-side would report at most a page
 * and be quietly wrong the moment the fleet outgrew it.
 */
export function DashboardPage() {
  const { user } = useAuth()

  const counts = useAsync(async () => {
    const one = { page: 1, page_size: 1 }
    // `everyone`, not `users` -- a local of that name would shadow the imported client and
    // land in its own temporal dead zone inside this very Promise.all.
    const [allVehicles, live, companyCount, driverCount, everyone] = await Promise.all([
      vehicles.list({ ...one }),
      vehicles.list({ ...one, active: true }),
      companies.list({ ...one, active: true }),
      users.list({ ...one, type: 'DRIVER' }),
      users.list({ ...one }),
    ])
    return {
      vehicles: allVehicles.total,
      active: live.total,
      retired: allVehicles.total - live.total,
      companies: companyCount.total,
      drivers: driverCount.total,
      users: everyone.total,
    }
  }, [])

  return (
    <div className="stack">
      <header className="page-header">
        <h1>Dashboard</h1>
        <p className="muted">Signed in as {user?.name}.</p>
      </header>

      {counts.error && <Notice kind="error">{counts.error.message}</Notice>}
      {counts.loading && <Spinner />}

      {counts.data && (
        <div className="tiles">
          <Tile to="/vehicles" label="Vehicles" value={counts.data.vehicles} />
          <Tile to="/vehicles?active=true" label="On the road" value={counts.data.active} />
          <Tile to="/vehicles?active=false" label="Retired" value={counts.data.retired} />
          <Tile to="/companies" label="Companies" value={counts.data.companies} />
          <Tile to="/drivers?type=DRIVER" label="Drivers" value={counts.data.drivers} />
          <Tile to="/drivers" label="Users on file" value={counts.data.users} />
        </div>
      )}

      <WhoServesThisCity />
    </div>
  )
}

function Tile({ to, label, value }: { to: string; label: string; value: number }) {
  return (
    <Link className="tile" to={to}>
      <span className="tile-value">{value}</span>
      <span className="tile-label">{label}</span>
    </Link>
  )
}

/**
 * "Which trucks can reach this city?"
 *
 * The question the whole location model exists to answer, so it belongs on the front page. Two
 * things about it are worth showing rather than hiding: a whole-state preference matches every
 * city in that state, and the search asks for **active** vehicles explicitly, because the API
 * treats location and activity as independent filters.
 */
function WhoServesThisCity() {
  const [term, setTerm] = useState('')
  const debounced = useDebounced(term)
  const [city, setCity] = useState<City | null>(null)

  const matches = useAsync(
    () =>
      debounced.trim().length < 2
        ? Promise.resolve({ items: [] as City[], total: 0, page: 1, page_size: 0 })
        : geo.searchCities(debounced.trim(), null, 8),
    [debounced],
  )

  const serving = useAsync(
    () =>
      city
        ? vehicles.list({ serving_city_id: city.id, active: true, page_size: 50 })
        : Promise.resolve(null),
    [city?.id],
  )

  return (
    <section className="card">
      <h2>Which trucks serve a city?</h2>
      <p className="muted">
        A vehicle matches if it prefers that city, or prefers the whole state it is in. A
        company's trucks use the company's locations.
      </p>

      <input
        className="search"
        placeholder="Start typing a city — Nagpur, Surat, Pune…"
        value={term}
        onChange={(e) => {
          setTerm(e.target.value)
          setCity(null)
        }}
      />

      {!city && matches.data && matches.data.items.length > 0 && (
        <ul className="suggestions">
          {matches.data.items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="link"
                onClick={() => {
                  setCity(c)
                  setTerm(c.name)
                }}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {city && serving.loading && <Spinner label={`Finding trucks for ${city.name}…`} />}
      {city && serving.error && <Notice kind="error">{serving.error.message}</Notice>}
      {city && serving.data && (
        <>
          {serving.data.items.length === 0 ? (
            <Empty>
              No vehicle on the road serves <strong>{city.name}</strong>. Give a truck a preferred
              location, or give its company one.
            </Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Registration</th>
                  <th>Capacity</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {serving.data.items.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <Link to={`/vehicles/${v.id}`}>{v.registration_number}</Link>
                    </td>
                    <td>{v.capacity ?? '—'}</td>
                    <td>{v.company_owned ? 'A company' : 'Owner-driver'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  )
}
