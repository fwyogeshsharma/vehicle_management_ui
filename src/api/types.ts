/**
 * Mirrors of the API's DTOs.
 *
 * **Field names are snake_case here, exactly as they go over the wire.** There is deliberately
 * no camelCase conversion layer: a converter is a second place for a name to live, and when the
 * server renames `owner_company_id` the converter keeps compiling while the app quietly reads
 * `undefined`. One spelling, and a rename breaks the build.
 */

export type UserType = 'DRIVER' | 'OWNER' | 'BOTH' | 'STAFF' | 'ADMIN'

/**
 * What a person may DO here — distinct from `UserType`, which is what they ARE.
 *
 * Null for anyone without a login, which is most of the directory. `CSR` and `TEJJJ_CSR`
 * currently carry the same permissions; only `ADMIN` is guarded against anywhere.
 */
export type UserRole = 'ADMIN' | 'CSR' | 'TEJJJ_CSR'

export const USER_ROLES: UserRole[] = ['ADMIN', 'CSR', 'TEJJJ_CSR']

/** How to say each role to a person. */
export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  CSR: 'CSR',
  TEJJJ_CSR: 'Tejjj CSR',
}

/** Who can hold a login. The API refuses one for anybody else, so the UI must not offer it. */
export const LOGIN_TYPES: UserType[] = ['STAFF', 'ADMIN']

/** The users who might sit behind a wheel. */
export const DRIVING_TYPES: UserType[] = ['DRIVER', 'BOTH']

export interface Page<T> {
  items: T[]
  total: number
  /** 1-based, matching what was asked for. */
  page: number
  page_size: number
}

// ── users ──────────────────────────────────────────────────────────────────

export interface UserSummary {
  id: number
  name: string
  mobile: string
  user_type: UserType
  /** What they may do. Null when they have no login. */
  role: UserRole | null
  username: string | null
  active: boolean
}

export interface UserDetail extends UserSummary {
  alt_mobile: string | null
  email: string | null
  /** Most drivers cannot, and that is normal rather than an incomplete record. */
  can_sign_in: boolean
  city_id: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Membership {
  company_id: number
  company_name: string | null
  position: string | null
  primary: boolean
}

/** What ending an employment actually cost — see UserApi.leaveCompany. */
export interface LeftCompany {
  removed_driver_assignments: number
}

// ── companies ───────────────────────────────────────────────────────────────

export interface CompanySummary {
  id: number
  name: string
  mobile: string | null
  gstin: string | null
  active: boolean
  /**
   * The first few place names, comma separated. Null when the company serves nowhere — which
   * matters: its locations are what every truck it owns inherits.
   */
  locations: string | null
  /** How many in total; may exceed the names in `locations`. */
  location_count: number
}

export interface CompanyDetail extends CompanySummary {
  email: string | null
  address: string | null
  /** Where it is registered, NOT where it operates. Its operating area is its locations. */
  head_office_city_id: number | null
  created_at: string
  updated_at: string
}

export interface CompanyLocation {
  id: number
  state_id: number
  /** Null means the whole state, which matches every city in it. */
  city_id: number | null
}

export interface CompanyMember {
  user_id: number
  name: string | null
  mobile: string | null
  user_type: string | null
  position: string | null
  primary: boolean
}

// ── vehicles ────────────────────────────────────────────────────────────────

export interface VehicleSummary {
  id: number
  /** Null until someone has the plate. Show it with `plateOf`. */
  registration_number: string | null
  /** Null means "not known yet". */
  body_type_id: number | null
  capacity: string | null
  /** Derived by the database from `capacity`. Read-only; never send it. */
  capacity_tons: string | null
  owner_company_id: number | null
  owner_user_id: number | null
  company_owned: boolean
  active: boolean
  /**
   * Who to ring about this truck: the primary driver, else the owner-driver, else the owning
   * company. Null when nobody on that chain has a number on file.
   */
  contact_name: string | null
  contact_mobile: string | null
  contact_role: 'DRIVER' | 'OWNER' | 'COMPANY' | null
  no_of_axles: number | null
  no_of_wheels: number | null
  length_ft: string | null
  /**
   * Where it runs: the first few place names, comma separated. These are the EFFECTIVE
   * locations — a company-owned truck reports its company's, an owner-driver's its own.
   * Null means it serves nowhere and will match no city search.
   */
  locations: string | null
  location_count: number
}

export interface VehicleDetail extends VehicleSummary {
  no_of_axles: number | null
  no_of_wheels: number | null
  length_ft: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface VehicleDriver {
  user_id: number
  name: string | null
  mobile: string | null
  primary: boolean
}

/**
 * A sale, and what it took with it.
 *
 * `removed_drivers` is not incidental — a transfer clears every driver assignment, because a
 * truck sold by one company must not keep listing that company's drivers. Show the number.
 */
export interface OwnerChanged {
  vehicle: VehicleDetail
  removed_drivers: number
}

export interface EffectiveLocation {
  state_id: number
  state_name: string
  city_id: number | null
  city_name: string | null
  /**
   * COMPANY or VEHICLE — which of the two produced this row. Not a fallback any more: a truck
   * carries its company's locations AND its own, so both sources can appear in one list.
   */
  source: 'COMPANY' | 'VEHICLE'
}

/** A state, optionally narrowed to one city. A null city means the whole state. */
export interface Place {
  state_id: number
  city_id: number | null
}

// ── reference data ──────────────────────────────────────────────────────────

export interface State {
  id: number
  code: string
  name: string
}

export interface City {
  id: number
  state_id: number
  name: string
  /** A retired city stays on historic records but is off the pick lists. */
  active: boolean
}

/**
 * A rung on the capacity pick list.
 *
 * `label` is exactly what gets stored — there is no formatting step between choosing and saving.
 * It is a pick list and **not** a foreign key: an imported vehicle may carry a capacity that is
 * not on this list, and that is allowed.
 */
export interface Capacity {
  id: number
  label: string
  tons: string
  active: boolean
}

export interface BodyType {
  id: number
  name: string
  active: boolean
}

/**
 * `GET /api/masters` — every pick list in one call, as the wire sends it.
 *
 * Leaner than the per-list endpoints: no `active` flags, and a city has no `state_id` because it
 * is nested under its state. `useMasters` fills those in for the components that expect the
 * fuller shapes.
 */
export interface Masters {
  states: { id: number; code: string; name: string; cities: { id: number; name: string }[] }[]
  capacities: { id: number; label: string; tons: number | string }[]
  body_types: { id: number; name: string }[]
  goods_types: { id: number; name: string }[]
}

// ── auth ────────────────────────────────────────────────────────────────────

export interface Session {
  token: string
  expires_at: string
  user: UserDetail
}

// ── photo intake ────────────────────────────────────────────────────────────

/**
 * What the MACHINE has done with a report's photos.
 *
 * Independent of `ReviewStatus`. A row can be `FAILED` and still perfectly workable — OCR read
 * nothing, but a CSR looking at the photo can usually see the plate. The two used to be one
 * column, which made that ordinary case impossible to express.
 */
export type ProcessingStatus =
  | 'QUEUED'       // photos are in the store, waiting for a worker
  | 'PROCESSING'   // a worker holds it
  | 'DONE'         // OCR finished — whether or not it read anything
  | 'FAILED'       // OCR could not read it. Terminal: nothing retries automatically.

/** What a HUMAN has decided. Independent of `ProcessingStatus`. */
export type ReviewStatus =
  | 'PENDING'      // nobody has looked at it yet
  | 'COMPLETED'    // a CSR turned it into a vehicle
  | 'DISCARDED'    // a CSR rejected it

/**
 * A slice of the worklist, named for the question rather than the columns.
 *
 * Each is a pair of coordinates on the two axes above; `TO_CALL` — the machine has finished and
 * nobody has rung the driver — is the only one that is a queue.
 */
export type IntakeTab =
  | 'TO_CALL'
  | 'WAITING'
  | 'FAILED'
  | 'COMPLETED'
  | 'DISCARDED'
  | 'ALL'

/**
 * A photo from the field, on its way to becoming a vehicle.
 *
 * `reported_*` is what the field executive typed; `ocr_*` is what the machine read. They are
 * separate fields on purpose — merging them into one "best guess" would lose the only thing
 * that makes a wrong value explainable.
 */
export interface IntakeSummary {
  id: number
  processing_status: ProcessingStatus
  review_status: ReviewStatus
  photo_count: number
  reported_plate: string | null
  reported_mobile: string | null
  /** What the field executive typed as the company's number. */
  reported_company_mobile?: string | null
  /** What the CSR saved as the company's number. */
  edited_company_mobile?: string | null
  /** The two above resolved, edited first. Use this to display and prefill. */
  company_mobile?: string | null
  reported_company: string | null
  reported_by: string | null
  reported_driver_name: string | null
  location: string | null
  ocr_plate: string | null
  /**
   * Every number read off the truck, best-read first — not one.
   *
   * A truck routinely carries the owner's, the driver's and the transport office's painted in a
   * row. OCR can say what the digits are but not whose they are, so all of them come back and
   * the CSR assigns each one on the call.
   */
  ocr_mobiles: string[]
  ocr_company: string | null
  /**
   * What the CSR says it is. `null` where nobody has corrected that field — which is NOT the
   * same as a CSR deliberately clearing a bad read, which stores an empty value.
   */
  edited_plate: string | null
  edited_mobiles: string[] | null
  edited_company: string | null
  /** No OCR or reported counterpart — a name is not painted on a truck. */
  edited_driver_name: string | null
  /**
   * Plain columns, not `edited_*`: the body type and capacity the CSR has picked. The summary
   * carries no axles, wheels or length — those travel only in the PATCH/complete bodies.
   */
  body_type_id: number | null
  capacity_id: number | null
  /** The CSR's answers, saved with the row; wheels falls back to the field app's. */
  no_of_axles: number | null
  no_of_wheels: number | null
  length_ft: string | null
  /** Where the driver says it runs. Notes — the real locations are written at completion. */
  edited_places: Place[] | null
  edited_by: string | null
  /**
   * The three above resolved against the OCR reads, then what the executive typed. **Use these
   * to display.** Resolving it in the UI would mean every caller remembering the same rule.
   */
  plate: string | null
  mobiles: string[]
  company: string | null
  driver_name: string | null
  /** HIGH / LOW / NONE — how many reads agreed, not a probability. */
  ocr_confidence: string | null
  attempts: number
  processing_error: string | null
  vehicle_id: number | null
  reviewed_by: string | null
  review_note: string | null
  captured_at: string | null
  created_at: string
  processed_at: string | null
}

export interface IntakeDetail {
  summary: IntakeSummary
  /** Every candidate and body text the engine returned, for when a read looks wrong. */
  ocr_raw: Record<string, unknown> | null
}

export interface IntakeCounts {
  to_call: number
  waiting: number
  failed: number
  completed: number
  discarded: number
  all: number
}

/**
 * What is already on file under a company name and a set of numbers.
 *
 * Answers exactly one question — *will completing reuse something, or create it?* — using the
 * same lookups completion uses, so it cannot disagree with what actually happens.
 */
export interface IntakeLookup {
  /** Exact match on the lower-cased name. There is no fuzzy matching. */
  company: { id: number; name: string; mobile: string | null } | null
  /** One entry per number that is already a person on file. Numbers not found are absent. */
  people: { mobile: string; id: number; name: string; type: string; active: boolean }[]
}

// ── lorry receipts ──────────────────────────────────────────────────────────

export type LrStatus = 'BOOKED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED'

/**
 * One consignment note.
 *
 * Every master appears **twice** — `consignor_id` beside `consignor_name`, `vehicle_id` beside
 * `vehicle_number` — and that is not redundancy to tidy away. The id is what this app makes
 * clickable; the text is what the document says. On an old receipt they legitimately disagree,
 * because the truck was re-registered or the customer renamed after it was issued. Render the
 * text. Never re-derive a printed value from the id.
 */
export interface LorryReceipt {
  id: number
  lr_number: string
  series: string
  seq_no: number
  lr_date: string
  status: LrStatus

  consignor_id: number | null
  consignor_name: string
  consignor_mobile: string | null
  consignee_id: number | null
  consignee_name: string
  consignee_mobile: string | null

  from_city_id: number | null
  from_place: string
  to_city_id: number | null
  to_place: string

  goods_type_id: number | null
  goods_description: string | null
  weight_kg: string | null
  packages: number | null

  vehicle_id: number | null
  vehicle_number: string | null
  body_type_id: number | null
  vehicle_type: string | null
  driver_user_id: number | null
  driver_name: string | null
  driver_mobile: string | null

  freight_charges: string
  loading_charges: string
  unloading_charges: string
  other_charges: string
  /** Computed by the database. Read-only. */
  total_charges: string
  advance: string
  /** total_charges less advance. Computed by the database. Read-only. */
  balance: string

  special_instructions: string | null
  notes: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LrTotals {
  total: number
  booked: number
  in_transit: number
  delivered: number
  cancelled: number
  outstanding: string
}

export interface LrFilters {
  q?: string
  status?: LrStatus | ''
  from?: string
  to?: string
  vehicle_id?: number
  driver_id?: number
  party_id?: number
  unpaid?: boolean
  page?: number
  page_size?: number
  sort?: string
}

/** What the form sends. Every master may be an id picked from a list or a typed name. */
export interface LrSaveRequest {
  lr_number?: string
  lr_date: string
  consignor_id?: number | null
  consignor_name?: string
  consignor_mobile?: string
  consignee_id?: number | null
  consignee_name?: string
  consignee_mobile?: string
  from_city_id?: number | null
  from_place?: string
  to_city_id?: number | null
  to_place?: string
  goods_type_id?: number | null
  goods_description?: string
  weight_kg?: string | number | null
  packages?: number | null
  vehicle_id?: number | null
  vehicle_number?: string
  body_type_id?: number | null
  vehicle_type?: string
  driver_user_id?: number | null
  driver_name?: string
  driver_mobile?: string
  freight_charges?: string | number
  loading_charges?: string | number
  unloading_charges?: string | number
  other_charges?: string | number
  advance?: string | number
  special_instructions?: string
  notes?: string
}

export interface Customer {
  id: number
  name: string
  mobile: string | null
  address: string | null
  gstin: string | null
  active: boolean
  created_at: string
}

export interface GoodsTypeRef {
  id: number
  name: string
  active: boolean
}

// ── freight lanes ───────────────────────────────────────────────────────────

/**
 * A route and a commodity somebody told a CSR about: "Meerut to Lucknow, mangoes".
 *
 * **Hearsay, not a consignment.** No customer, no truck, no money owed. It is kept because
 * the question it answers — which lanes should we be quoting for that we currently are not —
 * cannot be answered from lorry receipts, which only record business already won.
 */
export interface FreightLane {
  id: number
  from_city_id: number | null
  from_place: string
  to_city_id: number | null
  to_place: string
  goods_type_id: number | null
  goods: string
  /**
   * Whose cargo, as told to us. **Not** a link to a customer: recording a rumour must not
   * create a row a lorry receipt could then be issued against.
   */
  company_name: string | null
  /** True when the lane only runs part of the year; `season` says which part. */
  seasonal: boolean
  /** "Apr–Jul", "monsoon", "after Diwali". Null unless `seasonal`. */
  season: string | null
  body_type_id: number | null
  source: string | null
  source_mobile: string | null
  notes: string | null
  active: boolean
  recorded_by: string | null
  created_at: string
  updated_at: string
}

export interface LaneSaveRequest {
  from_city_id?: number | null
  from_place: string
  to_city_id?: number | null
  to_place: string
  goods_type_id?: number | null
  goods?: string
  company_name?: string
  seasonal?: boolean
  season?: string
  body_type_id?: number | null
  source?: string
  source_mobile?: string
  notes?: string
}
