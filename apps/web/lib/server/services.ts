// Server-only singletons: one database pool and one purchase service per server process.
// Never import this from a client component: it holds the database and provider credentials.
import { createProviderRegistry, createPurchaseService } from "@repo/core";
import { createDb } from "@repo/db";

type Services = {
  purchases: ReturnType<typeof createPurchaseService>;
};

let services: Services | undefined;

export function getServices(): Services {
  if (!services) {
    const { db } = createDb();
    services = {
      purchases: createPurchaseService({ db, getProvider: createProviderRegistry() }),
    };
  }
  return services;
}
