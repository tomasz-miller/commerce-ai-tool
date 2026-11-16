---
"@commerce-ai-tool/angular": minor
---

`@commerce-ai-tool/angular` is now a real Angular Package Format library. It is built with ng-packagr in partial compilation mode (Angular 20.3 compiler), so the published components carry Ivy declarations (`ɵɵngDeclareComponent`, `ɵɵComponentDeclaration`) and AOT hosts link them against their own Angular version. Previous releases shipped an esbuild bundle with raw, un-compiled decorators that AOT applications could not use. Typings now carry the accepted type of the `messages` input on the cart panel and mission results, so strict templates can bind `CommerceAISearchMessages`.

Migration: the peer range for `@angular/core`, `@angular/common` and `@angular/forms` is now `^20.3.0 || ^21.0.0 || ^22.0.0` (was `>=17`); hosts on Angular 19 or older, or on 20.0 to 20.2, must upgrade. The package is ESM only (the CommonJS entry is gone, Angular CLI builds do not use it), exposes a single entry `@commerce-ai-tool/angular` through the generated `exports` map, and `@commerce-ai-tool/angular/styles.css` keeps working (same stylesheet content). `@commerce-ai-tool/core` is now a regular dependency of the Angular package (previously its client entry was inlined); the library imports only `@commerce-ai-tool/core/client`.
