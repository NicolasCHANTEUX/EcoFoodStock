import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const nextArgs = process.argv.slice(2);

if (process.env.ECOFOODSTOCK_CLEAN_PLAYWRIGHT_NEXT_DIR === "true") {
  const distPath = path.resolve(process.cwd(), ".next");

  if (path.dirname(distPath) !== path.resolve(process.cwd())) {
    console.error("Refus de nettoyer un cache Next.js hors du projet.");
    process.exit(1);
  }

  rmSync(distPath, { force: true, recursive: true, maxRetries: 3, retryDelay: 200 });
}

if (!existsSync(nextBin)) {
  console.error("Next.js CLI introuvable. Lancez npm install puis reessayez.");
  process.exit(1);
}

const nodeArgs = [];

if (process.allowedNodeEnvironmentFlags.has("--use-system-ca")) {
  nodeArgs.push("--use-system-ca");
} else {
  console.warn(
    "Node.js ne supporte pas --use-system-ca. Si Supabase echoue avec UNABLE_TO_GET_ISSUER_CERT_LOCALLY, utilisez Node.js 24 ou configurez NODE_EXTRA_CA_CERTS."
  );
}

const child = spawn(process.execPath, [...nodeArgs, nextBin, ...nextArgs], {
  env: process.env,
  stdio: "inherit",
  windowsHide: false
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
