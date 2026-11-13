import { base } from "@repo/config-eslint/base";

export default [
  ...base,
  { ignores: ["dist/**", "web-build/**", ".expo/**", "ios/**", "android/**", "expo-env.d.ts"] },
  {
    // React Native loads images and assets with require("./file.png"); that is expected here.
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];
