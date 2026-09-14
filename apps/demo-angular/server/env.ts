import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

export function resolveDemoAppRoot(fromHref = import.meta.url): string {
  return resolve(dirname(fileURLToPath(fromHref)), "..");
}

export function demoEnvFilePaths(appRoot: string): {
  env: string;
  envLocal: string;
  nextEnvLocal: string;
} {
  return {
    env: resolve(appRoot, ".env"),
    envLocal: resolve(appRoot, ".env.local"),
    nextEnvLocal: resolve(appRoot, "../demo-next/.env.local"),
  };
}

export function loadDemoEnv(
  env: NodeJS.ProcessEnv = process.env,
  appRoot = resolveDemoAppRoot(),
): { loadedFrom: string[] } {
  const files = demoEnvFilePaths(appRoot);
  const loadedFrom: string[] = [];

  if (existsSync(files.env)) {
    config({ path: files.env });
    loadedFrom.push(files.env);
  }

  if (existsSync(files.envLocal)) {
    config({ path: files.envLocal, override: true });
    loadedFrom.push(files.envLocal);
  }

  if (!env.CTP_PROJECT_KEY && existsSync(files.nextEnvLocal)) {
    config({ path: files.nextEnvLocal });
    loadedFrom.push(files.nextEnvLocal);
  }

  return { loadedFrom };
}
