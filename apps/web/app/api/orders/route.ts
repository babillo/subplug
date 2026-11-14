// POST /api/orders — buy airtime or data from the wallet.
// Body: { productId, recipientPhone, faceValueKobo? (airtime), clientReference? }
// Responses: 201 new order (status success | pending | failed+refunded), 200 repeated tap,
// 400 invalid input, 401 not signed in, 402 not enough balance, 429 same number too soon.
import { orderResponse, purchaseErrorResponse } from "@repo/core";
import { parseCreateOrderRequest } from "@repo/shared";

import { getServices } from "@/lib/server/services";
import { getTestUserId, testAuthEnabled } from "@/lib/server/test-auth";

export async function POST(request: Request) {
  const userId = getTestUserId(request);
  if (!userId) {
    return Response.json(
      {
        error: {
          code: "unauthorized",
          message: testAuthEnabled()
            ? "Send an x-test-user-id header with your user id."
            : "Sign-in isn't available yet.",
        },
      },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: "invalid_input", message: "Send a JSON body." } },
      { status: 400 },
    );
  }

  const parsed = parseCreateOrderRequest(body);
  if (!parsed.ok) {
    return Response.json(
      {
        error: {
          code: "invalid_input",
          message: "Check the highlighted fields.",
          fields: parsed.errors,
        },
      },
      { status: 400 },
    );
  }

  try {
    const { order, duplicate } = await getServices().purchases.buy({ userId, ...parsed.value });
    const { status, body: responseBody } = orderResponse(order, duplicate);
    return Response.json(responseBody, { status });
  } catch (error) {
    const known = purchaseErrorResponse(error);
    if (known) return Response.json(known.body, { status: known.status, headers: known.headers });
    console.error("POST /api/orders failed", error);
    return Response.json(
      {
        error: {
          code: "server_error",
          message:
            "Something went wrong. You have not been charged twice; please check your orders.",
        },
      },
      { status: 500 },
    );
  }
}
