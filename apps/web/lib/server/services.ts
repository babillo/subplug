// Server-only singletons: one database pool and the services built on it, per server process.
// Never import this from a client component: it holds database and API credentials.
// Each service is created on first use, so a missing setting only breaks the routes that need it.
import {
  type AuthService,
  createAuthService,
  createMonnifyGatewayFromEnv,
  createOtpSenderFromEnv,
  createProviderRegistry,
  createPurchaseService,
  type FundingGateway,
  getAuthSecret,
} from "@repo/core";
import { createDb, type Database } from "@repo/db";

type Services = {
  db: Database;
  auth: () => AuthService;
  purchases: () => ReturnType<typeof createPurchaseService>;
  fundingGateway: () => FundingGateway;
};

let services: Services | undefined;

export function getServices(): Services {
  if (!services) {
    const { db } = createDb();
    let auth: AuthService | undefined;
    let purchases: ReturnType<typeof createPurchaseService> | undefined;
    let gateway: FundingGateway | undefined;
    const getAuth = () =>
      (auth ??= createAuthService({
        db,
        sender: createOtpSenderFromEnv(),
        secret: getAuthSecret(),
      }));
    services = {
      db,
      auth: getAuth,
      purchases: () =>
        (purchases ??= createPurchaseService({
          db,
          getProvider: createProviderRegistry(),
          verifyPin: getAuth().verifyPin,
        })),
      fundingGateway: () => (gateway ??= createMonnifyGatewayFromEnv()),
    };
  }
  return services;
}
