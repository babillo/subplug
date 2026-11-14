// GET  /api/orders?status=&limit=&offset= — the signed-in customer's orders, newest first.
// POST /api/orders — buy airtime or data from the wallet. Signed-in customers only.
// Body: { productId, recipientPhone, pin, faceValueKobo? (airtime), clientReference? }
// Responses: 201 new order (status success | pending | failed+refunded), 200 repeated tap,
// 400 invalid input, 401 not signed in, 402 not enough balance, 403 wrong PIN, 409 no PIN set,
// 423 PIN locked, 429 same number too soon.
import { listUserOrders, orderResponse } from "@repo/core";
import { parseCreateOrderRequest } from "@repo/shared";

import { getServices } from "@/lib/server/services";
import {
  badRequest,
  errorResponse,
  orderStatusFrom,
  pageFrom,
  readJson,
} from "@/lib/server/responses";
import { getSignedInUser, unauthorized } from "@/lib/server/session";

export async function GET(request: Request) {
  const user = await getSignedInUser(request);
  if (!user) return unauthorized();
  const url = new URL(request.url);
  const result = await listUserOrders(getServices().db, user.id, {
    ...pageFrom(url),
    status: orderStatusFrom(url),
  });
  return Response.json(result);
}

export async function POST(request: Request) {
  const user = await getSignedInUser(request);
  if (!user) return unauthorized();

  const body = await readJson(request);
  if (!body) return badRequest("Send a JSON body.");
  const parsed = parseCreateOrderRequest(body);
  if (!parsed.ok) return badRequest("Check the highlighted fields.", parsed.errors);

  try {
    const { order, duplicate } = await getServices()
      .purchases()
      .buy({ userId: user.id, ...parsed.value });
    const { status, body: responseBody } = orderResponse(order, duplicate);
    return Response.json(responseBody, { status });
  } catch (error) {
    return errorResponse(error, "POST /api/orders");
  }
}
