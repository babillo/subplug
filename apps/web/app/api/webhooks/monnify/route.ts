// POST /api/webhooks/monnify — Monnify tells us money arrived in a customer's reserved account.
// No sign-in: Monnify calls this. Safety comes from the signature check AND asking Monnify
// directly before crediting (see packages/core/src/funding/funding.ts).
// Answers: 200 handled (Monnify stops resending), 401 bad signature, 500 please retry later.
import { handleFundingWebhook } from "@repo/core";

import { getServices } from "@/lib/server/services";

export async function POST(request: Request) {
  // The signature covers the exact bytes Monnify sent, so read the raw text, not parsed JSON.
  const rawBody = await request.text();
  const { db, fundingGateway } = getServices();

  let result;
  try {
    result = await handleFundingWebhook(db, fundingGateway(), {
      rawBody,
      headers: request.headers,
    });
  } catch (error) {
    // e.g. MONNIFY_* settings missing: ask Monnify to retry once it's fixed.
    console.error(
      "Monnify webhook could not be processed",
      error instanceof Error ? error.message : error,
    );
    return Response.json({ received: false }, { status: 500 });
  }

  // Log the outcome (never secrets) so funding problems can be traced.
  console.info("Monnify webhook", {
    outcome: result.outcome,
    transactionReference: result.transactionReference,
    amountKobo: result.amountKobo,
    feeKobo: result.feeKobo,
    creditedKobo: result.creditedKobo,
    reason: result.reason,
  });
  return Response.json({ received: result.httpStatus === 200 }, { status: result.httpStatus });
}
