import { FlatCompat } from "@eslint/eslintrc";
import { globalIgnores } from "eslint/config";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compat.config({
    extends: ["next/core-web-vitals", "next/typescript"],
  }),
  { files: ["scripts/**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    ".tmp/**",
    ".desktop/**",
    "src-tauri/gen/**",
    "src-tauri/target/**",
    "next-env.d.ts",
  ]),
];

export default eslintConfig;
