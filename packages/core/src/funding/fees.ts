// What we charge for funding a wallet by bank transfer. The ONE place to change it
// (until fees move to admin settings).
//
// PLACEHOLDER business decision: a flat ₦50 per deposit, roughly covering the gateway's charge,
// as many Nigerian VTU apps do. Waived on deposits of ₦50 or less so a customer never sends money
// and receives ₦0. The fee is recorded on the funding event, so statements can show it.
import type { Kobo } from "../money.ts";

export const FUNDING_FEE_FLAT_KOBO: Kobo = 5_000; // ₦50

/** The fee for a deposit of `grossKobo` (what the customer sent). */
export function fundingFeeKobo(grossKobo: Kobo): Kobo {
  return grossKobo > FUNDING_FEE_FLAT_KOBO ? FUNDING_FEE_FLAT_KOBO : 0;
}
