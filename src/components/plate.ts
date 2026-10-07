/**
 * A vehicle's plate for display. The API allows a vehicle with no registration number yet
 * (changeset 023), and an empty link or heading is unclickable and unreadable.
 */
export function plateOf(v: { id: number; registration_number: string | null }): string {
  return v.registration_number ?? `No plate (#${v.id})`
}
