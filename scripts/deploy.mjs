#!/usr/bin/env node
/**
 * Déploiement complet d'OpenMail CF sur Cloudflare, à partir du seul fichier .env :
 *
 *  1. vérifie la configuration et le token Cloudflare ;
 *  2. retrouve le compte, la zone du domaine et le sous-domaine workers.dev ;
 *  3. crée si besoin l'espace KV (réception), le bucket R2 (pièces jointes) et la base D1,
 *     puis applique les migrations SQL du dossier migrations/ ;
 *  4. déploie le Worker de réception (dossier worker/) avec son secret INBOX_SECRET ;
 *  5. compile l'app Next.js (OpenNext) et la déploie sur https://<APP_HOSTNAME> avec ses secrets.
 *
 * Usage : npm run deploy              (tout)
 *         npm run deploy -- --inbox   (Worker de réception seulement)
 *         npm run deploy -- --app     (application seulement)
 *
 * Relançable sans risque : les ressources existantes sont réutilisées, INBOX_SECRET est conservé
 * dans .deploy/state.json (non versionné).
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const API = process.env.CLOUDFLARE_API_BASE || "https://api.cloudflare.com/client/v4";
const COMPATIBILITY_DATE = "2026-09-01";

const args = new Set(process.argv.slice(2));
const onlyInbox = args.has("--inbox");
const onlyApp = args.has("--app");

/* ---------- Affichage ---------- */

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const step = (s) => console.log(`\n${bold("▸ " + s)}`);
const ok = (s) => console.log(`  ${green("✓")} ${s}`);
const warn = (s) => console.log(`  ${yellow("!")} ${s}`);
const warnings = [];
const later = (s) => {
  warnings.push(s);
  warn(s);
};

class SetupError extends Error {}
const fail = (s) => {
  throw new SetupError(s);
};

/* ---------- Configuration (.env) ---------- */

if (existsSync(".env")) process.loadEnvFile(".env");
const env = process.env;

const required = {
  CLOUDFLARE_API_TOKEN: "token API Cloudflare (voir README, section « Créer le token »)",
  MAIL_DOMAIN: "domaine de l'instance, ex. example.com",
  APP_PASSWORD: "mot de passe d'installation, demandé pour créer le premier compte",
  SESSION_SECRET: "clé de signature des sessions : openssl rand -hex 32",
};

function readConfig() {
  const missing = Object.keys(required).filter((k) => !env[k]?.trim());
  if (missing.length) {
    fail(
      `Variables manquantes dans .env (copiez .env.example) :\n` +
        missing.map((k) => `    ${k} — ${required[k]}`).join("\n"),
    );
  }
  if (env.SESSION_SECRET.length < 32) fail("SESSION_SECRET doit faire au moins 32 caractères (openssl rand -hex 32)");
  if (env.APP_PASSWORD.length < 10 || /^change/i.test(env.APP_PASSWORD)) {
    fail("APP_PASSWORD est trop faible : choisissez au moins 10 caractères (il protège la création du compte admin)");
  }

  const domain = env.MAIL_DOMAIN.trim().toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
    fail("MAIL_DOMAIN : un seul domaine, ex. example.com (pour un autre domaine, déployez une autre instance avec un PROJECT_NAME différent)");
  }
  const project = (env.PROJECT_NAME || "openmail-cf").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,40}[a-z0-9]$/.test(project)) fail("PROJECT_NAME : lettres minuscules, chiffres et tirets uniquement");

  return {
    token: env.CLOUDFLARE_API_TOKEN.trim(),
    domain,
    project,
    appName: project,
    inboxName: `${project}-inbox`,
    bucket: `${project}-files`,
    kvTitle: `${project}-inbox`,
    hostname: (env.APP_HOSTNAME || `mail.${domain}`).trim().toLowerCase(),
    database: project,
    forwardTo: env.FORWARD_TO?.trim() || "",
    catchAll: /^(1|true|yes|oui)$/i.test(env.CATCH_ALL ?? ""),
  };
}

/* ---------- API Cloudflare ---------- */

async function cf(path, { method = "GET", body, allow = [] } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (allow.includes(res.status)) return { status: res.status, result: json?.result ?? null, errors: json?.errors ?? [] };
  if (!res.ok || !json?.success) {
    const details = json?.errors?.map((e) => `${e.message} (code ${e.code})`).join(" ; ") || `HTTP ${res.status}`;
    const error = new Error(`${method} ${path} : ${details}`);
    error.status = res.status;
    throw error;
  }
  return { status: res.status, result: json.result, errors: [] };
}

const denied = (err, permission) =>
  err.status === 403 || err.status === 401
    ? `${err.message}\n    → Le token n'a probablement pas la permission « ${permission} ».`
    : err.message;

async function findAccount() {
  if (env.CLOUDFLARE_ACCOUNT_ID) return env.CLOUDFLARE_ACCOUNT_ID.trim();
  let accounts;
  try {
    ({ result: accounts } = await cf("/accounts?per_page=50"));
  } catch (err) {
    fail(`Token refusé par Cloudflare : ${err.message}\n    → Vérifiez CLOUDFLARE_API_TOKEN (copié en entier, non expiré).`);
  }
  if (!accounts?.length) fail("Aucun compte Cloudflare accessible avec ce token. Renseignez CLOUDFLARE_ACCOUNT_ID dans .env.");
  if (accounts.length > 1) {
    fail(
      "Ce token donne accès à plusieurs comptes : précisez CLOUDFLARE_ACCOUNT_ID dans .env :\n" +
        accounts.map((a) => `    ${a.id}  ${a.name}`).join("\n"),
    );
  }
  return accounts[0].id;
}

async function findZone(accountId, domain) {
  let zones;
  try {
    ({ result: zones } = await cf(`/zones?name=${encodeURIComponent(domain)}&account.id=${accountId}`));
  } catch (err) {
    fail(denied(err, "Zone : Zone : Read"));
  }
  const zone = zones?.[0];
  if (!zone) {
    fail(
      `Le domaine ${domain} est introuvable sur ce compte.\n` +
        `    → Ajoutez-le à Cloudflare (zone active, serveurs DNS Cloudflare) et incluez-le dans les « Zone Resources » du token.`,
    );
  }
  if (zone.status !== "active") later(`${domain} : zone « ${zone.status} » (pas encore active) — le déploiement du domaine personnalisé peut échouer.`);
  return zone.id;
}

async function checkEmailServices(domain, zoneId) {
  const sending = await cf(`/zones/${zoneId}/email/sending/subdomains`, { allow: [400, 401, 403, 404] }).catch(() => null);
  if (sending?.status === 200 && sending.result?.some((s) => s.enabled && s.name === domain)) ok(`${domain} : Email Sending activé`);
  else later(`${domain} : Email Sending ne semble pas activé. Dashboard → Email Service → Email Sending → Onboard domain.`);

  const routing = await cf(`/zones/${zoneId}/email/routing`, { allow: [400, 401, 403, 404] }).catch(() => null);
  if (routing?.status === 200 && routing.result?.enabled) ok(`${domain} : Email Routing activé`);
  else later(`${domain} : Email Routing ne semble pas activé (réception impossible). Dashboard → ${domain} → Email → Email Routing → Enable.`);
}

async function workersSubdomain(accountId) {
  try {
    const { result } = await cf(`/accounts/${accountId}/workers/subdomain`);
    if (result?.subdomain) return result.subdomain;
  } catch (err) {
    if (err.status === 403) fail(denied(err, "Account : Workers Scripts : Edit"));
  }
  fail(
    "Aucun sous-domaine workers.dev sur ce compte.\n" +
      "    → Dashboard → Workers & Pages : ouvrez la page une fois pour choisir votre sous-domaine <nom>.workers.dev, puis relancez.",
  );
}

async function ensureKv(accountId) {
  try {
    for (let page = 1; ; page++) {
      const { result } = await cf(`/accounts/${accountId}/storage/kv/namespaces?per_page=100&page=${page}`);
      const found = result.find((ns) => ns.title === config.kvTitle);
      if (found) return found.id;
      if (result.length < 100) break;
    }
    const { result } = await cf(`/accounts/${accountId}/storage/kv/namespaces`, { method: "POST", body: { title: config.kvTitle } });
    ok(`Espace KV « ${config.kvTitle} » créé`);
    return result.id;
  } catch (err) {
    fail(denied(err, "Account : Workers KV Storage : Edit"));
  }
}

async function ensureBucket(accountId) {
  try {
    const existing = await cf(`/accounts/${accountId}/r2/buckets/${config.bucket}`, { allow: [404] });
    if (existing.status === 404) {
      await cf(`/accounts/${accountId}/r2/buckets`, { method: "POST", body: { name: config.bucket } });
      ok(`Bucket R2 « ${config.bucket} » créé`);
    }
  } catch (err) {
    const hint = /10042|not enabled|enable r2/i.test(err.message)
      ? "\n    → Activez R2 une première fois dans le dashboard (R2 Object Storage → Purchase / Enable, l'offre gratuite suffit)."
      : "";
    fail(denied(err, "Account : Workers R2 Storage : Edit") + hint);
  }
}

async function ensureDatabase(accountId) {
  try {
    const { result } = await cf(`/accounts/${accountId}/d1/database?name=${encodeURIComponent(config.database)}`);
    const found = result?.find((d) => d.name === config.database);
    if (found) return found.uuid;
    const { result: created } = await cf(`/accounts/${accountId}/d1/database`, { method: "POST", body: { name: config.database } });
    ok(`Base D1 « ${config.database} » créée`);
    return created.uuid;
  } catch (err) {
    fail(denied(err, "Account : D1 : Edit"));
  }
}

async function ensureCatchAll(zoneId, domain) {
  try {
    await cf(`/zones/${zoneId}/email/routing/rules/catch_all`, {
      method: "PUT",
      body: {
        enabled: true,
        matchers: [{ type: "all" }],
        actions: [{ type: "worker", value: [config.inboxName] }],
      },
    });
    ok(`${domain} : adresse « catch-all » dirigée vers ${config.inboxName}`);
  } catch (err) {
    later(`${domain} : catch-all non configuré (${denied(err, "Zone : Email Routing Rules : Edit")})`);
  }
}

/* ---------- État local et commandes ---------- */

function loadState() {
  mkdirSync(".deploy", { recursive: true });
  const file = ".deploy/state.json";
  const state = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  state.inboxSecret ||= env.INBOX_SECRET || randomBytes(32).toString("hex");
  writeFileSync(file, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  return state;
}

function run(command, commandArgs, extraEnv = {}) {
  console.log(`  $ ${command} ${commandArgs.join(" ")}`);
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) fail(`La commande « ${command} ${commandArgs[0]} » a échoué (code ${result.status}).`);
}

/** Secrets passés à wrangler par un fichier temporaire (jamais en argument ni dans le bundle) */
function withSecretsFile(secrets, fn) {
  const dir = mkdtempSync(join(tmpdir(), "openmail-"));
  const file = join(dir, "secrets.json");
  const clean = Object.fromEntries(Object.entries(secrets).filter(([, v]) => v));
  writeFileSync(file, JSON.stringify(clean), { mode: 0o600 });
  try {
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ---------- Déploiement ---------- */

let config;

async function main() {
  console.log(bold("OpenMail CF — déploiement sur Cloudflare"));
  config = readConfig();

  step("Compte et domaine");
  const accountId = await findAccount();
  ok(`Compte ${accountId}`);
  const zoneId = await findZone(accountId, config.domain);
  ok(`${config.domain} → zone ${zoneId}`);
  await checkEmailServices(config.domain, zoneId);
  const subdomain = await workersSubdomain(accountId);
  const inboxUrl = `https://${config.inboxName}.${subdomain}.workers.dev`;
  const appUrl = `https://${config.hostname}`;
  ok(`Application : ${appUrl}`);
  ok(`Réception : ${inboxUrl}`);

  const state = loadState();
  const wranglerEnv = { CLOUDFLARE_API_TOKEN: config.token, CLOUDFLARE_ACCOUNT_ID: accountId };

  if (!onlyApp) {
    step("Worker de réception");
    const kvId = await ensureKv(accountId);
    ok(`Espace KV ${kvId}`);
    writeFileSync(
      "worker/wrangler.deploy.json",
      JSON.stringify(
        {
          name: config.inboxName,
          main: "src/index.ts",
          compatibility_date: COMPATIBILITY_DATE,
          workers_dev: true,
          preview_urls: false,
          assets: { directory: "./public" },
          kv_namespaces: [{ binding: "INBOX", id: kvId }],
          vars: { APP_HOOK_URL: `${appUrl}/api/inbox/hook`, ...(config.forwardTo ? { FORWARD_TO: config.forwardTo } : {}) },
          observability: { enabled: true },
        },
        null,
        2,
      ) + "\n",
    );
    withSecretsFile({ INBOX_SECRET: state.inboxSecret }, (file) =>
      run("npx", ["wrangler", "deploy", "--config", "worker/wrangler.deploy.json", "--secrets-file", file], wranglerEnv),
    );
    ok(`${config.inboxName} déployé`);
    if (config.catchAll) await ensureCatchAll(zoneId, config.domain);
  }

  if (!onlyInbox) {
    step("Application web");
    await ensureBucket(accountId);
    ok(`Bucket R2 ${config.bucket}`);
    const databaseId = await ensureDatabase(accountId);
    ok(`Base D1 ${config.database} (${databaseId})`);
    const wranglerConfig = {
      $schema: "node_modules/wrangler/config-schema.json",
      name: config.appName,
      main: ".open-next/worker.js",
      compatibility_date: COMPATIBILITY_DATE,
      compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
      assets: { directory: ".open-next/assets", binding: "ASSETS" },
      services: [{ binding: "WORKER_SELF_REFERENCE", service: config.appName }],
      r2_buckets: [{ binding: "FILES", bucket_name: config.bucket }],
      d1_databases: [{ binding: "DB", database_name: config.database, database_id: databaseId, migrations_dir: "migrations" }],
      images: { binding: "IMAGES" },
      observability: { enabled: true },
      // Cloudflare crée l'enregistrement DNS et le certificat de ce sous-domaine
      routes: [{ pattern: config.hostname, custom_domain: true }],
      vars: {
        PUBLIC_APP_URL: appUrl,
        MAIL_DOMAIN: config.domain,
        CLOUDFLARE_ZONE_ID: zoneId,
        CLOUDFLARE_ACCOUNT_ID: accountId,
        INBOX_WORKER_URL: inboxUrl,
        INBOX_WORKER_NAME: config.inboxName,
        ...(env.BRAND_ASSETS_URL ? { BRAND_ASSETS_URL: env.BRAND_ASSETS_URL } : {}),
      },
    };
    writeFileSync("wrangler.deploy.jsonc", JSON.stringify(wranglerConfig, null, 2) + "\n");

    // Tables et index (seules les migrations pas encore appliquées sont exécutées) ; CI=1 évite la confirmation
    run("npx", ["wrangler", "d1", "migrations", "apply", config.database, "--remote", "--config", "wrangler.deploy.jsonc"], {
      ...wranglerEnv,
      CI: "1",
    });
    ok("Schéma de la base à jour");

    run("npx", ["opennextjs-cloudflare", "build", "--config", "wrangler.deploy.jsonc"], wranglerEnv);
    // OpenNext recopie le contenu de .env dans le bundle : on le vide, tout passe par les secrets ci-dessous
    writeFileSync(".open-next/cloudflare/next-env.mjs", "export const production = {};\nexport const development = {};\nexport const test = {};\n");

    const secrets = {
      // Token d'exécution : plus restreint que celui du déploiement si CLOUDFLARE_RUNTIME_TOKEN est fourni
      CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_RUNTIME_TOKEN || config.token,
      CLOUDFLARE_ANALYTICS_TOKEN: env.CLOUDFLARE_ANALYTICS_TOKEN,
      CLOUDFLARE_ROUTING_TOKEN: env.CLOUDFLARE_ROUTING_TOKEN,
      APP_PASSWORD: env.APP_PASSWORD,
      SESSION_SECRET: env.SESSION_SECRET,
      INBOX_SECRET: state.inboxSecret,
    };
    withSecretsFile(secrets, (file) =>
      run("npx", ["opennextjs-cloudflare", "deploy", "--config", "wrangler.deploy.jsonc", "--secrets-file", file], wranglerEnv),
    );
    ok(`${config.appName} déployé`);
  }

  console.log(`\n${green(bold("Déploiement terminé."))}`);
  if (!onlyInbox) {
    console.log(`\n  1. Ouvrez ${bold(`${appUrl}/setup`)} (le certificat peut prendre quelques minutes la première fois).`);
    console.log(`  2. Saisissez APP_PASSWORD puis créez le compte administrateur.`);
    console.log(`  3. Réglages → Adresses : ajoutez vos adresses (ex. contact@${config.domain}) ; la règle de réception est créée automatiquement.`);
  }
  if (warnings.length) {
    console.log(`\n${yellow(bold("À vérifier :"))}`);
    for (const w of warnings) console.log(`  ${yellow("!")} ${w}`);
  }
}

main().catch((err) => {
  console.error(`\n${red(bold("Erreur :"))} ${err instanceof SetupError ? err.message : err.stack || err}`);
  process.exit(1);
});
