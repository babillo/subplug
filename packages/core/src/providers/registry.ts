// Finds the adapter for a provider id stored on products and orders (e.g. "vtpass").
// Adding a provider later = write its adapter, then add one case here.
import type { GetProvider } from "../orders/purchase.ts";
import type { ProviderAdapter } from "./types.ts";
import { createVtpassAdapterFromEnv } from "./vtpass/adapter.ts";

export function createProviderRegistry(
  env: Record<string, string | undefined> = process.env,
): GetProvider {
  const adapters = new Map<string, ProviderAdapter>();
  return (providerId) => {
    let adapter = adapters.get(providerId);
    if (!adapter) {
      switch (providerId) {
        case "vtpass":
          adapter = createVtpassAdapterFromEnv(env);
          break;
        default:
          throw new Error(`No adapter for provider "${providerId}"`);
      }
      adapters.set(providerId, adapter);
    }
    return adapter;
  };
}
