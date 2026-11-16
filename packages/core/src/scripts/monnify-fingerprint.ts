// pnpm monnify:fingerprint — prints a harmless fingerprint of the Monnify keys in .env.local
// (lengths, kind, odd characters, a short code), never the keys. Compare it with Admin → System
// → "Check Monnify connection" on the staging site: same code = same keys.
import { loadLocalEnv } from "@repo/db";

import { formatFingerprint, monnifyFingerprint } from "../funding/monnify/fingerprint.ts";

loadLocalEnv();
for (const line of formatFingerprint(monnifyFingerprint(process.env))) console.log(line);
