// The customer's account numbers for funding. Used by the page and, right after creating them,
// by the form (so they show even if the page refresh is slow or fails).
import { Card } from "@/components/ui";

import { CopyButton } from "./copy-button";

export interface AccountView {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export function AccountCards({ accounts }: { accounts: AccountView[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {accounts.map((a) => (
        <Card key={a.accountNumber} className="grid gap-1 border-dashed">
          <div className="flex items-center justify-between text-sm text-muted">
            <span>{a.bankName}</span>
            <CopyButton text={a.accountNumber} />
          </div>
          <div className="num font-display text-2xl font-semibold tracking-wider">
            {a.accountNumber}
          </div>
          <div className="text-sm text-muted">{a.accountName}</div>
        </Card>
      ))}
    </div>
  );
}
