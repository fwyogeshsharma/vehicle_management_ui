import { useState } from 'react'
import { Link } from 'react-router-dom'
import { intakeActivity } from '../api/resources'
import type { IntakeSummary } from '../api/types'
import { Empty, Notice, Spinner } from '../components/Form'
import { useAsync } from '../components/useAsync'

/** The reader's own time zone, so "a day" on this page is a day on their clock. */
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

/** "Mon, 10 Nov 2026" from an ISO date, without a time zone shifting it a day. */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

const STATUS: Record<string, string> = {
  PENDING: 'Waiting for the desk',
  COMPLETED: 'Became a vehicle',
  DISCARDED: 'Discarded',
}

/**
 * Admin only: how many entries each person has added to Photo Intake, day by day.
 *
 * Pick a person to see their count per day; "Show entries" on a day lists every entry they added
 * that day. Only entries still on the system are counted: discarding an entry deletes it.
 */
export function IntakeActivityPage() {
  const [userId, setUserId] = useState<number | ''>('')
  const [day, setDay] = useState<string | null>(null)

  const uploaders = useAsync(() => intakeActivity.uploaders(), [])
  const daily = useAsync(
    () => (userId === '' ? Promise.resolve(null) : intakeActivity.daily(userId, TZ)),
    [userId],
  )
  const entries = useAsync(
    () =>
      userId === '' || day === null
        ? Promise.resolve(null)
        : intakeActivity.entries(userId, day, TZ),
    [userId, day],
  )

  const chosen = uploaders.data?.find((u) => u.user_id === userId)

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Entries by user</h1>
          <p className="muted">
            How many entries each person has added to Photo Intake, day by day. Discarded entries
            are deleted, so they are not counted.
          </p>
        </div>
      </header>

      <section className="card">
        <label className="activity-picker">
          <span className="read-label">User</span>
          <select
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value === '' ? '' : Number(e.target.value))
              setDay(null)
            }}
          >
            <option value="">Choose a user…</option>
            {uploaders.data?.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.name} — {u.total} {u.total === 1 ? 'entry' : 'entries'}
              </option>
            ))}
          </select>
        </label>
        {uploaders.loading && <Spinner />}
        {uploaders.error && <Notice kind="error">{uploaders.error.message}</Notice>}
        {uploaders.data && uploaders.data.length === 0 && (
          <Empty>Nobody has added an entry yet.</Empty>
        )}
      </section>

      {userId !== '' && (
        <section className="card">
          {daily.loading && <Spinner />}
          {daily.error && <Notice kind="error">{daily.error.message}</Notice>}
          {daily.data && (
            <>
              <h2>
                {chosen?.name} — {daily.data.total}{' '}
                {daily.data.total === 1 ? 'entry' : 'entries'} in total
              </h2>
              {daily.data.days.length === 0 ? (
                <Empty>No entries.</Empty>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Entries</th>
                      <th className="col-actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {daily.data.days.map((d) => (
                      <tr key={d.date} className={d.date === day ? 'row-selected' : undefined}>
                        <td>{dayLabel(d.date)}</td>
                        <td>{d.count}</td>
                        <td className="col-actions">
                          <button
                            type="button"
                            onClick={() => setDay(d.date === day ? null : d.date)}
                          >
                            {d.date === day ? 'Hide entries' : 'Show entries'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </section>
      )}

      {userId !== '' && day !== null && (
        <section className="card">
          <h2>
            {chosen?.name} — entries on {dayLabel(day)}
          </h2>
          {entries.loading && <Spinner />}
          {entries.error && <Notice kind="error">{entries.error.message}</Notice>}
          {entries.data && entries.data.length === 0 && <Empty>No entries that day.</Empty>}
          {entries.data && entries.data.length > 0 && <EntryTable rows={entries.data} />}
        </section>
      )}
    </div>
  )
}

function EntryTable({ rows }: { rows: IntakeSummary[] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Registration</th>
          <th>Driver / owner</th>
          <th>Company</th>
          <th>Status</th>
          <th>Vehicle</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{timeOf(r.created_at)}</td>
            <td>{r.plate ?? <span className="muted">no plate</span>}</td>
            <td>
              {r.driver_name ?? <span className="muted">—</span>}
              {r.mobiles.length > 0 && <div className="muted small">{r.mobiles.join(', ')}</div>}
            </td>
            <td>{r.company ?? <span className="muted">—</span>}</td>
            <td>{STATUS[r.review_status] ?? r.review_status}</td>
            <td>
              {r.vehicle_id ? (
                <Link to={`/vehicles/${r.vehicle_id}`}>Open vehicle</Link>
              ) : (
                <span className="muted">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
