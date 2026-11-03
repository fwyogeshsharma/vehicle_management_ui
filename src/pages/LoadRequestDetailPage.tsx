import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { loadRequests } from '../api/resources'
import type { LoadRequest } from '../api/types'
import { Empty, FormError, Notice, Spinner } from '../components/Form'
import { plateOf } from '../components/plate'
import { useAsync } from '../components/useAsync'
import { useMasters } from '../components/useMasters'

const STATUS_LABEL: Record<LoadRequest['status'], string> = {
  OPEN: 'Open',
  FULFILLED: 'Fulfilled',
  CANCELLED: 'Cancelled',
}

const rupees = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: 2 })

/**
 * One load request, with the vehicles that could carry it underneath.
 *
 * <p>The request's own details sit at the top so the vehicles below are read against what was
 * asked for: the route, the weight, how many trucks, who to ring. Opened from the "Vehicles"
 * button on the Load requests list.
 */
export function LoadRequestDetailPage() {
  const { id } = useParams()
  const request = useAsync(() => loadRequests.get(Number(id)), [id])
  const navigate = useNavigate()
  // Back goes to the list exactly as it was left (its day and filters live in the address); a
  // page opened directly in a new tab has no such history, so it falls back to the plain list.
  const cameFromList = useLocation().key !== 'default'

  if (request.loading && !request.data) return <Spinner />
  if (request.error || !request.data) return <FormError error={request.error} />
  const r = request.data

  return (
    <div className="stack">
      <p>
        <button
          type="button"
          className="link"
          onClick={() => (cameFromList ? navigate(-1) : navigate('/load-requests'))}
        >
          ← Load requests
        </button>
      </p>

      <RequestSummary request={r} />
      <MatchingVehicles request={r} />
    </div>
  )
}

function RequestSummary({ request: r }: { request: LoadRequest }) {
  const masters = useMasters()
  const truckType = masters.bodyTypes.find((b) => b.id === r.body_type_id)?.name

  return (
    <section className="card">
      <header className="page-header">
        <div>
          <h1>{r.company_name}</h1>
          <p className="muted">
            {r.from_place} <span className="arrow">→</span> {r.to_place} · asked on{' '}
            {r.request_date}
          </p>
        </div>
        <span className={'status-chip status-' + r.status.toLowerCase()}>
          {STATUS_LABEL[r.status]}
        </span>
      </header>

      <div className="facts">
        <Fact label="Goods">{r.goods ?? '—'}</Fact>
        <Fact label="Total weight">{r.weight_tons === null ? '—' : `${r.weight_tons} tons`}</Fact>
        <Fact label="Trucks required">{r.trucks_required}</Fact>
        <Fact label="Truck type">{truckType ?? '—'}</Fact>
        <Fact label="Load by">{r.loading_date ?? '—'}</Fact>
        <Fact label="Price offered">
          {r.offered_price === null ? '—' : `₹${rupees(r.offered_price)} total`}
        </Fact>
        <Fact label="Contact">
          {r.contact_name ?? '—'}
          {r.contact_mobile && <div className="muted small">{r.contact_mobile}</div>}
        </Fact>
        <Fact label="Recorded by">{r.recorded_by ?? '—'}</Fact>
        {r.notes && (
          <Fact label="Notes" wide>
            {r.notes}
          </Fact>
        )}
      </div>
    </section>
  )
}

/** One labelled value in the summary's grid. `wide` spans the whole row, for long text. */
function Fact({
  label,
  wide,
  children,
}: {
  label: string
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={'fact' + (wide ? ' fact-wide' : '')}>
      <span className="fact-label">{label}</span>
      <span className="fact-value">{children}</span>
    </div>
  )
}

/**
 * The Vehicles-tab entries that run where this request wants to go.
 *
 * <p>"Both places" is the strict question (the truck serves the pickup and the drop) and the
 * default; "Either place" widens it, because a truck's list of places is what it was told it
 * runs, not an exhaustive route, and the strict answer is often short. Matching uses the cities
 * on file: a place that is not on the city list cannot be matched, and the page says so instead
 * of showing a bare empty list.
 */
function MatchingVehicles({ request: r }: { request: LoadRequest }) {
  const [match, setMatch] = useState<'both' | 'either'>('both')
  const masters = useMasters()
  const found = useAsync(() => loadRequests.vehicles(r.id, match), [r.id, match])
  const bodyType = (id: number | null) =>
    id === null ? '—' : (masters.bodyTypes.find((b) => b.id === id)?.name ?? '—')

  return (
    <section className="card">
      <div className="match-head">
        <h2>
          Matching vehicles
          {found.data && <span className="muted"> ({found.data.vehicles.length})</span>}
        </h2>
        <span className="match-mode">
          <label className="check">
            <input
              type="radio"
              name="match"
              checked={match === 'both'}
              onChange={() => setMatch('both')}
            />
            Both places
          </label>
          <label className="check">
            <input
              type="radio"
              name="match"
              checked={match === 'either'}
              onChange={() => setMatch('either')}
            />
            Either place
          </label>
        </span>
      </div>
      <p className="muted small">
        Active vehicles that run{' '}
        {match === 'both' ? 'to both' : 'to at least one of'} {r.from_place} and {r.to_place}, by
        the places on each vehicle or its company.
      </p>

      {found.error && <Notice kind="error">{found.error.message}</Notice>}
      {found.loading && !found.data && <Spinner />}

      {found.data && (
        <>
          {!found.data.from_matchable && (
            <Notice kind="warn">
              “{r.from_place}” is not on the city list, so no vehicle can be matched to it.
            </Notice>
          )}
          {!found.data.to_matchable && (
            <Notice kind="warn">
              “{r.to_place}” is not on the city list, so no vehicle can be matched to it.
            </Notice>
          )}
          {found.data.vehicles.length === 0 ? (
            <Empty>
              {found.data.match === 'both'
                ? 'No active vehicle runs to both places. Try “Either place”.'
                : 'No active vehicle runs to either place.'}
            </Empty>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Capacity</th>
                    <th>Type</th>
                    <th>Contact</th>
                    <th>Runs in</th>
                  </tr>
                </thead>
                <tbody>
                  {found.data.vehicles.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <Link to={`/vehicles/${v.id}`}>{plateOf(v)}</Link>
                      </td>
                      <td>{v.capacity ?? '—'}</td>
                      <td>{bodyType(v.body_type_id)}</td>
                      <td>
                        {v.contact_name ?? '—'}
                        {v.contact_mobile && <div className="muted small">{v.contact_mobile}</div>}
                      </td>
                      <td className="muted small">
                        {v.locations ?? '—'}
                        {v.location_count > 3 && ` +${v.location_count - 3} more`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}
