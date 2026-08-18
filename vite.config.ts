// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const fileEnv = readEnvFile();

// Lovable Cloud exposes both runtime SUPABASE_* names and Vite's public
// VITE_SUPABASE_* names. During a cold preview build only the runtime names
// may be present, so explicitly bridge the two public values into the client
// bundle instead of letting /auth fail at runtime.
const supabaseUrl =
  process.env["VITE_SUPABASE_URL"] ??
  process.env["SUPABASE_URL"] ??
  fileEnv["VITE_SUPABASE_URL"] ??
  fileEnv["SUPABASE_URL"];
const supabasePublishableKey =
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
  process.env["SUPABASE_PUBLISHABLE_KEY"] ??
  fileEnv["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
  fileEnv["SUPABASE_PUBLISHABLE_KEY"];

const supabaseClientDefine: Record<string, string> = {};
if (supabaseUrl) {
  supabaseClientDefine["import.meta.env.VITE_SUPABASE_URL"] = JSON.stringify(supabaseUrl);
}
if (supabasePublishableKey) {
  supabaseClientDefine["import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY"] =
    JSON.stringify(supabasePublishableKey);
}

export default defineConfig({
  vite: {
    define: supabaseClientDefine,
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
