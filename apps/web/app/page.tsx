import { formatNaira } from "@repo/core";
import { brand } from "@repo/shared";

// Placeholder home page. It also proves the web app can import our own packages.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">{brand.name}</h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">{brand.tagline}</p>
      <p className="text-sm text-zinc-500">
        Sample wallet balance: <span className="font-mono">{formatNaira(150_050)}</span>
      </p>
    </main>
  );
}
