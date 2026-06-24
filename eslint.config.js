import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Flat config, scoped to the app source. The worker/ and scripts/ trees are
// separate runtime environments (Cloudflare Workers, Node) with their own
// globals, so they're left out to avoid false positives.
export default tseslint.config(
  { ignores: ["dist", "node_modules", "public", "skin", "worker", "scripts"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        // Compile-time constant injected by Vite's `define` (see vite.config.ts).
        __APP_VERSION__: "readonly",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // TypeScript already resolves identifiers; no-undef double-reports and
      // chokes on ambient/compile-time globals.
      "no-undef": "off",
      // Honor the `_name` convention for intentionally-unused bindings, and
      // ignore the rest-sibling omit pattern (`const { drop, ...keep } = obj`).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      // Calling hooks conditionally/out of order is a real bug — keep as error.
      "react-hooks/rules-of-hooks": "error",
      // Missing effect deps are often intentional here; surface but don't block.
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
);
