import { listProductsAdmin } from "@repo/core";
import { bpsToPercent, formatNaira } from "@repo/shared/money";
import { NETWORKS } from "@repo/shared/networks";
import type { Metadata } from "next";

import { Badge } from "@/components/admin/bits";
import { type EditableProduct, PriceEditor, ProductToggle } from "@/components/admin/price-editor";
import { Card, Notice, PageTitle } from "@/components/ui";
import { getServices } from "@/lib/server/services";

export const metadata: Metadata = { title: "Products & prices" };

type Product = Awaited<ReturnType<typeof listProductsAdmin>>[number];

const COLS = "md:grid-cols-[minmax(0,1.5fr)_6.5rem_6.5rem_6.5rem_6.5rem_4rem_4.5rem]";

export default async function AdminProductsPage() {
  const products = await listProductsAdmin(getServices().db);
  const networks = [...new Set(products.map((p) => p.network))].sort(
    (a, b) => NETWORKS.findIndex((n) => n.id === a) - NETWORKS.findIndex((n) => n.id === b),
  );

  return (
    <>
      <PageTitle
        title="Products & prices"
        subtitle="Prices are what customers pay. Every change is saved in the audit log."
      />
      {products.some(
        (p) =>
          p.providerPriceKobo !== null &&
          p.prices.some((x) => x.priceKobo !== null && x.priceKobo < p.providerPriceKobo!),
      ) && (
        <Notice tone="warn">
          Some prices (marked ▼) are below what VTpass charges us, so each sale loses money. Fix
          them unless it’s a promo on purpose.
        </Notice>
      )}
      {products.length === 0 && (
        <Card>
          <p className="py-6 text-center text-muted">
            No products yet. Run <code>pnpm db:seed</code> on the laptop.
          </p>
        </Card>
      )}
      {networks.map((network) => {
        const meta = NETWORKS.find((n) => n.id === network);
        const airtime = products.filter((p) => p.network === network && p.category === "airtime");
        const data = products.filter((p) => p.network === network && p.category === "data");
        return (
          <section key={network} aria-labelledby={`net-${network}`} className="grid gap-3">
            <h2
              id={`net-${network}`}
              className="flex items-center gap-2 font-display text-xl font-semibold"
            >
              <span
                aria-hidden
                className="size-3 rounded-full"
                style={{ background: meta?.color ?? "var(--muted)" }}
              />
              {meta?.label ?? network}
            </h2>
            {airtime.length > 0 && <ProductTable title="Airtime" products={airtime} />}
            {data.length > 0 && <ProductTable title="Data" products={data} />}
          </section>
        );
      })}
    </>
  );
}

function ProductTable({ title, products }: { title: string; products: Product[] }) {
  const isData = products[0]?.category === "data";
  return (
    <Card className="grid gap-1">
      <h3 className="font-semibold">{title}</h3>
      <div role="table" aria-label={title} className="grid text-sm">
        <div
          role="row"
          className={`hidden gap-3 border-b border-line pb-2 text-xs font-bold tracking-wide text-muted uppercase md:grid ${COLS}`}
        >
          <span role="columnheader">Product</span>
          <span role="columnheader" className="text-right">
            {isData ? "VTpass cost" : ""}
          </span>
          <span role="columnheader" className="text-right">
            {isData ? "Regular" : "Regular disc."}
          </span>
          <span role="columnheader" className="text-right">
            {isData ? "Reseller" : "Reseller disc."}
          </span>
          <span role="columnheader" className="text-right">
            {isData ? "Margin" : ""}
          </span>
          <span role="columnheader">On sale</span>
          <span role="columnheader">
            <span className="sr-only">Edit</span>
          </span>
        </div>
        {products.map((p) => (
          <ProductRow key={p.id} product={p} />
        ))}
      </div>
    </Card>
  );
}

function ProductRow({ product: p }: { product: Product }) {
  const isData = p.category === "data";
  const price = (tier: "regular" | "reseller") => p.prices.find((x) => x.tier === tier);
  const show = (tier: "regular" | "reseller") => {
    const x = price(tier);
    if (!x) return <span className="text-bad">Not set</span>;
    if (!isData || x.priceKobo === null) return `${bpsToPercent(x.discountBps ?? 0)}%`;
    const belowCost = p.providerPriceKobo !== null && x.priceKobo < p.providerPriceKobo;
    return belowCost ? (
      <span className="font-semibold text-bad" title="Below what VTpass charges us">
        {formatNaira(x.priceKobo, { compact: true })} ▼
      </span>
    ) : (
      formatNaira(x.priceKobo, { compact: true })
    );
  };
  const regular = price("regular")?.priceKobo ?? null;
  const margin =
    isData && regular !== null && p.providerPriceKobo !== null
      ? regular - p.providerPriceKobo
      : null;
  const editable: EditableProduct = {
    id: p.id,
    name: p.name,
    category: p.category,
    providerPriceKobo: p.providerPriceKobo,
    prices: p.prices,
  };

  return (
    <div
      role="row"
      id={`p-${p.id}`}
      className={`grid scroll-mt-24 grid-cols-2 gap-x-3 gap-y-1 border-b border-line py-3 last:border-b-0 target:bg-cobalt-soft md:items-center ${COLS} ${p.isActive ? "" : "opacity-60"}`}
    >
      <span role="cell" className="col-span-2 min-w-0 md:col-span-1">
        <span className="block truncate font-semibold">{p.name}</span>
        <span className="block truncate text-xs text-muted">
          {p.providerVariationCode ?? p.providerServiceId} · {p.providerId}
          {!p.isActive && (
            <span className="ml-2">
              <Badge>Off sale</Badge>
            </span>
          )}
        </span>
      </span>
      <Cell label={isData ? "VTpass cost" : ""}>
        {isData && p.providerPriceKobo !== null
          ? formatNaira(p.providerPriceKobo, { compact: true })
          : ""}
      </Cell>
      <Cell label={isData ? "Regular" : "Regular discount"}>{show("regular")}</Cell>
      <Cell label={isData ? "Reseller" : "Reseller discount"}>{show("reseller")}</Cell>
      <Cell label={isData ? "Margin" : ""}>
        {margin !== null && (
          <span
            className={
              margin < 0 ? "font-semibold text-bad" : margin === 0 ? "text-muted" : "text-ok"
            }
          >
            {formatNaira(margin, { compact: true })}
          </span>
        )}
      </Cell>
      <span role="cell" className="flex items-center gap-2 md:block">
        <span className="text-xs text-muted md:hidden">On sale</span>
        <ProductToggle productId={p.id} active={p.isActive} name={p.name} />
      </span>
      <span role="cell" className="justify-self-end">
        <PriceEditor product={editable} />
      </span>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  // Columns that don't apply (e.g. cost for airtime) keep their place on laptops only.
  if (!label) return <span role="cell" className="hidden md:block" />;
  return (
    <span role="cell" className="num flex justify-between gap-2 md:block md:text-right">
      <span className="text-xs text-muted md:hidden">{label}</span>
      <span>{children}</span>
    </span>
  );
}
