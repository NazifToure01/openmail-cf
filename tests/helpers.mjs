import assert from "node:assert/strict";

export const BASE = process.env.TEST_BASE_URL;
export const MOCK = process.env.TEST_MOCK_URL;
export const ADMIN = { email: "admin@example.com", password: "motdepasse-123", name: "Admin" };

/** Client HTTP avec cookie de session */
export class Client {
  cookie = "";
  async request(method, path, body, { form = false, headers = {} } = {}) {
    let payload;
    const h = { ...headers, ...(this.cookie ? { Cookie: this.cookie } : {}) };
    if (form) {
      payload = new FormData();
      for (const [k, v] of Object.entries(body)) payload.set(k, v);
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      h["Content-Type"] = "application/json";
    }
    const res = await fetch(BASE + path, { method, headers: h, body: payload, redirect: "manual" });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const type = res.headers.get("content-type") ?? "";
    const data = type.includes("json") ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  }
  get = (p, o) => this.request("GET", p, undefined, o);
  post = (p, b, o) => this.request("POST", p, b, o);
  put = (p, b, o) => this.request("PUT", p, b, o);
  patch = (p, b, o) => this.request("PATCH", p, b, o);
  del = (p, b, o) => this.request("DELETE", p, b, o);

  async login(email, password) {
    const r = await this.post("/api/auth/login", { email, password });
    assert.equal(r.status, 200, `connexion de ${email} : ${JSON.stringify(r.data)}`);
    return this;
  }
}

/** Crée le compte administrateur s'il n'existe pas encore, puis se connecte */
export async function admin() {
  const c = new Client();
  const setup = await c.get("/api/auth/setup");
  if (setup.data.needsSetup) {
    const r = await c.post("/api/auth/setup", { setupPassword: "installation-test-123", ...ADMIN }, { form: true });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  return c.login(ADMIN.email, ADMIN.password);
}

export const mockLog = () => fetch(`${MOCK}/__log`).then((r) => r.json());

/** Dépose un e-mail dans le Worker de réception factice */
export const deliver = (mail) =>
  fetch(`${MOCK}/__inbox`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mail) }).then((r) => r.json());

/** Déclenche l'import (comme le Worker de réception) */
export const inboxHook = () =>
  fetch(`${BASE}/api/inbox/hook`, { method: "POST", headers: { Authorization: `Bearer ${process.env.INBOX_SECRET}` } }).then((r) => r.json());

/** Attend qu'une condition asynchrone soit vraie */
export async function waitFor(fn, { timeout = 20000, interval = 250, label = "condition" } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Délai dépassé : ${label}`);
}
