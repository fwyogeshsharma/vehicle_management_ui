import { useEffect } from 'react'
import type { LorryReceipt } from '../api/types'

const money = (v: string | null | undefined) =>
  v == null ? '—' : '₹' + Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })

/**
 * The lorry receipt as a printable document.
 *
 * <p><b>Printing is the browser's, not ours.</b> tts does the same thing — render the document
 * into a hidden root, add a class to {@code body}, call {@code window.print()} — and it is the
 * right call: a server-rendered PDF means a PDF library, a font stack and a second place the
 * layout can be wrong, to produce something the operator then prints anyway.
 *
 * <p><b>Every value here comes off the receipt, never from a master.</b> That is the whole
 * reason the snapshot columns exist. A reprint of last year's receipt has to say what the
 * customer's copy says, even though the truck has been sold and the consignor renamed since.
 *
 * <p>Two copies are rendered — consignor and transporter — because that is what the pad this
 * replaces had, and a clerk printing twice to get the second is how the number series ends up
 * with a duplicate written on it by hand.
 */
export function LrDocument({ receipt, onDone }: { receipt: LorryReceipt; onDone: () => void }) {
  useEffect(() => {
    document.body.classList.add('printing')
    // afterprint fires for both "printed" and "cancelled" — either way the overlay must go.
    const finish = () => {
      document.body.classList.remove('printing')
      onDone()
    }
    window.addEventListener('afterprint', finish, { once: true })
    // One frame, so the document is in the DOM before the dialog freezes rendering.
    const t = window.setTimeout(() => window.print(), 50)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('afterprint', finish)
      document.body.classList.remove('printing')
    }
  }, [receipt.id, onDone])

  return (
    <div id="print-root">
      <Copy receipt={receipt} label="Consignor copy" />
      <Copy receipt={receipt} label="Transporter copy" />
    </div>
  )
}

function Copy({ receipt, label }: { receipt: LorryReceipt; label: string }) {
  return (
    <article className="lr-doc">
      <header className="lr-doc-head">
        <div>
          <h2>Lorry Receipt</h2>
          <p className="lr-doc-copy">{label}</p>
        </div>
        <div className="lr-doc-id">
          <p>
            <strong>{receipt.lr_number}</strong>
          </p>
          <p>{receipt.lr_date}</p>
          {receipt.status === 'CANCELLED' && <p className="lr-doc-void">CANCELLED</p>}
        </div>
      </header>

      <section className="lr-doc-parties">
        <div>
          <h3>Consignor</h3>
          <p className="lr-doc-name">{receipt.consignor_name}</p>
          {receipt.consignor_mobile && <p>{receipt.consignor_mobile}</p>}
          <p className="lr-doc-place">From: {receipt.from_place}</p>
        </div>
        <div>
          <h3>Consignee</h3>
          <p className="lr-doc-name">{receipt.consignee_name}</p>
          {receipt.consignee_mobile && <p>{receipt.consignee_mobile}</p>}
          <p className="lr-doc-place">To: {receipt.to_place}</p>
        </div>
      </section>

      <table className="lr-doc-table">
        <tbody>
          <tr>
            <th>Goods</th>
            <td>{receipt.goods_description ?? '—'}</td>
            <th>Weight</th>
            <td>{receipt.weight_kg ? Number(receipt.weight_kg) + ' kg' : '—'}</td>
            <th>Packages</th>
            <td>{receipt.packages ?? '—'}</td>
          </tr>
          <tr>
            <th>Truck</th>
            <td>{receipt.vehicle_number ?? '—'}</td>
            <th>Type</th>
            <td>{receipt.vehicle_type ?? '—'}</td>
            <th>Driver</th>
            <td>
              {receipt.driver_name ?? '—'}
              {receipt.driver_mobile ? ' · ' + receipt.driver_mobile : ''}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="lr-doc-charges">
        <tbody>
          <tr>
            <th>Freight</th>
            <td>{money(receipt.freight_charges)}</td>
          </tr>
          <tr>
            <th>Loading</th>
            <td>{money(receipt.loading_charges)}</td>
          </tr>
          <tr>
            <th>Unloading</th>
            <td>{money(receipt.unloading_charges)}</td>
          </tr>
          <tr>
            <th>Other</th>
            <td>{money(receipt.other_charges)}</td>
          </tr>
          <tr className="lr-doc-total">
            <th>Total</th>
            <td>{money(receipt.total_charges)}</td>
          </tr>
          <tr>
            <th>Advance</th>
            <td>{money(receipt.advance)}</td>
          </tr>
          <tr className="lr-doc-total">
            <th>Balance</th>
            <td>{money(receipt.balance)}</td>
          </tr>
        </tbody>
      </table>

      {receipt.special_instructions && (
        <p className="lr-doc-note">
          <strong>Instructions:</strong> {receipt.special_instructions}
        </p>
      )}

      <footer className="lr-doc-sign">
        <span>Consignor signature</span>
        <span>Driver signature</span>
        <span>For the transporter</span>
      </footer>
    </article>
  )
}

/**
 * Kept as a named export so a caller can print without mounting the page's state machine.
 * Mounting {@link LrDocument} is the supported path; this is here for a detail screen later.
 */
export function printReceipt() {
  window.print()
}
