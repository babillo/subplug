// pnpm vtpass:check — prints the VTpass sandbox wallet balance and MTN data plans.
// Never prints API keys. It shows only where each setting came from, its length and obvious
// problems (blank, spaces, quotes, wrong prefix), so a bad .env.local is easy to spot.
import { loadLocalEnv } from "@repo/db/env";

import { formatNaira } from "../money.ts";
import { ProviderError } from "../providers/types.ts";
import { createVtpassAdapterFromEnv, VTPASS_ENV_NAMES } from "../providers/vtpass/adapter.ts";

// Note which settings were already in the real environment before .env.local fills in the rest.
const fromEnvironment = new Set(VTPASS_ENV_NAMES.filter((name) => process.env[name] !== undefined));
loadLocalEnv();

const EXPECTED_PREFIX: Partial<Record<(typeof VTPASS_ENV_NAMES)[number], string>> = {
  VTPASS_PUBLIC_KEY: "PK_",
  VTPASS_SECRET_KEY: "SK_",
};

function describeSetting(name: (typeof VTPASS_ENV_NAMES)[number]): string {
  const value = process.env[name];
  if (value === undefined) return "NOT SET";
  const source = fromEnvironment.has(name) ? "system environment" : ".env.local";
  // The base URL isn't secret, so show it in full.
  if (name === "VTPASS_BASE_URL") return `${JSON.stringify(value)}  (from ${source})`;

  const trimmed = value.trim();
  const problems: string[] = [];
  if (trimmed === "") problems.push("BLANK");
  if (trimmed !== value) problems.push("has spaces or line breaks at the ends (ignored)");
  if (/["']/.test(trimmed)) problems.push("contains quote marks");
  if (/\s/.test(trimmed)) problems.push("contains spaces in the middle");
  if (/^VTPASS_[A-Z_]+=/.test(trimmed)) problems.push("contains another setting's line");
  const prefix = EXPECTED_PREFIX[name];
  if (prefix && trimmed !== "" && !trimmed.startsWith(prefix)) {
    problems.push(`should start with ${prefix}`);
  }
  if (prefix === undefined && /^(PK|SK)_/.test(trimmed)) {
    problems.push("looks like a public/secret key, not the api-key");
  }
  const status = problems.length ? `PROBLEM: ${problems.join("; ")}` : "looks OK";
  return `${trimmed.length} characters, from ${source}, ${status}`;
}

console.log("VTpass settings (values hidden):");
for (const name of VTPASS_ENV_NAMES) console.log(`  ${name.padEnd(18)} ${describeSetting(name)}`);
console.log();

try {
  const vtpass = createVtpassAdapterFromEnv();

  const { balanceKobo } = await vtpass.getBalance();
  console.log(`Wallet balance: ${formatNaira(balanceKobo)}\n`);

  const { serviceName, variations } = await vtpass.getVariations("mtn-data");
  console.log(`${serviceName ?? "mtn-data"}: ${variations.length} plans`);
  console.table(
    variations.map((plan) => ({
      code: plan.code,
      name: plan.name,
      price: formatNaira(plan.priceKobo),
      fixed: plan.fixedPrice ? "yes" : "no",
    })),
  );
} catch (error) {
  if (error instanceof ProviderError) {
    console.error(`VTpass error: ${error.message}`);
    if (error.raw !== undefined) console.error("VTpass replied:", JSON.stringify(error.raw));
    if (error.httpStatus === 401) {
      // Observed on the sandbox: a plain-text reply means the api-key was missing, blank, or ignored
      // because the profile's API authentication type is "Basic";
      // {"code":"087"} means an api-key arrived but VTpass doesn't recognise it.
      console.error(
        typeof error.raw === "string"
          ? "\nHint: VTpass ignored the API keys. Most likely cause (seen in practice): your sandbox " +
              "profile's API authentication type is 'Basic'. Set it to 'All' or 'API Keys' " +
              "(sandbox.vtpass.com > Profile > API Keys). Otherwise check that VTPASS_API_KEY " +
              "above is the API key, not the public or secret key."
          : "\nHint: VTpass received keys but rejected them. Make sure they come from your SANDBOX " +
              "account (sandbox.vtpass.com > profile > API Keys); live keys don't work on the sandbox.",
      );
    }
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
}
