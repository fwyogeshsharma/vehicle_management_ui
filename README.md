# Vehicle Management — UI

The browser client for the [`vehicleManagement`](../vehicleManagement) API. React 18 · TypeScript ·
Vite.

It is a separate project on a separate origin, which is why the API has explicit CORS
configuration rather than none.

---

## Running it

The API must be up first, with this origin allowed and a signing secret set:

```bat
:: in C:\repos\vehicleManagement
set VM_JWT_SECRET=<at least 32 characters>
set VM_ADMIN_USERNAME=root
set VM_ADMIN_PASSWORD=<a real password>
set VM_ADMIN_MOBILE=9800000001
set VM_CORS_ORIGINS=http://localhost:5173
mvn spring-boot:run
```

```bat
:: here
npm install
npm run dev            :: http://localhost:5173
```

```bat
npm run build          :: type-check, then bundle to dist/
npm run typecheck      :: types only
```

`VITE_API_BASE_URL` points at the API and defaults to `http://localhost:8080`. Copy
`.env.example` to `.env` to change it.

**Port 5173 is not arbitrary.** It is the origin the API allows by default. Change it in
`vite.config.ts` and you must change `VM_CORS_ORIGINS` to match, or every request fails
preflight and the browser reports a CORS error that looks like a bug in this code.

**Production** is served at https://trucks.rollingradius.com. Netlify proxies `/api/*` to the API
(see `netlify.toml`), so calls are same-origin; if the API is ever called directly instead, set
`VM_CORS_ORIGINS=https://trucks.rollingradius.com` there.

---

## The screens

| | |
|---|---|
| **Login** | Username and password, in exchange for a bearer token. |
| **Dashboard** | Counts, and "which trucks serve this city?" — the question the whole location model exists to answer. |
| **Vehicles** | The fleet, filtered and paged, each row showing who to ring. A vehicle's page holds its owner, its drivers, where it runs and its attributes — four separate things, four separate controls. |
| **Drivers** | Everyone on file — drivers, owners and office staff. A user's page is where they are attached to a company and where their trucks are listed. **Only an administrator can add or remove a user here**; office staff put a new driver on file by registering the vehicle they drive. |
| **Companies** | Who is on the books, what they own, where they operate. |
| **Intake** | Photos from the field, read by OCR and waiting for a phone call. Tabs for To call / Waiting / Failed / Done, with the photo beside the machine's reads. |
| **Accounts** | Administrators only: who can sign in, and creating new logins. |

### Registering a vehicle creates its driver and company

The registration form asks for the driver's **name and mobile** and the **company name**, not
ids — which is what the person at the desk actually has. Anyone not already on file is created,
the driver is put on the company's books, and they are assigned to the truck. Leave the company
blank and the driver owns it: the owner-operator.

This is also **the only way a non-administrator creates a user**, and it is deliberately scoped
to the truck in front of them. A second mode on the same form picks from existing records, for
the one case intake cannot express: a truck with no driver yet.

### Preferred locations are asked for up front

Both create forms carry a **Where it runs / Where it operates** field, so a route no longer means
save-then-navigate-then-edit. A location is a state, or a state narrowed to one city; a
whole-state row matches every city in it, and more than one is normal.

The vehicle form puts them where the model says they belong, and says which: with a company named
they become the **company's** locations and the field says so — plus a warning if that company
already exists, because setting them replaces the route for every truck it owns. Without a
company they are the vehicle's own. Both detail pages still have the same editor for changing
them later.

### There is no sign-up page, on purpose

The API has exactly one unauthenticated endpoint — `POST /api/auth/login`. Accounts are created
by an administrator from **Accounts**, which does three calls in one action: add the user, set
their role, grant them a username and password.

Only **office staff** and **administrators** can hold a login at all; the API refuses to give one
to a driver, because a driver with a password is a driver who can call the API. The users list
says **"never signs in"** against a driver rather than leaving a dash, because a dash reads as
missing data when it is in fact the rule. The login page says the same instead of offering a
"create an account" link that would fail.

The very first administrator cannot come from here either — it comes from `VM_ADMIN_*` at API
start-up, and that bootstrap only runs while nobody can already administer the system.

---

## What this client is careful about

Most of these are places where a plausible-looking UI would be quietly wrong.

### The rules are shown, not discovered

Several rules are enforced by the database, and a form that ignores them produces a 409 the user
cannot act on. So:

- **A company's truck may only be driven by someone on that company's books.** The driver picker
  on a company vehicle lists *only that company's own users*, and says why the list is short.
  On a personally-owned vehicle it lists everyone, and says why there is no restriction.
- **A company-owned vehicle cannot have preferred locations of its own.** Its page shows the
  company's locations read-only, labelled `from the company`, with a link to the place the change
  actually belongs. No editor that would fail.
- **A vehicle has exactly one owner.** Naming a company makes the company the owner; leaving it
  blank makes the driver the owner. The form cannot express "both" or "neither" at all.

### Destructive side effects are stated before and reported after

- **Selling a vehicle removes every driver assignment.** The confirmation says how many will go;
  the result says how many did (`removed_drivers`).
- **Ending an employment removes that user's assignments on that company's trucks.** Same:
  warned, then counted (`removed_driver_assignments`).
- **`DELETE` deactivates.** The buttons say "Take off the road", "Retire company", "Deactivate" —
  never "Delete", because the row and its history stay and can be restored.

### Errors land on the right input

The API answers a field-level failure with
`{"detail":[{"loc":["body","mobile"],"msg":"..."}]}`, naming the snake_case field the client
sent. `ApiError` parses it and `<Field>` looks up its own message, so a bad mobile number is
reported under the mobile box rather than as a banner saying "Invalid input".

### Names are spelt once

`src/api/types.ts` mirrors the DTOs in **snake_case, exactly as they go over the wire**. There is
no camelCase conversion layer, because a converter is a second place for a field name to live —
and when the server renames one the converter keeps compiling while the app reads `undefined`.

### A revoked token signs you out

The API re-reads the account on every request, so a token can stop working between one call and
the next — a password change, a deactivation, an administrator removing the login. Any 401 clears
the session through one handler, rather than each screen inventing its own behaviour. On start-up
the stored token is checked with `/api/auth/me` before the app renders, so a dead session does not
render a shell full of failing requests.

**The token is in `localStorage`.** That is the trade the API's design implies: a bearer token in
a header is never sent by the browser on its own, so there is no CSRF exposure and the API can
leave CSRF protection off — the cost is that a successful XSS could read it, which an HttpOnly
cookie would prevent. If that trade is revisited it has to be revisited on both sides at once.

### Paging and sorting match what the server will accept

1-based pages, `page_size` capped at 200 in one place (`PageParams`), and only whitelisted sort
keys are offered — because the API **rejects** an unknown `sort` with a 422 rather than silently
ignoring it. Every ordering has an `id` tiebreaker on the server, so rows do not drift between
pages.

---

### Lists

Every table is zebra-striped and highlights the row under the cursor — these rows are wide and
the eye needs help tracking across one. A retired or inactive row is dimmed on top of that, so
"struck off" and "every other row" never read as the same thing.

---

## Layout

```
src/
  api/
    types.ts        DTO mirrors, snake_case, no conversion layer
    client.ts       fetch wrapper: the two error shapes, and the 401 handler
    resources.ts    one function per endpoint, grouped by aggregate
  auth/
    AuthContext.tsx token, current user, sign in/out
    guards.tsx      RequireAuth / RequireAdmin — convenience, not security
  components/
    Form.tsx        Field / FormError — the field-keyed error plumbing
    Pager.tsx       paging and sortable headers
    PlacesEditor.tsx  a state, optionally one city; null city = the whole state
    Layout.tsx      nav
    useAsync.ts     load-once-and-reload, with a stale-response guard
  pages/            one per screen, plus the two detail screens
  index.css         one stylesheet, no framework
```

---

## Known limits

- **Resolving a city name costs a request per state.** The API has no "get one city" endpoint,
  only the list for a state, so the company locations card fetches each referenced state's cities
  to turn an id into a name. A `GET /api/cities/{id}` on the API would remove it.
- **Destructive confirmations use `window.confirm`.** Clear and accessible, but unstyled and
  blocking. An inline confirmation would read better on the two cascade warnings.
- **No optimistic updates and no client cache.** Every action re-fetches. That is honest and
  simple at this size; a fleet of thousands would want something better on the list screens.
- **No tests.** The API has 211; this has none. The screens were walked by hand against a live
  API, which is not the same thing as a suite that runs again tomorrow.
- **`user_type` is one value per person**, inherited from the API — so an owner-operator shows a
  single badge (`BOTH`) rather than two roles.
