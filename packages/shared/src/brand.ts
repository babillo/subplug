// The ONE place the product name lives. Change brand.json to rebrand the web and mobile apps.
import brandJson from "./brand.json";

export type Brand = {
  name: string;
  tagline: string;
  supportEmail: string;
};

export const brand: Brand = brandJson;
