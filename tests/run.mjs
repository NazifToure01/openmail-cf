#!/usr/bin/env node
/**
 * Tests de bout en bout : `npm test`
 *
 * Démarre un serveur factice (IA, API Cloudflare, Worker de réception), applique les migrations
 * sur une base D1 locale temporaire, lance `next dev` sur un port libre puis exécute tests/*.test.mjs.
 * Aucune donnée de développement ni service réel n'est utilisé.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startMockServer } from "./mock-server.mjs";

const freePort = () =>
  new Promise((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

const state = mkdtempSync(join(tmpdir(), "openmail-test-"));
const inboxSecret = "test-inbox-secret-0123456789";
process.env.MOCK_INBOX_SECRET = inboxSecret;
const mock = await startMockServer();
const mockUrl = `http://127.0.0.1:${mock.address().port}`;
const port = await freePort();
const base = `http://127.0.0.1:${port}`;

// Variables du .env de développement neutralisées : `next dev` le lit aussi, et les tests ne doivent
// jamais utiliser de vrais tokens ni joindre un vrai service (une valeur déjà définie n'est pas remplacée)
const NEUTRALIZED = [
  "CLOUDFLARE_RUNTIME_TOKEN",
  "CLOUDFLARE_ANALYTICS_TOKEN",
  "CLOUDFLARE_ROUTING_TOKEN",
  "BRAND_ASSETS_URL",
  "AI_GATEWAY_ID",
  "AI_AUTO_DAILY_LIMIT",
  "APP_HOSTNAME",
];

const env = {
  ...process.env,
  ...Object.fromEntries(NEUTRALIZED.map((k) => [k, ""])),
  OPENMAIL_STATE_DIR: state,
  NEXT_TELEMETRY_DISABLED: "1",
  MAIL_DOMAIN: "example.com",
  CLOUDFLARE_ZONE_ID: "",
  APP_PASSWORD: "installation-test-123",
  SESSION_SECRET: "test-session-secret-0123456789abcdef0123456789",
  CLOUDFLARE_API_TOKEN: "test-cloudflare-token",
  CLOUDFLARE_ACCOUNT_ID: "test-account",
  CLOUDFLARE_API_BASE: `${mockUrl}/client/v4`,
  INBOX_WORKER_URL: `${mockUrl}/inbox`,
  INBOX_SECRET: inboxSecret,
  PUBLIC_APP_URL: base,
  AI_PROVIDER: "openai-compatible",
  AI_BASE_URL: `${mockUrl}/v1`,
  AI_API_KEY: "test-ai-key",
  AI_MODEL: "mock-chat",
  AI_EMBEDDING_MODEL: "mock-embed",
};

let next;
const cleanup = () => {
  next?.kill("SIGTERM");
  mock.close();
  rmSync(state, { recursive: true, force: true });
};
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

const migrate = spawnSync("npx", ["wrangler", "d1", "migrations", "apply", "openmail-cf", "--local", "--persist-to", state], {
  env: { ...env, CI: "1" },
  encoding: "utf8",
});
if (migrate.status !== 0) {
  console.error(migrate.stdout, migrate.stderr);
  cleanup();
  process.exit(1);
}

let output = "";
next = spawn("npx", ["next", "dev", "-p", String(port), "-H", "127.0.0.1"], { env, stdio: ["ignore", "pipe", "pipe"] });
next.stdout.on("data", (d) => (output += d));
next.stderr.on("data", (d) => (output += d));

let ready = false;
for (let i = 0; i < 120 && !ready; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  ready = await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false);
}
if (!ready) {
  console.error("Le serveur de test n'a pas démarré :\n" + output.slice(-4000));
  cleanup();
  process.exit(1);
}

const files = readdirSync("tests").filter((f) => f.endsWith(".test.mjs")).sort().map((f) => join("tests", f));
// Processus séparé, sans bloquer celui-ci : le serveur factice doit continuer à répondre
const status = await new Promise((resolve) =>
  spawn(process.execPath, ["--test", "--test-concurrency=1", ...files], {
    env: { ...env, TEST_BASE_URL: base, TEST_MOCK_URL: mockUrl },
    stdio: "inherit",
  }).on("exit", (code) => resolve(code ?? 1)),
);
if (status !== 0 && process.env.TEST_SERVER_LOG) console.error(output.slice(-8000));
cleanup();
process.exit(status);
