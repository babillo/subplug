// pnpm db:seed — fills the dev database with test data (test user, wallet, products).
// The seed data is written in the "Database schema + wallet ledger" step, once the tables exist.
import { createDb } from "../client.ts";

const { close } = createDb();
try {
  console.log("Nothing to seed yet: there are no tables. The seed data arrives with the schema.");
} finally {
  await close();
}
