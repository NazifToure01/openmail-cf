import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ADMIN, BASE, Client, admin, mockLog } from "./helpers.mjs";

/** Fonctions de base : installation, comptes, adresses, brouillons, envoi, corbeille, apparence */

const LOGO = readFileSync(new URL("../worker/public/brand/logo.png", import.meta.url));
const SETUP = { setupPassword: "installation-test-123", email: ADMIN.email, password: ADMIN.password };

test("santé : base D1 joignable", async () => {
  const r = await new Client().get("/api/health");
  assert.equal(r.data.ok, true);
});

test("installation : contrôles puis création de l'administrateur avec nom et logo", async () => {
  const c = new Client();
  assert.equal((await c.get("/api/auth/setup")).data.needsSetup, true);
  assert.equal((await c.post("/api/auth/setup", { ...SETUP, setupPassword: "mauvais" }, { form: true })).status, 401);
  assert.equal((await c.post("/api/auth/setup", { ...SETUP, appName: "x".repeat(41) }, { form: true })).status, 400);
  const svg = new Blob(["<svg xmlns='http://www.w3.org/2000/svg'/>"], { type: "image/svg+xml" });
  assert.equal((await c.post("/api/auth/setup", { ...SETUP, logo: svg }, { form: true })).status, 400);
  assert.equal((await c.get("/api/auth/setup")).data.needsSetup, true, "un échec ne crée pas de compte");

  const ok = await c.post("/api/auth/setup", { ...SETUP, name: ADMIN.name, appName: "Acme Mail", logo: new Blob([LOGO], { type: "image/png" }) }, { form: true });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await c.post("/api/auth/setup", { ...SETUP, email: "x@example.com" }, { form: true })).status, 409);
});

test("apparence : titre, favicon versionné, modification réservée aux administrateurs", async () => {
  const html = await (await fetch(`${BASE}/login`)).text();
  assert.match(html, /<title>Acme Mail<\/title>/);
  const icon = html.match(/rel="icon" href="([^"]+)"/)?.[1];
  assert.match(icon ?? "", /^\/brand\/icon\.png\?v=/);
  const res = await fetch(BASE + icon.replaceAll("&amp;", "&"));
  assert.equal(res.headers.get("content-type"), "image/png");

  const a = await admin();
  const r = await a.put("/api/branding", { name: "Beta Mail", removeLogo: "true" }, { form: true });
  assert.deepEqual(r.data, { name: "Beta Mail", logoVersion: null });
  const fallback = await fetch(`${BASE}/brand/icon.png`, { redirect: "manual" });
  assert.equal(fallback.status, 307);
  assert.equal((await a.put("/api/branding", { name: "" }, { form: true })).status, 400);
});

test("session : connexion, profil sans hash, accès refusé sans session", async () => {
  const a = await admin();
  const me = await a.get("/api/auth/me");
  assert.equal(me.data.user.email, ADMIN.email);
  assert.equal(me.data.user.passwordHash, undefined);
  assert.equal((await new Client().get("/api/messages")).status, 401);
  const cfg = await a.get("/api/config");
  assert.equal(cfg.data.domain, "example.com");
});

test("adresses d'envoi : création, doublon, adresse par défaut unique", async () => {
  const a = await admin();
  const r = await a.post("/api/identities", { address: "contact@example.com", name: "Contact" });
  assert.equal(r.data.identity?.isDefault, true, JSON.stringify(r.data));
  assert.equal((await a.post("/api/identities", { address: "contact@example.com", name: "Doublon" })).status, 409);
  await a.post("/api/identities", { address: "compta@example.com", name: "Compta" });
  const list = (await a.get("/api/identities")).data.identities;
  assert.equal(list.length, 2);
  assert.equal(list.filter((i) => i.isDefault).length, 1);
  assert.equal((await a.post("/api/identities", { address: "x@autre.org" })).status, 400);
});

test("brouillons : corps volumineux découpé puis relu, mise à jour", async () => {
  const a = await admin();
  const big = "<p>" + "é".repeat(1_200_000) + "</p>";
  const draft = { from: { address: "contact@example.com" }, to: [{ address: "bob@test.org" }], subject: "Brouillon", bodyHtml: "<p>Bonjour</p>", quotedHtml: big };
  const r = await a.post("/api/drafts", draft);
  const id = r.data.message.id;
  assert.equal((await a.get(`/api/messages/${id}`)).data.message.quotedHtml, big);
  await a.post("/api/drafts", { ...draft, draftId: id, subject: "Brouillon v2", quotedHtml: "<p>court</p>" });
  const again = (await a.get(`/api/messages/${id}`)).data.message;
  assert.equal(again.subject, "Brouillon v2");
  assert.equal(again.quotedHtml, "<p>court</p>");
  assert.equal((await a.del(`/api/messages/${id}`)).data.ok, true);
});

test("envoi : appel de l'API Cloudflare, message dans Envoyés, contacts mémorisés", async () => {
  const a = await admin();
  const r = await a.post("/api/send", { from: { address: "contact@example.com", name: "Contact" }, to: [{ address: "bob@test.org", name: "Bob" }], subject: "Bonjour Bob", bodyHtml: "<p>Salut</p>" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const sent = (await mockLog()).filter((e) => e.type === "send").at(-1);
  assert.equal(sent.body.subject, "Bonjour Bob");
  const list = await a.get("/api/messages?folder=sent");
  assert.ok(list.data.messages.some((m) => m.subject === "Bonjour Bob"));
  assert.ok((await a.get("/api/contacts?q=bob")).data.contacts.some((c) => c.address === "bob@test.org"));
  assert.equal((await a.post("/api/send", { from: { address: "contact@example.com" }, to: [], subject: "x", bodyHtml: "<p>x</p>" })).status, 400);
});

test("corbeille : placer, restaurer, suppression définitive seulement depuis la corbeille", async () => {
  const a = await admin();
  const m = (await a.get("/api/messages?folder=sent")).data.messages[0];
  assert.equal((await a.del(`/api/messages/${m.id}`)).status, 400);
  assert.equal((await a.patch(`/api/messages/${m.id}`, { action: "trash", starred: true })).data.message.folder, "trash");
  assert.equal((await a.patch(`/api/messages/${m.id}`, { action: "restore" })).data.message.folder, "sent");
});

test("utilisateurs : création, droits, désactivation, mot de passe", async () => {
  const a = await admin();
  const r = await a.post("/api/users", { email: "temp@example.com", name: "Temp", password: "motdepasse-456", role: "member", access: [{ domain: "example.com", mailboxes: "*" }] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await a.post("/api/users", { email: "temp@example.com", password: "motdepasse-456" })).status, 409);
  assert.ok((await a.get("/api/users")).data.users.every((u) => !u.passwordHash));

  const t = await new Client().login("temp@example.com", "motdepasse-456");
  assert.equal((await t.get("/api/users")).status, 403, "réservé aux administrateurs");
  const changed = await t.patch("/api/auth/me", { currentPassword: "motdepasse-456", newPassword: "nouveau-mdp-789" });
  assert.equal(changed.data.reauth, true);
  assert.equal((await t.get("/api/auth/me")).status, 401, "ancienne session révoquée");

  assert.equal((await a.patch("/api/users/temp@example.com", { disabled: true })).data.user.disabled, true);
  assert.equal((await new Client().post("/api/auth/login", { email: "temp@example.com", password: "nouveau-mdp-789" })).status, 401);
  assert.equal((await a.del("/api/users/temp@example.com")).data.ok, true);
});
