import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { geo, intake, photoObjectUrl } from '../api/resources'
import type {
  BodyType,
  Capacity,
  IntakeLookup,
  IntakeSummary,
  IntakeTab,
  Place,
} from '../api/types'
import { Empty, Field, FormError, Notice, Spinner } from '../components/Form'
import { Pager } from '../components/Pager'
import {
  ConfirmAction,
  DeleteAction,
  EditAction,
  RetryAction,
} from '../components/RowActions'
import { PlacesEditor } from '../components/PlacesEditor'
import { PlacesPicker } from '../components/PlacesPicker'
import { useAsync } from '../components/useAsync'

const TABS: { tab: IntakeTab; label: string }[] = [
  { tab: 'ALL', label: 'Everything' },
  { tab: 'TO_CALL', label: 'To call' },
  { tab: 'WAITING', label: 'Waiting for OCR' },
  { tab: 'FAILED', label: 'OCR failed' },
  { tab: 'COMPLETED', label: 'Done' },
  { tab: 'DISCARDED', label: 'Discarded' },
]

/**
 * The CSR's worklist: photos from the field, read by OCR, waiting for a phone call.
 *
 * <p>The queue that matters is <strong>To call</strong> — rows OCR has finished with. The CSR
 * rings the number, fills in what the machine could not read, and the row becomes a vehicle.
 *
 * <p>Failed rows get their own tab and a Retry button. FreightDesk shows a failure only as a
 * hover-only red chip that cannot be filtered, counted or retried from the UI, so in practice
 * nobody ever finds one.
 */
export function IntakePage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') ?? 'ALL') as IntakeTab
  const page = Number(params.get('page') ?? 1)

  const counts = useAsync(() => intake.counts(), [])
  const list = useAsync(() => intake.list(tab, page), [tab, page])
  const bodyTypes = useAsync(() => geo.bodyTypes(false), [])
  const capacities = useAsync(() => geo.capacities(false), [])

  function go(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null) merged.delete(k)
      else merged.set(k, v)
    }
    if (!('page' in next)) merged.delete('page')
    setParams(merged, { replace: true })
  }

  function reloadAll() {
    list.reload()
    counts.reload()
  }

  const countFor = (t: IntakeTab) => {
    const c = counts.data
    if (!c) return null
    switch (t) {
      case 'TO_CALL': return c.to_call
      case 'WAITING': return c.waiting
      case 'FAILED': return c.failed
      case 'COMPLETED': return c.completed
      case 'DISCARDED': return c.discarded
      default: return null
    }
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Photo intake</h1>
          <p className="muted">
            Trucks photographed in the field. OCR reads what it can; you ring the driver for the
            rest.
          </p>
        </div>
      </header>

      {/*
        A select, not six buttons. The buttons were a row of cards wider than the table under
        them, and they grew every time a state was added; a filter is one control that says which
        slice you are looking at and how many are in it.
      */}
      <div className="filters card">
        <label className="filter-label">
          <span>Show</span>
          <select
            value={tab}
            onChange={(e) => go({ tab: e.target.value === 'ALL' ? null : e.target.value })}
          >
            {TABS.map((t) => {
              const n = countFor(t.tab)
              return (
                <option key={t.tab} value={t.tab}>
                  {t.label}
                  {n !== null ? ` (${n})` : ''}
                </option>
              )
            })}
          </select>
        </label>
      </div>

      {list.error && <Notice kind="error">{list.error.message}</Notice>}
      {list.loading && !list.data && <Spinner />}

      {list.data && list.data.items.length === 0 && (
        <Empty>
          {tab === 'TO_CALL'
            ? 'Nothing to call. Photos appear here once OCR has read them.'
            : 'Nothing here.'}
        </Empty>
      )}

      {list.data?.items.map((row) => (
        <IntakeCard
          key={row.id}
          row={row}
          bodyTypes={bodyTypes.data ?? []}
          capacities={capacities.data ?? []}
          onChanged={reloadAll}
        />
      ))}

      {list.data && list.data.items.length > 0 && (
        <Pager
          page={list.data}
          onPage={(p) => go({ page: String(p) })}
          onPageSize={() => undefined}
        />
      )}
    </div>
  )
}

/**
 * One photo from the field, with what the machine made of it.
 *
 * <p>The photos sit beside the reads so the CSR can check the machine against the pixels
 * without leaving the row — the single best idea in FreightDesk's review screen.
 */
function IntakeCard({
  row,
  bodyTypes,
  capacities,
  onChanged,
}: {
  row: IntakeSummary
  bodyTypes: BodyType[]
  capacities: Capacity[]
  onChanged: () => void
}) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [viewing, setViewing] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <div className="intake-row">
        {/*
          One thumbnail, whatever the photo count. Rendering all of them made the photo column
          as wide as the busiest row, so a two-photo intake shunted everything 150px right of
          every other row and the list stopped being scannable. Browsing the rest is the
          viewer's job, and it opens on this one.
        */}
        <div className="intake-vehicle">
          {row.photo_count > 0 ? (
            <IntakePhoto intakeId={row.id} index={0} onOpen={setViewing} />
          ) : (
            <span className="photo-none" />
          )}
          <div className="vehicle-id">
            <button
              type="button"
              className="plate"
              onClick={() => row.photo_count > 0 && setViewing(0)}
              title={row.photo_count > 0 ? 'Open the photo' : undefined}
            >
              {row.plate ?? <span className="muted">no plate</span>}
            </button>
            {row.plate && row.edited_plate === null && row.ocr_confidence === 'LOW' && (
              <span className="read-note" title="Only one photo produced this plate">
                read once
              </span>
            )}
            <div className="muted small">
              <span title={new Date(row.created_at).toLocaleString()}>
                {ageOf(row.created_at)}
              </span>
              {row.photo_count > 1 && ` · ${row.photo_count} photos`}
            </div>
          </div>
        </div>

        {/*
          Only what is known. An earlier version printed a labelled row per field whether or not
          it held anything, so an untouched report was seven lines of "ask on the call" — seven
          lines saying nothing, on every card, pushing the ones that DID carry something off the
          screen. Absent facts are simply not shown.
        */}
        <div className="intake-details">
          <Facts row={row} bodyTypes={bodyTypes} />
        </div>

        <div className="intake-actions">
          {/*
            The status sits WITH the buttons, on one baseline. In its own column it floated above
            them and looked like a heading for the actions rather than a fact about the row.
          */}
          <span className={`badge ${row.processing_status === 'DONE' ? 'badge-ok' : ''}`}>
            OCR {row.processing_status.toLowerCase()}
          </span>
          {row.review_status !== 'PENDING' && (
            <span className="badge">{row.review_status.toLowerCase()}</span>
          )}
          {row.review_status === 'COMPLETED' && row.vehicle_id && (
            <Link to={`/vehicles/${row.vehicle_id}`}>Open vehicle</Link>
          )}
          {/*
            Completable as soon as the machine has stopped, DONE or FAILED alike. A CSR who can
            read the plate off a photo the engine gave up on should not have to wait for a retry
            to succeed first -- and on this photo set the engine gives up often.
          */}
          {row.review_status === 'PENDING' && (
            <EditAction
              title={editing ? 'Close the editor' : 'Correct what the photo says'}
              onClick={() => setEditing((e) => !e)}
              disabled={busy}
            />
          )}
          {row.review_status === 'PENDING' &&
            (row.processing_status === 'DONE' || row.processing_status === 'FAILED') && (
              <ConfirmAction
                title="Complete — register the vehicle"
                onClick={() =>
                  navigate('/vehicles', {
                    state: {
                      register: {
                        intakeId: row.id,
                        registration_number: row.plate ?? '',
                        body_type_id: row.edited_body_type_id,
                        capacity: row.edited_capacity,
                        driver_name: row.driver_name ?? '',
                        driver_mobile: (row.mobiles ?? [])[0] ?? '',
                        company_name: companyOf(row) ?? '',
                        places: row.edited_places ?? [],
                      },
                    },
                  })
                }
                disabled={busy}
              />
            )}
          {/*
            The ONLY route from FAILED back into the queue. The worker retries nothing on its
            own, so without this button a failed photo is never read by a machine again.
          */}
          {row.review_status === 'PENDING' && row.processing_status === 'FAILED' && (
            <RetryAction
              title="Read again — worth doing only if the cause has been fixed, since the same photo will otherwise fail the same way"
              disabled={busy}
              onClick={() => run(() => intake.retry(row.id))}
            />
          )}
          {row.review_status === 'PENDING' && (
            <DeleteAction
              title="Discard — not a truck, unreadable, or already on file"
              disabled={busy}
              onClick={() =>
                run(() => intake.discard(row.id, 'Discarded from the intake worklist'))
              }
            />
          )}
        </div>
      </div>

      {/*
        One line. The long version explained the no-retry policy and what to do about it on every
        failed row — true, and three lines of it per row in a list of twenty. The buttons beside
        it already say what can be done; the title carries the detail for whoever wants it.
      */}
      {row.processing_status === 'FAILED' && row.processing_error && (
        <div
          className="row-error small"
          title={`Nothing retries automatically. Complete it by hand from the photo, or press Read again once the cause is fixed.${
            row.attempts > 1 ? ` Tried ${row.attempts} times.` : ''
          }`}
        >
          OCR could not read this: {row.processing_error}
        </div>
      )}
      {error && <Notice kind="error">{error.message}</Notice>}

      {editing && (
        <Reads
          row={row}
          bodyTypes={bodyTypes}
          capacities={capacities}
          onSaved={() => {
            setEditing(false)
            onChanged()
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      {viewing !== null && (
        <PhotoViewer
          intakeId={row.id}
          count={row.photo_count}
          index={viewing}
          onClose={() => setViewing(null)}
          onMove={setViewing}
        />
      )}
    </section>
  )
}

/**
 * A value the machine read, next to the one a human typed.
 *
 * <p>Says "OCR read", never "the photo shows". OCR misreads plates that are perfectly legible
 * to a person, so implying the photo disagrees would be misleading — FreightDesk's wording, and
 * its reasoning.
 */
/**
 * How long this report has been waiting, in words.
 *
 * <p>The exact timestamp stays on the `title`, because "when precisely did this arrive" is a
 * real question occasionally — just not the one a CSR working a queue is asking. They are asking
 * which of these has been sitting longest, and a clock time makes them do the subtraction.
 */
/**
 * The company to show: the CSR's correction, else what OCR read, else what the reporter said.
 * `null` when none of them has anything — callers print nothing rather than "null".
 */
function companyOf(row: IntakeSummary): string | null {
  return row.edited_company || row.ocr_company || row.reported_company || null
}

function ageOf(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

/**
 * What completing will reuse, and what it will create.
 *
 * <p>Shown while the CSR types, because the decision it informs is made then and not at the
 * completion form. Two failure modes it exists to prevent, both silent:
 *
 * <ul>
 *   <li><b>A second company for the same firm.</b> Matching is exact on the lower-cased name, so
 *       "Guru Nanak Road Carrier" and "Guru Nanak Roadcarrier" are two rows with two fleets.
 *       Nothing downstream complains; the trucks simply end up split. OCR read this very truck's
 *       company as <code>CARRIER</code>, so the risk is not theoretical.
 *   <li><b>A number that is already someone else.</b> A driver is identified by their mobile,
 *       so completing against a number already on file attaches this truck to <em>that</em>
 *       person — whatever name is typed here. Seeing "9878770969 is Suresh Patil" beforehand is
 *       the difference between reusing a driver and being surprised by one.
 * </ul>
 *
 * <p>Advisory only. It never blocks a save, and the authoritative check is the database at
 * completion — which is the same lookup, so the two cannot disagree.
 */
function AlreadyOnFile({ known, company }: { known: IntakeLookup | null; company: string }) {
  if (!known) return null
  const named = company.trim().length > 0
  const nothing = !known.company && known.people.length === 0

  if (nothing && !named) return null

  return (
    <div className="already-on-file">
      {named &&
        (known.company ? (
          <span>
            <strong>{known.company.name}</strong> is already on file — completing will use it.
          </span>
        ) : (
          <span className="muted">
            No company called &ldquo;{company.trim()}&rdquo; yet — completing will create one.
            Check the spelling against an existing firm first; matching is exact.
          </span>
        ))}
      {known.people.map((p) => (
        <span key={p.mobile}>
          <code>{p.mobile}</code> is <strong>{p.name}</strong> ({p.type.toLowerCase()}
          {p.active ? '' : ', deactivated'}) — completing against it uses that person.
        </span>
      ))}
    </div>
  )
}

/**
 * Correcting what the photo says, from the worklist.
 *
 * <p>Editable here and not only inside the completion form, because a CSR working a page of
 * twenty spots a wrong plate while scanning and should fix it where they saw it. A correction
 * typed into a form they then close is lost; one saved here survives a refresh.
 *
 * <p><b>Nothing here overwrites what OCR read.</b> The machine's answer stays on the row and the
 * API resolves correction-then-read-then-typed into the values the list displays. That is not
 * ceremony: OCR returned <code>WC32KN7996</code> for a truck painted <code>UP32 KN 7996</code>,
 * and a correction that erased the original would have erased the evidence that the engine
 * misreads hand-painted state codes — one helpful fix at a time.
 */
function Reads({
  row,
  bodyTypes,
  capacities,
  onSaved,
  onCancel,
}: {
  row: IntakeSummary
  bodyTypes: BodyType[]
  capacities: Capacity[]
  onSaved: () => void
  onCancel: () => void
}) {
  const [plate, setPlate] = useState(row.plate ?? '')
  const [mobiles, setMobiles] = useState((row.mobiles ?? []).join(', '))
  const [company, setCompany] = useState(companyOf(row) ?? '')
  const [driverName, setDriverName] = useState(row.driver_name ?? '')
  const [bodyTypeId, setBodyTypeId] = useState<number | ''>(row.edited_body_type_id ?? '')
  const [capacity, setCapacity] = useState(row.edited_capacity ?? '')
  const [places, setPlaces] = useState<Place[]>(row.edited_places ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [known, setKnown] = useState<IntakeLookup | null>(null)

  // What is already on file, checked as they type.
  //
  // Debounced, and every stale answer discarded: without the `live` guard a slow reply for
  // "Kumar Road" lands after the fast one for "Kumar Roadways" and tells the CSR the opposite of
  // the truth about what they currently have typed.
  const typedMobiles = mobiles.split(/[^0-9]+/).filter((m) => m.length === 10)
  const mobileKey = typedMobiles.join(',')
  useEffect(() => {
    if (!company.trim() && typedMobiles.length === 0) {
      setKnown(null)
      return
    }
    let live = true
    const timer = setTimeout(() => {
      intake
        .lookup(company, typedMobiles)
        .then((r) => live && setKnown(r))
        // A failed preview must never block the edit — it is advisory, and the real check
        // happens when the vehicle is created.
        .catch(() => live && setKnown(null))
    }, 350)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [company, mobileKey])

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await intake.correct(row.id, {
        plate,
        // Split on anything that is not a digit, so "9878770969, 8437036313" and
        // "9878770969 / 8437036313" both work — a CSR pasting from a photo should not have to
        // think about the separator.
        mobiles: mobiles.split(/[^0-9]+/).filter(Boolean),
        company,
        driver_name: driverName,
        // 0, not null: null means "not in this request" and would leave the old value. A CSR
        // clearing the dropdown means they no longer know, and that has to be sayable.
        body_type_id: bodyTypeId === '' ? 0 : bodyTypeId,
        capacity,
        places,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="intake-reads-editing">
      <FormError error={error} />
      <label>
        <span className="read-label">Registration</span>
        <input value={plate} onChange={(e) => setPlate(e.target.value)} autoFocus />
      </label>
      <label className="wide">
        <span className="read-label">Mobiles</span>
        <input
          value={mobiles}
          onChange={(e) => setMobiles(e.target.value)}
          placeholder="9878770969, 8437036313"
        />
      </label>
      <label>
        <span className="read-label">Company name</span>
        <input value={company} onChange={(e) => setCompany(e.target.value)} />
      </label>
      <label>
        <span className="read-label">Driver&rsquo;s name</span>
        <input
          value={driverName}
          onChange={(e) => setDriverName(e.target.value)}
          placeholder="ask on the call"
        />
      </label>
      <label>
        <span className="read-label">Body type</span>
        <select
          value={bodyTypeId}
          onChange={(e) => setBodyTypeId(e.target.value === '' ? '' : Number(e.target.value))}
        >
          <option value="">Not known yet</option>
          {bodyTypes.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="read-label">Capacity</span>
        {/*
          A pick list, not a constraint. `capacity` is free text — an imported truck may carry
          "16.5 MT", which is not on this list — so an off-list value is offered back, not dropped.
        */}
        <select value={capacity} onChange={(e) => setCapacity(e.target.value)}>
          <option value="">Not known yet</option>
          {capacity && !capacities.some((c) => c.label === capacity) && (
            <option value={capacity}>{capacity} (as recorded)</option>
          )}
          {capacities.map((c) => (
            <option key={c.id} value={c.label}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="wide">
        <span className="read-label">Runs in</span>
        <PlacesPicker value={places} onChange={setPlaces} />
      </label>
      <AlreadyOnFile known={known} company={company} />
      <div className="read-actions">
        <button type="button" className="primary" disabled={busy} onClick={save}>
          Save
        </button>
        <button type="button" className="link" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

/**
 * Everything known about this truck, on as few lines as it takes.
 *
 * <p><b>Absences are not printed.</b> The previous version showed a labelled row per field
 * whether or not it held anything, so a report nobody had touched was seven lines of "ask on the
 * call" — and twenty of those filled a screen with the reports that had nothing to say, pushing
 * the ones that did off the bottom. What is known is shown; what is not, is not.
 *
 * <p>No labels either. "Guru Nanak Road Carrier" does not need to be told it is a company, and
 * on a list the label column costs more width than the values it introduces. The two that are
 * genuinely ambiguous out of context — a bare number could be capacity or a phone, a place could
 * be an address — keep a marker.
 */
function Facts({ row, bodyTypes }: { row: IntakeSummary; bodyTypes: BodyType[] }) {
  const mobiles = row.mobiles ?? []
  const bodyType = bodyTypes.find((b) => b.id === row.edited_body_type_id)?.name
  const places = row.edited_places ?? []

  const facts = [
    companyOf(row),
    row.driver_name,
    bodyType,
    row.edited_capacity,
    places.length > 0 ? `${places.length} location${places.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean) as string[]

  const typedDisagrees =
    row.reported_mobile && !mobiles.includes(row.reported_mobile) ? row.reported_mobile : null

  if (mobiles.length === 0 && facts.length === 0) {
    return (
      <span className="muted small">
        Nothing known yet — open the photo and fill in what you can see.
      </span>
    )
  }

  return (
    <>
      {mobiles.length > 0 && (
        <div className="fact-line">
          {mobiles.map((m) => (
            <a key={m} className="phone" href={`tel:+91${m}`}>
              {m}
            </a>
          ))}
          {typedDisagrees && (
            <span className="read-disagree small">executive typed {typedDisagrees}</span>
          )}
        </div>
      )}
      {facts.length > 0 && (
        <div className="fact-line muted-sep">
          {facts.map((f, i) => (
            <span key={i}>{f}</span>
          ))}
        </div>
      )}
    </>
  )
}

function IntakePhoto({
  intakeId,
  index,
  onOpen,
}: {
  intakeId: number
  index: number
  onOpen: (index: number) => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let revoked: string | null = null
    let live = true
    // Ask the server to shrink it. `.intake-photo` is 84px wide, so 200 covers a 2x display
    // with room to spare, and the reply is about 8 KB instead of 3-4 MB. The size matters far
    // less than the pixel count: a browser decodes a 4000px photo to a ~48 MB bitmap before it
    // scales it down, and eight of those on one page locked the renderer for half a minute.
    photoObjectUrl(intakeId, index, 200)
      .then((u) => {
        if (!live) {
          URL.revokeObjectURL(u)
          return
        }
        revoked = u
        setUrl(u)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
      // A blob URL survives the component unless it is revoked; without this, scrolling a long
      // worklist leaks every photo it rendered.
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [intakeId, index])

  if (failed) return <span className="photo-missing">photo unavailable</span>
  if (!url) return <span className="photo-loading" />
  return (
    <button
      type="button"
      className="intake-photo-button"
      onClick={() => onOpen(index)}
      title="Open full size"
    >
      <img className="intake-photo" src={url} alt={`Truck photo ${index + 1}`} />
    </button>
  )
}

/**
 * A photo at full size, over the worklist.
 *
 * <p>The reason this exists at all: the plate on a real field photo is often painted small on
 * the side of a truck photographed from across the road. At thumbnail size a CSR cannot check
 * the machine's read against the picture, which is the one thing they are here to do — and on
 * the photos measured so far OCR returns a plate on about one in four, so reading it off the
 * image by eye is the common path, not the fallback.
 *
 * <p>Arrow keys move between a truck's photos and Escape closes, because a CSR doing this forty
 * times an hour should not have to find a small button with the mouse each time.
 */
function PhotoViewer({
  intakeId,
  count,
  index,
  onClose,
  onMove,
}: {
  intakeId: number
  count: number
  index: number
  onClose: () => void
  onMove: (next: number) => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  // Zoom exists because the thing a CSR needs to read is often the smallest thing in the frame:
  // a plate hand-painted on the side of a truck photographed from across a road. Fitted to the
  // viewport these photos are ~2000px of detail squeezed into ~900, and the plate is unreadable
  // at exactly the moment someone is trying to check the machine against it.
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState<{ x: number; y: number } | null>(null)

  function zoomTo(next: number) {
    const clamped = Math.min(6, Math.max(1, Number(next.toFixed(2))))
    setZoom(clamped)
    // Snapping back to centre at 1x stops the image drifting off-screen after a zoom out.
    if (clamped === 1) setPan({ x: 0, y: 0 })
  }

  useEffect(() => {
    let revoked: string | null = null
    let live = true
    setUrl(null)
    setFailed(false)
    zoomTo(1)
    photoObjectUrl(intakeId, index)
      .then((u) => {
        if (!live) {
          URL.revokeObjectURL(u)
          return
        }
        revoked = u
        setUrl(u)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [intakeId, index])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      // Arrows pan once zoomed in; they only change photo at 1x, where panning is meaningless.
      if (zoom > 1 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft'
                       || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        const step = 60
        setPan((prev) => ({
          x: prev.x + (e.key === 'ArrowLeft' ? step : e.key === 'ArrowRight' ? -step : 0),
          y: prev.y + (e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0),
        }))
        return
      }
      if (e.key === 'ArrowRight' && index < count - 1) onMove(index + 1)
      if (e.key === 'ArrowLeft' && index > 0) onMove(index - 1)
      if (e.key === '+' || e.key === '=') zoomTo(zoom + 0.5)
      if (e.key === '-' || e.key === '_') zoomTo(zoom - 0.5)
      if (e.key === '0') zoomTo(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, count, onClose, onMove, zoom])

  // Through a portal to <body>, not in place. A fixed-position overlay rendered inside the card
  // is at the mercy of any ancestor that creates a stacking context — the sticky header was
  // painting straight over it — and the fix for that is not a bigger z-index, it is not being
  // inside the thing in the first place.
  return createPortal(
    // Clicking the backdrop closes; clicking the photo itself must not, hence stopPropagation.
    <div className="photo-viewer" onClick={onClose} role="presentation">
      <div className="photo-viewer-inner" onClick={(e) => e.stopPropagation()} role="presentation">
        <header>
          <span className="muted small">
            Photo {index + 1} of {count}
          </span>
          <span className="photo-zoom">
            <button type="button" onClick={() => zoomTo(zoom - 0.5)} disabled={zoom <= 1}>
              −
            </button>
            <button type="button" onClick={() => zoomTo(1)} disabled={zoom === 1}>
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" onClick={() => zoomTo(zoom + 0.5)} disabled={zoom >= 6}>
              +
            </button>
          </span>
          <button type="button" className="link" onClick={onClose}>
            Close (Esc)
          </button>
        </header>

        {failed && <Notice kind="error">This photo is no longer in the store.</Notice>}
        {!failed && !url && <Spinner />}
        {url && (
          <div
            className="photo-stage"
            // The wheel zooms toward wherever the pointer is, which is how every other image
            // viewer behaves — zooming to the centre means immediately panning back to the plate.
            onWheel={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const next = Math.min(6, Math.max(1, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
              if (next === zoom) return
              const ox = e.clientX - rect.left - rect.width / 2
              const oy = e.clientY - rect.top - rect.height / 2
              const k = next / zoom
              setPan((prev) => ({
                x: ox - (ox - prev.x) * k,
                y: oy - (oy - prev.y) * k,
              }))
              setZoom(Number(next.toFixed(2)))
              if (next === 1) setPan({ x: 0, y: 0 })
            }}
            onPointerDown={(e) => {
              if (zoom === 1) return
              e.currentTarget.setPointerCapture(e.pointerId)
              setDragging({ x: e.clientX - pan.x, y: e.clientY - pan.y })
            }}
            onPointerMove={(e) => {
              if (!dragging) return
              setPan({ x: e.clientX - dragging.x, y: e.clientY - dragging.y })
            }}
            onPointerUp={() => setDragging(null)}
            onDoubleClick={() => zoomTo(zoom === 1 ? 3 : 1)}
            style={{ cursor: zoom === 1 ? 'zoom-in' : dragging ? 'grabbing' : 'grab' }}
          >
            <img
              src={url}
              alt={`Truck photo ${index + 1}, full size`}
              draggable={false}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
              }}
            />
          </div>
        )}
        <span className="muted small photo-hint">
          Scroll or double-click to zoom · drag to move · +/− and 0 on the keyboard
        </span>

        {count > 1 && (
          <footer>
            <button type="button" disabled={index === 0} onClick={() => onMove(index - 1)}>
              ← Previous
            </button>
            <button
              type="button"
              disabled={index === count - 1}
              onClick={() => onMove(index + 1)}
            >
              Next →
            </button>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}

/**
 * Every number read off the truck, and where to put each one.
 *
 * <p>OCR can say what the digits are; it cannot say <em>whose</em> number they are. A truck's
 * side commonly carries three — the owner's, the driver's, the transport office's — painted in a
 * row with nothing to distinguish them. Guessing would silently file the office number as the
 * driver's, and a telecaller would ring the wrong person for weeks.
 *
 * <p>So the digits are offered and the CSR, who is on the call, says which is which. A number
 * already sitting in one of the three fields is shown as placed rather than offered again.
 */
function NumbersFromThePhoto({
  numbers,
  assigned,
  onAssign,
}: {
  numbers: string[]
  assigned: string[]
  onAssign: {
    driver: (v: string) => void
    alt: (v: string) => void
    company: (v: string) => void
  }
}) {
  const placed = new Set(assigned.map((a) => a.trim()).filter(Boolean))

  return (
    <div className="ocr-numbers">
      <span className="muted small">
        OCR read {numbers.length === 1 ? 'this number' : `these ${numbers.length} numbers`} off
        the photo. It cannot tell whose is whose — put each where it belongs:
      </span>
      <ul>
        {numbers.map((n) => (
          <li key={n}>
            <code>{n}</code>
            {placed.has(n) ? (
              <span className="muted small">placed</span>
            ) : (
              <>
                <button type="button" className="link" onClick={() => onAssign.driver(n)}>
                  driver
                </button>
                <button type="button" className="link" onClick={() => onAssign.alt(n)}>
                  driver&rsquo;s other
                </button>
                <button type="button" className="link" onClick={() => onAssign.company(n)}>
                  company
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The completion form: the intake form, prefilled from the photo.
 *
 * <p>Every OCR value is editable and nothing is submitted automatically. The machine suggests;
 * the CSR — who is on the phone to the driver — decides.
 */
function CompleteForm({
  row,
  bodyTypes,
  capacities,
  onDone,
}: {
  row: IntakeSummary
  bodyTypes: BodyType[]
  capacities: Capacity[]
  onDone: () => void
}) {
  // `row.plate` / `row.mobiles` / `row.company`, NOT the ocr_* columns. The server has already
  // resolved correction-then-read-then-typed into these, and reaching past them to ocr_* is
  // exactly the bug that made a correction saved in the list vanish the moment someone opened
  // this form — it silently offered the machine's answer back to the person who had just
  // rejected it.
  const [reg, setReg] = useState(row.plate ?? '')
  const [bodyTypeId, setBodyTypeId] = useState<number | ''>(row.edited_body_type_id ?? '')
  const [driverName, setDriverName] = useState(row.driver_name ?? '')
  // The numbers on the truck, best-read first. The first is offered as the driver's and the
  // second as the company's, which is the usual arrangement on a truck's side — but that is a
  // guess about WHOSE number each one is, not about the digits, so both are editable and the CSR
  // reassigns them on the call.
  const ocrNumbers = row.mobiles ?? []
  const [driverMobile, setDriverMobile] = useState(ocrNumbers[0] ?? '')
  const [driverAltMobile, setDriverAltMobile] = useState('')
  const [companyMobile, setCompanyMobile] = useState(ocrNumbers[1] ?? '')
  const [companyName, setCompanyName] = useState(row.company ?? '')
  const [axles, setAxles] = useState('2')
  const [wheels, setWheels] = useState('6')
  const [capacity, setCapacity] = useState(row.edited_capacity ?? '')
  const [lengthFt, setLengthFt] = useState('')
  const [places, setPlaces] = useState<Place[]>([])
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await intake.complete(row.id, {
        registration_number: reg,
        body_type_id: Number(bodyTypeId),
        driver_name: driverName,
        driver_mobile: driverMobile,
        driver_alt_mobile: driverAltMobile.trim() || null,
        company_name: companyName.trim() || null,
        company_mobile: companyMobile.trim() || null,
        no_of_axles: axles === '' ? null : Number(axles),
        no_of_wheels: wheels === '' ? null : Number(wheels),
        capacity: capacity || null,
        length_ft: lengthFt === '' ? null : lengthFt,
        places,
      })
      onDone()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="inset" onSubmit={submit}>
      <FormError error={error} />
      <p className="muted small">
        Prefilled from the photo where OCR managed a read. Check every box against the picture —
        a wrong plate here becomes a wrong vehicle.
      </p>

      <div className="grid-2">
        <Field label="Registration number" name="registration_number" error={error}>
          <input value={reg} onChange={(e) => setReg(e.target.value)} required />
        </Field>
        <Field label="Body type" name="body_type_id" error={error}>
          <select
            value={bodyTypeId}
            onChange={(e) => setBodyTypeId(e.target.value === '' ? '' : Number(e.target.value))}
            required
          >
            <option value="">Choose…</option>
            {bodyTypes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid-2">
        <Field
          label="Driver's name"
          name="driver_name"
          error={error}
          hint="OCR cannot read this off a truck — ask on the call."
        >
          <input value={driverName} onChange={(e) => setDriverName(e.target.value)} required />
        </Field>
        <Field
          label="Driver's mobile"
          name="driver_mobile"
          error={error}
          hint="The number this driver is found by. Changing it records a different person."
        >
          <input value={driverMobile} onChange={(e) => setDriverMobile(e.target.value)} required />
        </Field>
      </div>

      <div className="grid-2">
        <Field
          label="Driver's other number"
          name="driver_alt_mobile"
          error={error}
          hint="Optional. Another way to reach the same driver."
        >
          <input
            value={driverAltMobile}
            onChange={(e) => setDriverAltMobile(e.target.value)}
          />
        </Field>
        <Field
          label="Company's number"
          name="company_mobile"
          error={error}
          hint="Optional. The transport office, not the driver."
        >
          <input value={companyMobile} onChange={(e) => setCompanyMobile(e.target.value)} />
        </Field>
      </div>

      {ocrNumbers.length > 0 && (
        <NumbersFromThePhoto
          numbers={ocrNumbers}
          assigned={[driverMobile, driverAltMobile, companyMobile]}
          onAssign={{
            driver: setDriverMobile,
            alt: setDriverAltMobile,
            company: setCompanyMobile,
          }}
        />
      )}

      <Field
        label="Company"
        name="company_name"
        error={error}
        hint="Leave blank if the driver owns the truck."
      >
        <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
      </Field>

      <div className="grid-4">
        <Field label="Axles" name="no_of_axles" error={error}>
          <input type="number" value={axles} onChange={(e) => setAxles(e.target.value)} />
        </Field>
        <Field label="Wheels" name="no_of_wheels" error={error}>
          <input type="number" step={2} value={wheels} onChange={(e) => setWheels(e.target.value)} />
        </Field>
        <Field label="Capacity" name="capacity" error={error}>
          <select value={capacity} onChange={(e) => setCapacity(e.target.value)} required>
            <option value="">Choose…</option>
            {capacity && !capacities.some((c) => c.label === capacity) && (
              <option value={capacity}>{capacity} (as recorded)</option>
            )}
            {capacities.map((c) => (
              <option key={c.id} value={c.label}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Length (ft)" name="length_ft" error={error}>
          <input
            type="number"
            step="0.5"
            value={lengthFt}
            onChange={(e) => setLengthFt(e.target.value)}
            required
          />
        </Field>
      </div>

      <fieldset>
        <legend>Where it runs</legend>
        <p className="muted small">
          Optional. With a company these become the company's locations, shared by every truck it
          owns; without one they are this vehicle's own.
        </p>
        <PlacesEditor value={places} onChange={setPlaces} disabled={busy} />
      </fieldset>

      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create vehicle'}
        </button>
      </div>
    </form>
  )
}
