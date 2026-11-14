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
import { getTestUserId, testAuthEnabled } from "@/lib/server/test-auth";

type Account = { bankName: string; accountNumber: string; accountName: string };
const view = (accounts: Account[]) =>
  accounts.map(({ bankName, accountNumber, accountName }) => ({
    bankName,
    accountNumber,
    accountName,
  }));

function unauthorized() {
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

const STATUS: Record<FundingError["code"], number> = {
  id_required: 400,
  email_required: 400,
  user_not_found: 404,
  user_suspended: 403,
};

export async function GET(request: Request) {
  const userId = getTestUserId(request);
  if (!userId) return unauthorized();
  const accounts = await listFundingAccounts(getServices().db, userId);
  return Response.json({ accounts: view(accounts) });
}

export async function POST(request: Request) {
  const userId = getTestUserId(request);
  if (!userId) return unauthorized();

  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed === "object" && parsed !== null) body = parsed as Record<string, unknown>;
  } catch {
    // treated as empty: the id check below explains what's missing
  }
  const bvn = typeof body.bvn === "string" ? body.bvn : undefined;
  const nin = typeof body.nin === "string" ? body.nin : undefined;

  try {
    const { db, fundingGateway } = getServices();
    const { accounts, created } = await createFundingAccounts(db, fundingGateway(), {
      userId,
      bvn,
      nin,
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
