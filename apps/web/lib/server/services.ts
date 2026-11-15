// The database and the services built on it. Never import this from a client component: it holds
// database and API credentials. Each service is created on first use, so a missing setting only
// breaks the routes that need it.
// - Laptop (Node): one shared set for the whole server process, as before.
// - Cloudflare Workers: a fresh set per request. Workers don't allow one request to reuse another's
//   database connection; Hyperdrive keeps the real connections to Neon warm, so this stays fast.
import { getCloudflareContext } from "@opennextjs/cloudflare";
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
import { createDb, type Database, getDatabaseUrl } from "@repo/db";
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

function buildServices(db: Database): Services {
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
  return {
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

/** True inside Cloudflare Workers (the hosted site), false on the laptop. */
function onCloudflare(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

let nodeServices: Services | undefined;
/** Cloudflare: one set per request, keyed by the request's context and dropped with it. */
const perRequest = new WeakMap<object, Services>();

export function getServices(): Services {
  if (!onCloudflare()) return (nodeServices ??= buildServices(createDb().db));
  const { env, ctx } = getCloudflareContext();
  let services = perRequest.get(ctx);
  if (!services) {
    const hyperdrive = (env as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE;
    const { db } = createDb(hyperdrive?.connectionString ?? getDatabaseUrl(), {
      maxConnections: 3,
      maxUses: 1,
    });
    services = buildServices(db);
    perRequest.set(ctx, services);
  }
  return services;
}
