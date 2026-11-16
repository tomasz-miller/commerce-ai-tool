import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "**/dist-server/**", "**/.angular/**", "**/.next/**", "**/node_modules/**"],
  },
  {
    // React hooks rules (rules-of-hooks, exhaustive-deps and the React Compiler
    // rules from the plugin's recommended preset). Only packages/react and
    // apps/demo-next contain React code. demo-next runs ESLint with
    // `--config ../../eslint.config.mjs`, which makes patterns relative to the
    // app directory, so it is matched by extension (`**/*.tsx`) instead of path.
    files: ["**/packages/react/**/*.{ts,tsx}", "**/*.tsx"],
    ...reactHooks.configs.flat.recommended,
  },
  // Typed linting pilot (packages/core, production sources only). The projectService
  // loads packages/core/tsconfig.json through the TypeScript 6 API alias
  // (@typescript/typescript6), so type-aware rules such as no-floating-promises
  // and no-misused-promises work. Test files are excluded for now: they report
  // ~135 unbound-method / no-unsafe-* findings from mock-heavy code.
  {
    files: ["packages/core/src/**/*.ts"],
    ignores: ["packages/core/src/**/*.test.ts"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // packages/core/src/browser ships in the browser-safe `@commerce-ai-tool/core/client` entry and
    // is shared by the React and Angular widgets: no framework, no Node built-ins, no
    // server-only core modules (AI providers, commercetools client, observability).
    files: ["packages/core/src/browser/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react/*",
                "react-dom",
                "react-dom/*",
                "@angular/*",
                "node:*",
                // Bare Node built-ins (and their subpaths, e.g. fs/promises).
                "fs",
                "fs/*",
                "path",
                "path/*",
                "crypto",
                "buffer",
                "stream",
                "stream/*",
                "os",
                "http",
                "https",
                "url",
                "util",
                "util/*",
                "child_process",
              ],
              message:
                "core/src/browser must stay framework-agnostic and browser-safe: no React, Angular or Node built-in imports.",
            },
            {
              // Relative imports of server-only core modules at any depth.
              group: [
                "**/ai/**",
                "**/observability/**",
                "**/prompts/**",
                "**/commercetools/client*",
                "**/search/orchestrator*",
                "**/search/mission*",
              ],
              message: "core/src/browser is exported from the browser-safe client entry: no server-only core modules.",
            },
          ],
        },
      ],
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
