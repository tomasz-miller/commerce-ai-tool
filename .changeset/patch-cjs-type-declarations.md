---
"@commerce-ai-tool/core": patch
"@commerce-ai-tool/server": patch
"@commerce-ai-tool/react": patch
"@commerce-ai-tool/angular": patch
---

Correct CommonJS type declarations. The `require` condition of `@commerce-ai-tool/core`, `@commerce-ai-tool/server` and `@commerce-ai-tool/react` used to point at `.d.cts` files that were copies of the ESM declarations and re-exported ESM sibling files, so TypeScript consumers on `moduleResolution: node16`/`nodenext` importing from CommonJS got TS1479 errors with `skipLibCheck: false`. The packages now ship a real CommonJS declaration tree under `dist/cjs/` (with a nested `package.json` marking it `commonjs`) and the `require` conditions point there. Entry points, subpaths and runtime files are unchanged. The `dist/*.d.cts` files are no longer published, so a deep import of one of them (outside the `exports` map) stops resolving. `@commerce-ai-tool/react` declarations also no longer contain the side-effect import of the private `@commerce-ai-tool/styles` stylesheet, which failed to resolve with `skipLibCheck: false`. `@commerce-ai-tool/angular` has no CommonJS entry at all (see its package-format entry).
