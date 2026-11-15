// The ONE place the product name lives. Change brand.json to rebrand the web and mobile apps.
import brandJson from "./brand.json";

export type Brand = {
  name: string;
  tagline: string;
  /** Shown in footers: who is legally behind the brand. */
  legalLine: string;
  /** The main website domain, without https:// (e.g. for links and emails). */
  domain: string;
  supportEmail: string;
};

export const brand: Brand = brandJson;
