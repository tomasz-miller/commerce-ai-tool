import { readFileSync } from "node:fs";
import { constructorParametersDownlevelTransform } from "@angular/compiler-cli/private/tooling";
import ts from "typescript";
import type { Plugin } from "vite";

/**
 * TEST-ONLY: never imported by the library, and not part of the published package.
 *
 * It uses `@angular/compiler-cli/private/tooling`, a private entry point that the Angular CLI
 * shares with itself (its signature can change in any Angular release). If a compiler-cli update
 * breaks it, `constructorParametersDownlevelTransform` is the one symbol to re-check.
 *
 * Vitest has no Angular compiler, so components run through the JIT. The JIT needs the same two
 * source transforms the Angular CLI applies for unit tests: decorators and constructor metadata
 * downleveled, and `input()` / `output()` / `model()` / queries turned into the decorator metadata
 * the runtime reads. `templateUrl` is inlined from disk (the JIT would otherwise fetch it).
 */
const options: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  experimentalDecorators: true,
  useDefineForClassFields: false,
  skipLibCheck: true,
  types: [],
  inlineSourceMap: true,
  inlineSources: true,
  noEmitOnError: false,
};

const baseHost = ts.createCompilerHost(options, true);
const sourceFiles = new Map<string, ts.SourceFile>();

const NEEDS_TRANSFORM = /@(Component|Directive|Injectable|Pipe|NgModule)\(|\b(input|output|model|viewChild|viewChildren|contentChild|contentChildren)(\.required)?\(/;

function inlineTemplates(code: string, id: string): string {
  return code.replace(/templateUrl:\s*(["'])([^"']+)\1/g, (_match, _quote, url: string) => {
    const file = new URL(url, `file://${id}`);
    return `template: ${JSON.stringify(readFileSync(file, "utf8"))}`;
  });
}

export function angularJit(): Plugin {
  return {
    name: "commerce-ai-angular-jit",
    enforce: "pre",
    transform(source, id) {
      const path = id.split("?")[0]!;
      if (!path.endsWith(".ts") || path.includes("/node_modules/") || path.endsWith(".test.ts")) {
        return null;
      }
      if (!NEEDS_TRANSFORM.test(source)) {
        return null;
      }
      const code = inlineTemplates(source, path);

      const host: ts.CompilerHost = {
        ...baseHost,
        getSourceFile(fileName, languageVersion, onError, shouldCreate) {
          if (fileName === path) {
            return ts.createSourceFile(fileName, code, languageVersion, true);
          }
          let cached = sourceFiles.get(fileName);
          if (!cached) {
            cached = baseHost.getSourceFile(fileName, languageVersion, onError, shouldCreate);
            if (cached) sourceFiles.set(fileName, cached);
          }
          return cached;
        },
        fileExists: (fileName) => fileName === path || baseHost.fileExists(fileName),
      };
      const program = ts.createProgram([path], options, host);
      const sourceFile = program.getSourceFile(path)!;
      let output = "";
      program.emit(
        sourceFile,
        (fileName, text) => {
          if (fileName.endsWith(".js")) output = text;
        },
        undefined,
        false,
        { before: [constructorParametersDownlevelTransform(program)] },
      );
      return { code: output, map: null };
    },
  };
}
