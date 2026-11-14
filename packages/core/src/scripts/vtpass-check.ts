// pnpm vtpass:check — prints the VTpass sandbox wallet balance and MTN data plans.
// Never prints API keys: errors show only VTpass's reply and which settings are missing.
import { loadLocalEnv } from "@repo/db/env";

import { formatNaira } from "../money.ts";
import { ProviderError } from "../providers/types.ts";
import { createVtpassAdapterFromEnv } from "../providers/vtpass/adapter.ts";

loadLocalEnv();

try {
  const vtpass = createVtpassAdapterFromEnv();
  console.log(`VTpass: ${vtpass.baseUrl}`);

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
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
}
