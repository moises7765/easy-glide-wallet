// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

// Read .env from disk as a last resort: some build environments expose the
// Supabase values only in the file, not in process.env at config time.
function readEnvFile(): Record<string, string> {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    const key = match?.[1];
    const value = match?.[2];
    if (!key || value === undefined) continue;
    out[key] = value.replace(/^["']|["']$/g, "");
  }
  return out;
}

function resolvePublicSupabaseEnv() {
  const fileEnv = readEnvFile();
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = process.env[key] ?? fileEnv[key];
      if (value) return value;
    }
    return undefined;
  };

  return {
    url: pick("VITE_SUPABASE_URL", "SUPABASE_URL"),
    publishableKey: pick("VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY"),
  };
}

// The generated Supabase client reads `import.meta.env['VITE_SUPABASE_URL']`
// (computed access). Vite's `define` only rewrites dot access, and replacing
// the whole `import.meta.env` object wipes MODE/DEV/SSR and every value Vite
// injects itself. So rewrite just those two computed reads, surgically.
function inlinePublicSupabaseEnv(): Plugin {
  const KEYS = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"] as const;

  return {
    name: "lovable-inline-public-supabase-env",
    enforce: "pre",
    apply: "build",
    buildStart() {
      const { url, publishableKey } = resolvePublicSupabaseEnv();
      if (!url || !publishableKey) {
        const missing = [
          ...(url ? [] : ["SUPABASE_URL"]),
          ...(publishableKey ? [] : ["SUPABASE_PUBLISHABLE_KEY"]),
        ].join(", ");
        this.error(
          `Backend public credentials missing at build time (${missing}). ` +
            `Refusing to build a bundle that would crash at runtime.`,
        );
      }
    },
    transform(code) {
      if (!code.includes("import.meta.env")) return null;
      const { url, publishableKey } = resolvePublicSupabaseEnv();
      const values: Record<string, string | undefined> = {
        VITE_SUPABASE_URL: url,
        VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      };

      let out = code;
      for (const key of KEYS) {
        const value = values[key];
        if (!value) continue;
        out = out
          .replaceAll(`import.meta.env['${key}']`, JSON.stringify(value))
          .replaceAll(`import.meta.env["${key}"]`, JSON.stringify(value))
          .replaceAll(`import.meta.env.${key}`, JSON.stringify(value));
      }
      return out === code ? null : { code: out, map: null };
    },
  };
}

export default defineConfig({
  vite: {
    plugins: [inlinePublicSupabaseEnv()],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
