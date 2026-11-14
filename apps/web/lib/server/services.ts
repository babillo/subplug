// Server-only singletons: one database pool, one purchase service and one funding gateway per
// server process. Never import this from a client component: it holds database and API credentials.
import {
  createMonnifyGatewayFromEnv,
  createProviderRegistry,
  createPurchaseService,
  type FundingGateway,
} from "@repo/core";
import { createDb, type Database } from "@repo/db";

type Services = {
  db: Database;
  purchases: ReturnType<typeof createPurchaseService>;
  /** Created on first use, so a missing MONNIFY_* setting only affects funding routes. */
  fundingGateway: () => FundingGateway;
};

let services: Services | undefined;

export function getServices(): Services {
  if (!services) {
    const { db } = createDb();
    let gateway: FundingGateway | undefined;
    services = {
      db,
      purchases: createPurchaseService({ db, getProvider: createProviderRegistry() }),
      fundingGateway: () => (gateway ??= createMonnifyGatewayFromEnv()),
    };
  }
  return services;
}
