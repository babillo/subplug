// Where the backend lives. Set EXPO_PUBLIC_API_URL (not a secret: it is built into the app).
// Development: your laptop's Wi-Fi address while `pnpm dev` runs, e.g. http://192.168.1.20:3000
const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "");

export const API_URL = fromEnv || "http://localhost:3000";
