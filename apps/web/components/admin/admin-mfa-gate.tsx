// The two-step screen for a page whose approval ran out (see getAdminAccess).
import type { AdminAccess } from "@/lib/server/admin-page";

import { MfaGate } from "./mfa-gate";

export function AdminMfaGate({ access }: { access: Extract<AdminAccess, { state: "needs_mfa" }> }) {
  return (
    <MfaGate
      enrolled={access.enrolled}
      firstName={access.user.fullName.split(" ")[0] ?? access.user.fullName}
    />
  );
}
