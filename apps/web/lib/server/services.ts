// Server-only singletons: one database pool and the services built on it, per server process.
// Never import this from a client component: it holds database and API credentials.
// Each service is created on first use, so a missing setting only breaks the routes that need it.
import {
  type AdminMfa,
  type AuthService,
  createAdminMfa,
  type GetProvider,
  createAuthService,
  createMonnifyGatewayFromEnv,
  createOtpSenderFromEnv,
  createProviderRegistry,
  createPurchaseService,
  type FundingGateway,
  getAuthSecret,
} from "@repo/core";
import { createDb, type Database } from "@repo/db";
import { brand } from "@repo/shared";

type Services = {
  db: Database;
  auth: () => AuthService;
  purchases: () => ReturnType<typeof createPurchaseService>;
  fundingGateway: () => FundingGateway;
  adminMfa: () => AdminMfa;
  /** VTpass etc. (created on first use; a missing key only breaks what needs it). */
  getProvider: GetProvider;
};

let services: Services | undefined;

export function getServices(): Services {
  if (!services) {
    const { db } = createDb();
    let auth: AuthService | undefined;
    let purchases: ReturnType<typeof createPurchaseService> | undefined;
    let gateway: FundingGateway | undefined;
    let adminMfa: AdminMfa | undefined;
    const getAuth = () =>
      (auth ??= createAuthService({
        db,
        sender: createOtpSenderFromEnv(),
        secret: getAuthSecret(),
      }));
    const getProvider = createProviderRegistry();
    services = {
      db,
      getProvider,
      auth: getAuth,
      purchases: () =>
        (purchases ??= createPurchaseService({
          db,
          getProvider,
          verifyPin: getAuth().verifyPin,
        })),
      fundingGateway: () => (gateway ??= createMonnifyGatewayFromEnv()),
      adminMfa: () =>
        (adminMfa ??= createAdminMfa({ db, secret: getAuthSecret(), issuer: brand.name })),
    };
  }
  return services;
}
