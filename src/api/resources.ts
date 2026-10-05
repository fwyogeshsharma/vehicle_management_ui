/**
 * One function per endpoint, grouped by aggregate.
 *
 * <p><b>The strings in this file are the API's paths, not this app's vocabulary.</b> A rename in
 * the UI must never be applied here: `/api/vehicles/{id}/drivers` stays `drivers` however the
 * screens end up labelling the people involved. A find-and-replace across `src/` once turned
 * these into `/users` and every driver list started returning 500.
 *
 * Kept deliberately thin — no caching, no retries, no normalising. Anything clever here is
 * logic living in two places, because the rules it would be reimplementing are already enforced
 * by the API and, underneath it, by the database.
 */

import { api, query } from './client'
import type {
  BodyType,
  Capacity,
  Customer,
  FreightLane,
  GoodsTypeRef,
  LaneSaveRequest,
  LorryReceipt,
  LrFilters,
  LrSaveRequest,
  LrStatus,
  LrTotals,
  IntakeCounts,
  IntakeLookup,
  IntakeDetail,
  IntakeTab,
  IntakeSummary,
  City,
  CompanyDetail,
  CompanyLocation,
  CompanyMember,
  CompanySummary,
  EffectiveLocation,
  LeftCompany,
  Masters,
  Membership,
  OwnerChanged,
  Page,
  Place,
  Session,
  State,
  UserDetail,
  UserSummary,
  UserRole,
  UserType,
  VehicleDetail,
  VehicleDriver,
  VehicleSummary,
} from './types'

// ── auth ────────────────────────────────────────────────────────────────────

export const auth = {
  login: (username: string, password: string) =>
    api.post<Session>('/api/auth/login', { username, password }),

  me: () => api.get<UserDetail>('/api/auth/me'),

  /** Invalidates every token issued before now, including the one making this call. */
  changePassword: (current_password: string, new_password: string) =>
    api.post<void>('/api/auth/change-password', { current_password, new_password }),
}

// ── reference data ──────────────────────────────────────────────────────────

export const geo = {
  /** States with their cities, capacities, body types and goods types — in one call. */
  masters: () => api.get<Masters>('/api/masters'),

  states: () => api.get<State[]>('/api/states'),

  citiesOfState: (stateId: number) => api.get<City[]>(`/api/states/${stateId}/cities`),

  searchCities: (q: string, stateId: number | null, pageSize = 20) =>
    api.get<Page<City>>(
      '/api/cities' + query({ q, state_id: stateId, page: 1, page_size: pageSize }),
    ),

  bodyTypes: (includeInactive = false) =>
    api.get<BodyType[]>('/api/body-types' + query({ include_inactive: includeInactive })),

  createBodyType: (name: string) => api.post<BodyType>('/api/body-types', { name }),

  /** The capacity pick list, smallest first. A pick list, not a foreign key. */
  capacities: (includeInactive = false) =>
    api.get<Capacity[]>('/api/capacities' + query({ include_inactive: includeInactive })),

  /** Retires it. Vehicles reference it ON DELETE RESTRICT, so it is never really deleted. */
  retireBodyType: (id: number) => api.delete<void>(`/api/body-types/${id}`),

  restoreBodyType: (id: number) => api.post<BodyType>(`/api/body-types/${id}/restore`),

  /**
   * Add a rung to the capacity list.
   *
   * `tons` is only what makes the list sort sensibly — alphabetically "9 Ton" falls between
   * 16 and 25. It is NOT what a vehicle's `capacity_tons` is derived from; that stays the free
   * text on the vehicle itself.
   */
  createCapacity: (label: string, tons: number) =>
    api.post<Capacity>('/api/capacities', { label, tons }),

  retireCapacity: (id: number) => api.delete<void>(`/api/capacities/${id}`),

  restoreCapacity: (id: number) => api.post<Capacity>(`/api/capacities/${id}/restore`),

  /**
   * Add a city under a state.
   *
   * There is no matching call for states, deliberately: there are 36 and a new one is a
   * constitutional event, not a data-entry task. The API has no endpoint to call.
   */
  createCity: (stateId: number, name: string) =>
    api.post<City>(`/api/states/${stateId}/cities`, { name }),

  retireCity: (id: number) => api.delete<void>(`/api/cities/${id}`),

  restoreCity: (id: number) => api.post<City>(`/api/cities/${id}/restore`),
}

// ── users ──────────────────────────────────────────────────────────────────

export interface UserFilters {
  q?: string
  type?: UserType | ''
  company_id?: number | null
  active?: boolean | null
  page?: number
  page_size?: number
  sort?: string
}

export const users = {
  list: (f: UserFilters) => api.get<Page<UserSummary>>('/api/users' + query({ ...f })),

  get: (id: number) => api.get<UserDetail>(`/api/users/${id}`),

  create: (name: string, mobile: string, user_type: UserType) =>
    api.post<UserDetail>('/api/users', { name, mobile, user_type }),

  /** Cannot change the role — that is {@link setType}, and administrator only. */
  update: (
    id: number,
    body: {
      name: string
      mobile: string
      alt_mobile?: string | null
      email?: string | null
      city_id?: number | null
      notes?: string | null
    },
  ) => api.put<UserDetail>(`/api/users/${id}`, body),

  /** Administrator only: this is how someone becomes able to administer the system. */
  setType: (id: number, user_type: UserType) =>
    api.put<UserDetail>(`/api/users/${id}/type`, { user_type }),

  /** Administrator only. Deactivates — the row and its history stay. */
  deactivate: (id: number) => api.delete<void>(`/api/users/${id}`),

  restore: (id: number) => api.post<UserDetail>(`/api/users/${id}/restore`),

  /**
   * Administrator only. Only STAFF and ADMIN may hold a login; the API refuses anyone else.
   * Invalidates any token already issued for the account.
   */
  /**
   * Change what somebody may do, without touching their password.
   *
   * Takes effect on their **next request**, not their next sign-in: the API resolves the
   * authority from the row on every call rather than from a claim in the token.
   */
  setRole: (id: number, role: UserRole) =>
    api.put<UserDetail>(`/api/users/${id}/role`, { role }),

  setLogin: (id: number, username: string, password: string, role: UserRole) =>
    api.put<UserDetail>(`/api/users/${id}/login`, { username, password, role }),

  removeLogin: (id: number) => api.delete<void>(`/api/users/${id}/login`),

  companies: (id: number) => api.get<Membership[]>(`/api/users/${id}/companies`),

  /** Employment is what makes someone eligible to drive that company's trucks. */
  joinCompany: (id: number, company_id: number, position: string, primary: boolean) =>
    api.post<Membership[]>(`/api/users/${id}/companies`, { company_id, position, primary }),

  /**
   * Ends the employment — and cascades away every assignment this user holds on that
   * company's trucks. The count comes back so the UI can say so.
   */
  leaveCompany: (id: number, companyId: number) =>
    api.delete<LeftCompany>(`/api/users/${id}/companies/${companyId}`),

  /** Trucks they DRIVE. What they own is a filter on the vehicle list. */
  vehicles: (id: number) => api.get<VehicleSummary[]>(`/api/users/${id}/vehicles`),
}

// ── companies ───────────────────────────────────────────────────────────────

export interface CompanyFilters {
  q?: string
  active?: boolean | null
  page?: number
  page_size?: number
  sort?: string
}

export const companies = {
  list: (f: CompanyFilters) => api.get<Page<CompanySummary>>('/api/companies' + query({ ...f })),

  get: (id: number) => api.get<CompanyDetail>(`/api/companies/${id}`),

  /** `places` is optional and says where it operates; its vehicles inherit them. */
  create: (name: string, places: Place[] = []) =>
    api.post<CompanyDetail>('/api/companies', { name, places }),

  update: (
    id: number,
    body: {
      name: string
      mobile?: string | null
      email?: string | null
      gstin?: string | null
      address?: string | null
      head_office_city_id?: number | null
    },
  ) => api.put<CompanyDetail>(`/api/companies/${id}`, body),

  deactivate: (id: number) => api.delete<void>(`/api/companies/${id}`),

  restore: (id: number) => api.post<CompanyDetail>(`/api/companies/${id}/restore`),

  locations: (id: number) => api.get<CompanyLocation[]>(`/api/companies/${id}/locations`),

  /** Replaces the whole set. An empty list means the company serves NOWHERE. */
  setLocations: (id: number, places: Place[]) =>
    api.put<CompanyLocation[]>(`/api/companies/${id}/locations`, { places }),

  members: (id: number) => api.get<CompanyMember[]>(`/api/companies/${id}/members`),

  vehicles: (id: number) => api.get<VehicleSummary[]>(`/api/companies/${id}/vehicles`),
}

// ── vehicles ────────────────────────────────────────────────────────────────

export interface VehicleFilters {
  /** Registration number. */
  q?: string
  /** The driver's, owner's or company's mobile OR name — whichever holds it. */
  contact?: string
  /** The KIND of owner: 'company' or 'person'. Not a specific one — that is company_id. */
  owned?: string | null
  company_id?: number | null
  owner_user_id?: number | null
  body_type_id?: number | null
  min_tons?: string | number | null
  /** A location filter. It does NOT imply active=true — send both to ask what is dispatchable. */
  serving_city_id?: number | null
  serving_state_id?: number | null
  active?: boolean | null
  page?: number
  page_size?: number
  sort?: string
}

export const vehicles = {
  list: (f: VehicleFilters) => api.get<Page<VehicleSummary>>('/api/vehicles' + query({ ...f })),

  get: (id: number) => api.get<VehicleDetail>(`/api/vehicles/${id}`),

  /** Exactly one of owner_company_id / owner_user_id. */
  create: (body: {
    registration_number: string
    body_type_id: number
    owner_company_id?: number | null
    owner_user_id?: number | null
    owner_also_drives?: boolean
    no_of_axles?: number | null
    no_of_wheels?: number | null
    capacity_id?: number | null
    length_ft?: string | number | null
    /** Only for a person-owned vehicle — a company's truck inherits its company's. */
    places?: Place[]
  }) => api.post<VehicleDetail>('/api/vehicles', body),

  /**
   * Register a truck from what the desk actually has: a plate, a driver's name and mobile, and
   * a company name.
   *
   * <p>The driver is matched on the mobile and the company on its name; either is created if it
   * is new, the driver is put on the company's books, and the assignment is made — all in one
   * transaction, so a rejected plate leaves no orphans behind.
   *
   * <p>Omit `company_name` and the driver owns the vehicle: the owner-operator. This is also the
   * only way a non-administrator creates a user record.
   */
  intake: (body: {
    registration_number: string
    body_type_id: number
    driver_name: string
    driver_mobile: string
    company_name?: string | null
    no_of_axles?: number | null
    no_of_wheels?: number | null
    capacity_id?: number | null
    length_ft?: string | number | null
    /**
     * Where it runs. With a `company_name` these become the COMPANY's locations, which every
     * truck it owns inherits; without one they are the vehicle's own.
     */
    places?: Place[]
  }) => api.post<VehicleDetail>('/api/vehicles/intake', body),

  /** The truck's own attributes. Owner and drivers have their own calls. */
  update: (
    id: number,
    body: {
      body_type_id: number
      no_of_axles?: number | null
      no_of_wheels?: number | null
      capacity_id?: number | null
      length_ft?: string | number | null
      notes?: string | null
    },
  ) => api.put<VehicleDetail>(`/api/vehicles/${id}`, body),

  deactivate: (id: number) => api.delete<void>(`/api/vehicles/${id}`),

  restore: (id: number) => api.post<VehicleDetail>(`/api/vehicles/${id}/restore`),

  /** **Removes every driver assignment** and reports how many in `removed_drivers`. */
  setOwner: (
    id: number,
    body: { company_id?: number | null; user_id?: number | null; owner_also_drives?: boolean },
  ) => api.put<OwnerChanged>(`/api/vehicles/${id}/owner`, body),

  drivers: (id: number) => api.get<VehicleDriver[]>(`/api/vehicles/${id}/drivers`),

  /**
   * For a company-owned vehicle the user must already be on that company's books, or this is
   * a 409. Idempotent: re-adding someone updates their row.
   */
  addDriver: (id: number, user_id: number, primary: boolean) =>
    api.post<VehicleDriver[]>(`/api/vehicles/${id}/drivers`, { user_id, primary }),

  setPrimaryDriver: (id: number, userId: number) =>
    api.put<VehicleDriver[]>(`/api/vehicles/${id}/drivers/${userId}/primary`),

  removeDriver: (id: number, userId: number) =>
    api.delete<void>(`/api/vehicles/${id}/drivers/${userId}`),

  /** The EFFECTIVE locations: the company's if a company owns it, otherwise its own. */
  locations: (id: number) => api.get<EffectiveLocation[]>(`/api/vehicles/${id}/locations`),

  /** Refused with a 409 for a company-owned vehicle — set them on the company instead. */
  setLocations: (id: number, places: Place[]) =>
    api.put<EffectiveLocation[]>(`/api/vehicles/${id}/locations`, { places }),
}

// ── photo intake ────────────────────────────────────────────────────────────

export const intake = {
  list: (tab: IntakeTab, page = 1, pageSize = 25) =>
    api.get<Page<IntakeSummary>>(
      '/api/intake' + query({ tab, page, page_size: pageSize }),
    ),

  counts: () => api.get<IntakeCounts>('/api/intake/counts'),

  get: (id: number) => api.get<IntakeDetail>(`/api/intake/${id}`),

  /**
   * Turn a reviewed photo into a vehicle.
   *
   * The server creates it through the same path as the manual intake form, so the
   * driver-must-be-employed and locations-belong-to-the-company rules apply identically.
   */
  complete: (
    id: number,
    body: {
      registration_number: string
      body_type_id: number
      driver_name: string
      driver_mobile: string
      /** Optional second number for the SAME driver. Never used to look anyone up. */
      driver_alt_mobile?: string | null
      company_name?: string | null
      /** Optional. Stored on the company, not the driver. */
      company_mobile?: string | null
      no_of_axles?: number | null
      no_of_wheels?: number | null
      capacity_id?: number | null
      length_ft?: string | number | null
      places?: Place[]
    },
  ) => api.post<IntakeSummary>(`/api/intake/${id}/complete`, body),

  /**
   * Correct what the photo says, from the worklist.
   *
   * Omitting a field leaves it alone; sending an empty value clears it. What OCR read is never
   * overwritten — these are stored as the CSR's answer and win over the machine's.
   */
  correct: (
    id: number,
    body: {
      plate?: string
      mobiles?: string[]
      company?: string
      driver_name?: string
      body_type_id?: number | null
      capacity_id?: number | null
      no_of_axles?: number | null
      no_of_wheels?: number | null
      length_ft?: string | number | null
      places?: Place[]
    },
  ) => api.patch<IntakeSummary>(`/api/intake/${id}`, body),

  /**
   * What is already on file under this company name and these numbers.
   *
   * Uses the same lookups completion uses, so the preview cannot disagree with what actually
   * happens. Company matching is **exact on the lower-cased name** — there is no fuzzy match.
   */
  lookup: (company: string, mobiles: string[]) => {
    // URLSearchParams, not the `query` helper: `mobile` repeats, and a Record cannot hold the
    // same key twice. Spring binds the repeats into List<String>.
    const params = new URLSearchParams()
    if (company.trim()) params.set('company', company.trim())
    for (const m of mobiles) {
      if (m.trim()) params.append('mobile', m.trim())
    }
    return api.get<IntakeLookup>(`/api/intake/lookup?${params}`)
  },

  discard: (id: number, reason: string) =>
    api.post<IntakeSummary>(`/api/intake/${id}/discard`, { reason }),

  /**
   * Put a FAILED row back in the OCR queue.
   *
   * **The only way a failed photo is ever read again** — the worker does not retry on its own.
   * It polls the database, so this takes effect on its next poll; there is nothing to notify. A
   * row a worker currently holds is refused with a 409 rather than re-queued under it.
   */
  retry: (id: number) => api.post<IntakeSummary>(`/api/intake/${id}/retry`),
}

/**
 * Fetch one uploaded photo as an object URL.
 *
 * **Not a plain `<img src>`.** This API authenticates with a bearer token in a header, and a
 * browser will not attach one to an image request — pointing an `<img>` at the endpoint gets a
 * 401 and a broken-image icon. So the bytes are fetched like any other call and wrapped in a
 * blob URL, which the caller must revoke when the image unmounts or the tab leaks memory.
 */
export async function photoObjectUrl(
  intakeId: number,
  index: number,
  maxWidth?: number,
): Promise<string> {
  const query = maxWidth ? `?w=${maxWidth}` : ''
  return api.blob(`/api/intake/${intakeId}/photo/${index}${query}`)
}

// ── lorry receipts ──────────────────────────────────────────────────────────

/**
 * Consignment notes.
 *
 * **There is no `delete`, and adding one would be wrong.** A receipt is cancelled instead: the
 * customer holds a copy and the number series has to stay continuous, so the row and its number
 * are kept. The API has no DELETE route to call.
 */
export const lr = {
  list: (f: LrFilters) => api.get<Page<LorryReceipt>>('/api/lr' + query({ ...f })),

  get: (id: number) => api.get<LorryReceipt>(`/api/lr/${id}`),

  totals: () => api.get<LrTotals>('/api/lr/totals'),

  /**
   * What the next receipt will be numbered.
   *
   * A preview, not a reservation — two clerks with the form open see the same number and the
   * one who saves first gets it. Show it as a placeholder, never as a committed value.
   */
  nextNumber: () => api.get<{ lr_number: string }>('/api/lr/next-number'),

  create: (body: LrSaveRequest) => api.post<LorryReceipt>('/api/lr', body),

  /** Only while booked or in transit; a closed receipt answers 409. */
  update: (id: number, body: LrSaveRequest) => api.put<LorryReceipt>(`/api/lr/${id}`, body),

  status: (id: number, status: LrStatus, reason?: string) =>
    api.post<LorryReceipt>(`/api/lr/${id}/status`, { status, reason }),

  cancel: (id: number, reason?: string) =>
    api.post<LorryReceipt>(`/api/lr/${id}/cancel`, { reason }),

  /** Two copies on one A4 sheet, drawn server-side. Saves as `<LR number>.pdf`. */
  download: (id: number, lrNumber: string) =>
    api.download(`/api/lr/${id}/pdf`, `${lrNumber}.pdf`),
}

/**
 * The two masters lorry receipts introduced.
 *
 * `customers` are the firms that send and receive goods — **not** `/api/companies`, which is
 * transport companies that own vehicles and employ drivers.
 */
export const customers = {
  list: (f: { q?: string; active?: boolean; page?: number; page_size?: number; sort?: string }) =>
    api.get<Page<Customer>>('/api/customers' + query({ ...f })),

  get: (id: number) => api.get<Customer>(`/api/customers/${id}`),

  create: (body: { name: string; mobile?: string; address?: string; gstin?: string }) =>
    api.post<Customer>('/api/customers', body),

  update: (id: number, body: { name: string; mobile?: string; address?: string; gstin?: string }) =>
    api.put<Customer>(`/api/customers/${id}`, body),

  /** Retire, never delete — receipts point here and a delete would unlink every one of them. */
  retire: (id: number) => api.post<Customer>(`/api/customers/${id}/retire`),

  restore: (id: number) => api.post<Customer>(`/api/customers/${id}/restore`),
}

export const goodsTypes = {
  list: (includeInactive = false) =>
    api.get<GoodsTypeRef[]>('/api/goods-types' + query({ include_inactive: includeInactive })),

  create: (name: string) => api.post<GoodsTypeRef>('/api/goods-types', { name }),

  retire: (id: number) => api.post<GoodsTypeRef>(`/api/goods-types/${id}/retire`),

  restore: (id: number) => api.post<GoodsTypeRef>(`/api/goods-types/${id}/restore`),
}

// ── freight lanes ───────────────────────────────────────────────────────────

/**
 * Lane intelligence: what moves where, as reported to a CSR.
 *
 * **Not consignments.** `lr` is the register of business won; this is the register of business
 * that exists and is currently going to somebody else. Nothing here creates an obligation.
 *
 * There is no `delete`, deliberately: a lane that turned out to be wrong is retired, so the
 * next person to suggest it can see it was tried.
 */
export const lanes = {
  list: (f: {
    q?: string
    active?: boolean
    from_city_id?: number
    to_city_id?: number
    goods_type_id?: number
    seasonal?: boolean
    page?: number
    page_size?: number
    sort?: string
  }) => api.get<Page<FreightLane>>('/api/lanes' + query({ ...f })),

  get: (id: number) => api.get<FreightLane>(`/api/lanes/${id}`),

  create: (body: LaneSaveRequest) => api.post<FreightLane>('/api/lanes', body),

  update: (id: number, body: LaneSaveRequest) =>
    api.put<FreightLane>(`/api/lanes/${id}`, body),

  retire: (id: number) => api.post<FreightLane>(`/api/lanes/${id}/retire`),

  restore: (id: number) => api.post<FreightLane>(`/api/lanes/${id}/restore`),
}
