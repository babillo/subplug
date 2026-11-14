// Nigerian mobile networks and their usual number prefixes. A prefix only SUGGESTS a network:
// people keep their number when they switch networks (porting), so the customer can always change it.

export type NetworkId = "mtn" | "airtel" | "glo" | "9mobile";

export const NETWORKS: { id: NetworkId; label: string; color: string; ink: string }[] = [
  { id: "mtn", label: "MTN", color: "#ffcc00", ink: "#1a1a1a" },
  { id: "airtel", label: "Airtel", color: "#e40000", ink: "#ffffff" },
  { id: "glo", label: "Glo", color: "#3aa335", ink: "#ffffff" },
  { id: "9mobile", label: "9mobile", color: "#006e53", ink: "#ffffff" },
];

const PREFIXES: Record<NetworkId, string[]> = {
  mtn: [
    "0703",
    "0704",
    "0706",
    "0803",
    "0806",
    "0810",
    "0813",
    "0814",
    "0816",
    "0903",
    "0906",
    "0913",
    "0916",
  ],
  airtel: ["0701", "0708", "0802", "0808", "0812", "0901", "0902", "0904", "0907", "0911", "0912"],
  glo: ["0705", "0805", "0807", "0811", "0815", "0905", "0915"],
  "9mobile": ["0809", "0817", "0818", "0908", "0909"],
};

/** The network a number most likely belongs to, from its first 4 digits; null if unknown. */
export function guessNetwork(phone: string): NetworkId | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("234")) digits = `0${digits.slice(3)}`;
  if (digits.length < 4) return null;
  const prefix = digits.slice(0, 4);
  for (const [network, prefixes] of Object.entries(PREFIXES) as [NetworkId, string[]][]) {
    if (prefixes.includes(prefix)) return network;
  }
  return null;
}
