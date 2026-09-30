# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What this is

The browser client for the `vehicleManagement` API. React 18 · TypeScript · Vite. No UI code
lives in the API project and no domain rules live here — see "Where a rule belongs" below.

Sibling repo: **`C:\repos\vehicleManagement`** is the API. Its `README.md` and `CLAUDE.md` are
the authority on the domain; this project only renders it. `C:\repos\tts` and
`C:\repos\FreightDesk` are unrelated to this one.

## Commands

```bat
npm run dev        :: http://localhost:5173
npm run build      :: tsc -b, then bundle
npm run typecheck  :: types only
```

The API must be running, with `VM_CORS_ORIGINS=http://localhost:5173` and `VM_JWT_SECRET` set,
or every call fails — and a CORS refusal is indistinguishable from the API being down, which is
why `client.ts` says both in one message.

**Port 5173 is load-bearing.** It is the origin the API allows by default. Changing it here
requires changing `VM_CORS_ORIGINS` there.

## Where a rule belongs

**Every domain rule is enforced by the API, and underneath it by PostgreSQL.** Nothing here
protects anything; `RequireAdmin` and the filtered dropdowns are conveniences that avoid showing
a control guaranteed to return 403 or 409.

So the pattern for a rule is: **let the server own it, and shape the UI so the invalid state is
unreachable rather than merely rejected.** A radio for owner rather than two nullable fields. A
driver picker scoped to the company's members. A read-only locations panel on a company vehicle.
Do not add a client-side re-implementation of a rule — it will drift, and the drift is invisible
until someone hits the 409 the UI said could not happen.

## Things this code has already got right, and should keep

- **`src/api/types.ts` is snake_case, matching the wire.** No camelCase conversion layer. A
  converter is a second home for every field name, and a server-side rename would leave it
  compiling while the app reads `undefined`.
- **`@RequestParam`-style query names are literal.** The API does not apply its JSON naming
  strategy to query parameters, so `page_size` is spelt out.
- **`ApiError` parses both error shapes** — `{"detail": "..."}` and the field-keyed array — and
  `<Field name="mobile">` looks up its own message. Without that, the server's effort to say
  *which box is wrong* is wasted and everything reads "Invalid input".
- **One 401 handler** (`setUnauthorizedHandler`), because the API re-reads the account on every
  request and a token can die between two calls.
- **`PageParams` and `Sorts` exist once.** The API rejects an unknown `sort` with a 422 rather
  than ignoring it, so only whitelisted keys may be offered.
- **`useAsync` drops superseded responses.** Without the sequence guard, a search box's slowest
  request wins and the table disagrees with the input.
- **Buttons say what actually happens.** "Take off the road", not "Delete" — the API deactivates
  and keeps the row.
- **Cascades are announced and then counted.** `removed_drivers` on a sale,
  `removed_driver_assignments` on ending an employment. Both come back from the API precisely so
  they can be shown; swallowing them is how a user concludes data was lost.

## Traps

- **Never apply a UI wording change to `src/api/resources.ts`.** The strings there are the API's
  paths. A find-and-replace of "drivers" to "users" across `src/` once rewrote
  `/api/vehicles/{id}/drivers` to `/api/vehicles/{id}/users`, and every driver list silently
  returned nothing — the card rendered empty rather than erroring, so it looked like a data
  problem rather than a typo.
- **A blanket rename can shadow an import.** The same pass renamed a local `people` to `users`
  inside a `Promise.all` that calls the imported `users` client, putting the import in a temporal
  dead zone. Prefer targeted edits over regex sweeps across a whole `src/`.
- **The API has no "get one city" endpoint.** Turning a `city_id` into a name means fetching
  `GET /api/states/{id}/cities` for the referenced state. `CompanyDetailPage` does this; an
  earlier version printed `City #223` at the user instead.
- **`CompanyLocation` carries ids only; `EffectiveLocation` carries names.** They are different
  shapes for a reason — the vehicle view resolves through a SQL view, the company one does not.
- **A company-owned vehicle's `PUT /locations` is a 409, always.** Do not "fix" it by sending an
  empty list; set them on the company.
- **`addDriver` and `joinCompany` are idempotent** (the API merges on an assigned composite key),
  so a repeated POST updates rather than conflicting. Do not add a client-side duplicate check to
  simulate a 409 that will not happen.
- **Only STAFF and ADMIN may hold a login.** Never offer a password field for a driver; the API
  refuses it with a 409.
- **`POST`/`DELETE /api/users` are ADMIN-only.** The add button is hidden for everyone else.
  Office staff create a driver through `POST /api/vehicles/intake` and nowhere else.

## Known limits

- No tests. The screens were walked by hand against a live API.
- `window.confirm` for destructive actions: clear, but unstyled and blocking.
- No client cache or optimistic updates; every action re-fetches.
