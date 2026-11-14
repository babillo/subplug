// GET  /api/wallet/funding-accounts — the signed-in customer's account numbers for funding.
// POST /api/wallet/funding-accounts — create them. Body: { bvn } or { nin } (11 digits).
//      The BVN/NIN goes to Monnify only; we never store it.
import {
  createFundingAccounts,
  FundingError,
  FundingGatewayError,
  listFundingAccounts,
} from "@repo/core";

import { getServices } from "@/lib/server/services";
import { readJson, str } from "@/lib/server/responses";
import { getSignedInUser, unauthorized } from "@/lib/server/session";

type Account = { bankName: string; accountNumber: string; accountName: string };
const view = (accounts: Account[]) =>
  accounts.map(({ bankName, accountNumber, accountName }) => ({
    bankName,
    accountNumber,
    accountName,
  }));

const STATUS: Record<FundingError["code"], number> = {
  id_required: 400,
  email_required: 400,
  user_not_found: 404,
  user_suspended: 403,
};

export async function GET(request: Request) {
  const user = await getSignedInUser(request);
  if (!user) return unauthorized();
  const accounts = await listFundingAccounts(getServices().db, user.id);
  return Response.json({ accounts: view(accounts) });
}

export async function POST(request: Request) {
  const user = await getSignedInUser(request);
  if (!user) return unauthorized();
  const body = (await readJson(request)) ?? {};

  try {
    const { db, fundingGateway } = getServices();
    const { accounts, created } = await createFundingAccounts(db, fundingGateway(), {
      userId: user.id,
      bvn: str(body.bvn),
      nin: str(body.nin),
    });
    return Response.json({ accounts: view(accounts), created }, { status: created ? 201 : 200 });
  } catch (error) {
    if (error instanceof FundingError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: STATUS[error.code] },
      );
    }
    if (error instanceof FundingGatewayError) {
      console.error("Funding account creation failed at the gateway", error.message);
      return Response.json(
        {
          error: {
            code: "gateway_error",
            message: "We couldn't create your account number right now. Please try again shortly.",
          },
        },
        { status: 502 },
      );
    }
    console.error("POST /api/wallet/funding-accounts failed", error);
    return Response.json(
      { error: { code: "server_error", message: "Something went wrong." } },
      { status: 500 },
    );
  }
}
