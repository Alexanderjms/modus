import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stage = join(root, ".desktop-stage");
const standalone = join(stage, ".next", "standalone");
const args = process.argv.slice(2);
const dist = args.includes("--dist");
const publish = args.includes("--publish");

function run(command, commandArgs, cwd = root, env = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Se compila en una carpeta aparte con node_modules plano: Next copia los archivos
// trazados con enlaces simbólicos, que Windows no permite crear sin privilegios.
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const entry of ["app", "db", "public", "middleware.ts", "next.config.mjs", "tsconfig.json", "postcss.config.mjs", "tailwind.config.ts", "package.json", "pnpm-lock.yaml"]) {
  cpSync(join(root, entry), join(stage, entry), { recursive: true });
}
writeFileSync(join(stage, "pnpm-workspace.yaml"), "allowBuilds:\n  electron: false\n  electron-winstaller: false\n  unrs-resolver: false\nminimumReleaseAgeExclude:\n  - electron\n");

run("pnpm", ["install", "--frozen-lockfile", "--config.node-linker=hoisted"], stage);
run("node", [join("node_modules", "next", "dist", "bin", "next"), "build"], stage, { MODUS_DESKTOP: "1" });

if (!existsSync(join(standalone, "server.js"))) {
  console.error("Next.js no generó .next/standalone/server.js");
  process.exit(1);
}

cpSync(join(stage, ".next", "static"), join(standalone, ".next", "static"), { recursive: true });
cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });
for (const file of [join("db", "local", "schema.sql"), join("db", "cloud", "turso-worker.cjs")]) {
  mkdirSync(dirname(join(standalone, file)), { recursive: true });
  cpSync(join(root, file), join(standalone, file));
}

if (dist) run("npx", ["electron-builder", "--win", "--x64", "--publish", publish ? "always" : "never"]);
