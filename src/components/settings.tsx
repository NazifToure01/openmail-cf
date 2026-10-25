"use client";

import { AtSign, Check, CircleUser, Palette, Pencil, PenLine, Sparkles, Plus, Search, Star, Trash2, UserCog, Users } from "lucide-react";
import { useState } from "react";
import { LOCAL_PART_RE, isValidEmail } from "@/lib/addresses";
import { api } from "@/lib/api";
import type { Contact, Identity, RoutingInfo, RoutingStatus, Signature } from "@/lib/types";
import { useBrandAssetsUrl } from "./brand";
import { RichEditor } from "./editor";
import { AiSettings } from "./settings-ai";
import { AppearanceSettings } from "./settings-appearance";
import { AccountSettings, UsersSettings, type AppUser } from "./settings-users";
import { Avatar, Button, Field, IconButton, Modal, cn, inputClass, useToast } from "./ui";

export type SettingsTab = "identities" | "signatures" | "contacts" | "users" | "appearance" | "ai" | "account";

export const SETTINGS_TABS: { id: SettingsTab; label: string; icon: typeof AtSign; adminOnly?: boolean }[] = [
  { id: "identities", label: "Adresses d'envoi", icon: AtSign, adminOnly: true },
  { id: "signatures", label: "Signatures", icon: PenLine },
  { id: "contacts", label: "Contacts", icon: Users },
  { id: "users", label: "Utilisateurs", icon: UserCog, adminOnly: true },
  { id: "appearance", label: "Apparence", icon: Palette, adminOnly: true },
  { id: "ai", label: "IA", icon: Sparkles, adminOnly: true },
  { id: "account", label: "Mon compte", icon: CircleUser },
];

export function Settings({
  tab,
  domain,
  identities,
  signatures,
  contacts,
  routing,
  me,
  reload,
}: {
  tab: SettingsTab;
  domain: string;
  identities: Identity[];
  signatures: Signature[];
  contacts: Contact[];
  routing: RoutingInfo | null;
  me: AppUser | null;
  reload: () => void;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-6 sm:px-8">
        {tab === "identities" && <Identities domain={domain} identities={identities} signatures={signatures} routing={routing} reload={reload} />}
        {tab === "signatures" && <Signatures domain={domain} signatures={signatures} reload={reload} />}
        {tab === "contacts" && <Contacts contacts={contacts} reload={reload} />}
        {tab === "users" && me && <UsersSettings me={me} />}
        {tab === "appearance" && me?.role === "admin" && <AppearanceSettings />}
        {tab === "ai" && me?.role === "admin" && <AiSettings onSaved={reload} />}
        {tab === "account" && me && <AccountSettings me={me} onUpdated={reload} />}
      </div>
    </div>
  );
}

function Header({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

/* ---------- Adresses d'envoi ---------- */

type RoutingResult = { result?: string; error?: string } | null;

/** Message de confirmation après une action qui touche la réception Cloudflare */
function routingMessage(address: string, routing: RoutingResult): { text: string; tone: "success" | "error" | "info" } | null {
  if (!routing) return null;
  if (routing.error) return { text: `Adresse enregistrée, mais la réception n'a pas pu être activée : ${routing.error}`, tone: "error" };
  if (routing.result === "created") return { text: `${address} peut maintenant recevoir des e-mails`, tone: "success" };
  if (routing.result === "updated") return { text: `La règle Cloudflare de ${address} envoie maintenant vers la boîte de réception`, tone: "success" };
  return null;
}

const ROUTING_BADGE: Record<RoutingStatus, { label: string; cls: string }> = {
  worker: { label: "Réception active", cls: "bg-success-soft text-success" },
  catchall: { label: "Réception (catch-all)", cls: "bg-success-soft text-success" },
  other: { label: "Reçu ailleurs, pas dans l'app", cls: "bg-warning-soft text-warning" },
  none: { label: "Ne reçoit pas", cls: "bg-surface-2 text-muted" },
};

function Identities({
  domain,
  identities,
  signatures,
  routing,
  reload,
}: {
  domain: string;
  identities: Identity[];
  signatures: Signature[];
  routing: RoutingInfo | null;
  reload: () => void;
}) {
  const [activating, setActivating] = useState<string | null>(null);
  const toast = useToast();
  const [editing, setEditing] = useState<Partial<Identity> | null>(null);
  const [saving, setSaving] = useState(false);
  const local = (editing?.address ?? "").replace(`@${domain}`, "");

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const body = { ...editing, address: `${local.trim().toLowerCase()}@${domain}` };
      const res = await api<{ routing: RoutingResult }>(editing.id ? `/api/identities/${editing.id}` : "/api/identities", {
        method: editing.id ? "PATCH" : "POST",
        json: body,
      });
      const msg = routingMessage(body.address, res.routing);
      toast(msg?.text ?? (editing.id ? "Adresse mise à jour" : "Adresse ajoutée"), msg?.tone ?? "success");
      setEditing(null);
      reload();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (i: Identity) => {
    const receiving = routing?.statuses[i.address] === "worker";
    const question = receiving
      ? `Retirer ${i.address} ?\n\nSa règle de réception Cloudflare sera supprimée : les e-mails envoyés à cette adresse ne seront plus reçus.`
      : `Retirer ${i.address} de la liste ?`;
    if (!confirm(question)) return;
    try {
      const res = await api<{ routing: RoutingResult }>(`/api/identities/${i.id}`, { method: "DELETE" });
      if (res.routing?.error) toast(`Adresse retirée, mais la règle Cloudflare n'a pas pu être supprimée : ${res.routing.error}`, "error");
      else toast(res.routing?.result === "removed" ? `${i.address} retirée, réception désactivée` : "Adresse retirée", "info");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    reload();
  };

  const activate = async (i: Identity) => {
    setActivating(i.id);
    try {
      const res = await api<{ result: string }>(`/api/identities/${i.id}/routing`, { method: "POST" });
      const msg = routingMessage(i.address, res);
      toast(msg?.text ?? "Réception déjà active", msg?.tone ?? "info");
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setActivating(null);
    }
  };

  const makeDefault = async (i: Identity) => {
    await api(`/api/identities/${i.id}`, { method: "PATCH", json: { ...i, isDefault: true } }).catch((e: Error) => toast(e.message, "error"));
    reload();
  };

  return (
    <>
      <Header
        title="Adresses d'envoi"
        description={`Chaque adresse @${domain} ajoutée ici peut envoyer et recevoir : sa règle de réception est créée automatiquement chez Cloudflare. Vous pouvez aussi écrire depuis n'importe quelle autre adresse @${domain}.`}
        action={
          <Button variant="primary" onClick={() => setEditing({ address: "", name: "", signatureId: null, isDefault: identities.length === 0 })}>
            <Plus size={15} /> Ajouter
          </Button>
        }
      />
      {routing && !routing.configured && (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-warning">
          <b>Réception automatique non configurée pour {domain}.</b> Le token de l&apos;app doit avoir la permission « Email
          Routing Rules : Edit » et <code>CLOUDFLARE_ZONE_ID</code> doit être défini (relancez <code>npm run deploy</code>) :
          les adresses ajoutées ici recevront alors leurs e-mails dans l&apos;app.
        </div>
      )}
      {routing?.error && (
        <div className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-[13px] text-danger">Réception : {routing.error}</div>
      )}
      {identities.length === 0 ? (
        <Empty icon={AtSign} text="Aucune adresse enregistrée" hint={`Ex. : contact@${domain}, support@${domain}, factures@${domain}`} />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {identities.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar label={i.name || i.address} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{i.name || i.address}</span>
                  {i.isDefault && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">Par défaut</span>}
                  {routing?.statuses[i.address] && (
                    <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", ROUTING_BADGE[routing.statuses[i.address]].cls)}>
                      {ROUTING_BADGE[routing.statuses[i.address]].label}
                    </span>
                  )}
                </div>
                <div className="truncate text-[13px] text-muted">
                  {i.address}
                  {i.signatureId && ` · ✍︎ ${signatures.find((s) => s.id === i.signatureId)?.name ?? ""}`}
                </div>
              </div>
              {routing?.configured && (routing.statuses[i.address] === "none" || routing.statuses[i.address] === "other") && (
                <Button size="sm" onClick={() => activate(i)} disabled={activating === i.id}>
                  {activating === i.id ? "Activation…" : "Activer la réception"}
                </Button>
              )}
              {!i.isDefault && (
                <IconButton label="Définir par défaut" onClick={() => makeDefault(i)}>
                  <Star size={16} />
                </IconButton>
              )}
              <IconButton label="Modifier" onClick={() => setEditing(i)}>
                <Pencil size={16} />
              </IconButton>
              <IconButton label="Retirer" onClick={() => remove(i)}>
                <Trash2 size={16} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Modifier l'adresse" : "Nouvelle adresse d'envoi"}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Annuler</Button>
            <Button variant="primary" onClick={save} disabled={saving || !LOCAL_PART_RE.test(local)}>
              Enregistrer
            </Button>
          </>
        }
      >
        {editing && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Field label="Adresse">
              <div className="flex h-9 items-center rounded-lg border border-line bg-surface pl-3 text-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
                <input
                  autoFocus
                  value={local}
                  onChange={(e) => setEditing({ ...editing, address: e.target.value.replace(/@.*/, "") })}
                  placeholder="contact"
                  className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-subtle"
                />
                <span className="pr-3 text-muted">@{domain}</span>
              </div>
            </Field>
            <Field label="Nom affiché" hint="Ce que voient vos destinataires, ex. « Support Example »">
              <input className={inputClass} value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Signature par défaut">
              <select
                className={inputClass}
                value={editing.signatureId ?? ""}
                onChange={(e) => setEditing({ ...editing, signatureId: e.target.value || null })}
              >
                <option value="">Aucune</option>
                {signatures.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(editing.isDefault)} onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })} className="accent-[var(--accent)]" />
              Utiliser par défaut pour les nouveaux messages
            </label>
            <button type="submit" hidden />
          </form>
        )}
      </Modal>
    </>
  );
}

/* ---------- Signatures ---------- */

/** Modèle de signature ; inclut le logo quand son URL publique est connue */
const signatureTemplate = (brandUrl: string | null, domain: string) =>
  (brandUrl ? `<p><img src="${brandUrl}/logo.png" alt="Logo" width="140"></p>` : "") +
  `<p><strong>Prénom Nom</strong><br>Fonction · ${domain.split(".")[0]}</p><p><a href="https://${domain}">${domain}</a> · +33 6 00 00 00 00</p>`;

function Signatures({ domain, signatures, reload }: { domain: string; signatures: Signature[]; reload: () => void }) {
  const toast = useToast();
  const brandUrl = useBrandAssetsUrl();
  const toForm = (sig?: Signature) => (sig ? { id: sig.id, name: sig.name, html: sig.html } : null);
  const [form, setForm] = useState<{ id?: string; name: string; html: string } | null>(() => toForm(signatures[0]));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const { signature } = await api<{ signature: Signature }>(form.id ? `/api/signatures/${form.id}` : "/api/signatures", {
        method: form.id ? "PATCH" : "POST",
        json: { name: form.name, html: form.html },
      });
      toast("Signature enregistrée", "success");
      setForm(toForm(signature));
      reload();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!form?.id || !confirm(`Supprimer la signature « ${form.name} » ?`)) return;
    await api(`/api/signatures/${form.id}`, { method: "DELETE" });
    setForm(toForm(signatures.find((s) => s.id !== form.id)));
    reload();
  };

  return (
    <>
      <Header
        title="Signatures"
        description="Créez une ou plusieurs signatures (texte, liens, logo par URL). Associez-les à une adresse d'envoi pour qu'elles s'ajoutent automatiquement."
        action={
          <Button
            variant="primary"
            onClick={() => {
              setForm({ name: signatures.length ? "Nouvelle signature" : "Signature principale", html: signatureTemplate(brandUrl, domain) });
            }}
          >
            <Plus size={15} /> Nouvelle
          </Button>
        }
      />
      {signatures.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {signatures.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setForm(toForm(s))}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                s.id === form?.id ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-hover",
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {form ? (
        <div className="space-y-4">
          <Field label="Nom de la signature">
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div>
            <span className="mb-1 block text-[13px] font-medium text-muted">Contenu</span>
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <RichEditor key={form.id ?? "new"} value={form.html} onChange={(html) => setForm((f) => (f ? { ...f, html } : f))} minHeight={160} placeholder="Votre signature…" />
            </div>
            <p className="mt-1.5 text-xs text-subtle">Astuce : le bouton à l&apos;icône de l&apos;app dans la barre d&apos;outils insère votre logo.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={save} disabled={saving || !form.name.trim()}>
              <Check size={15} /> Enregistrer
            </Button>
            {form.id && (
              <Button variant="ghost" className="text-danger" onClick={remove}>
                <Trash2 size={15} /> Supprimer
              </Button>
            )}
          </div>
        </div>
      ) : (
        <Empty icon={PenLine} text="Aucune signature" hint="Cliquez sur « Nouvelle » pour créer votre première signature." />
      )}
    </>
  );
}

/* ---------- Contacts ---------- */

function Contacts({ contacts, reload }: { contacts: Contact[]; reload: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<{ address: string; name: string; isNew: boolean } | null>(null);
  const filtered = contacts.filter((c) => !q || c.address.includes(q.toLowerCase()) || (c.name ?? "").toLowerCase().includes(q.toLowerCase()));

  const save = async () => {
    if (!editing) return;
    try {
      await api("/api/contacts", { method: "POST", json: { address: editing.address, name: editing.name } });
      setEditing(null);
      reload();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const remove = async (c: Contact) => {
    await api(`/api/contacts?address=${encodeURIComponent(c.address)}`, { method: "DELETE" });
    reload();
  };

  return (
    <>
      <Header
        title="Contacts"
        description="Les destinataires sont ajoutés automatiquement après chaque envoi et proposés en saisie semi-automatique."
        action={
          <Button variant="primary" onClick={() => setEditing({ address: "", name: "", isNew: true })}>
            <Plus size={15} /> Ajouter
          </Button>
        }
      />
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-2.5 text-subtle" />
        <input className={cn(inputClass, "pl-9")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un contact" />
      </div>
      {filtered.length === 0 ? (
        <Empty icon={Users} text={q ? "Aucun résultat" : "Aucun contact pour l'instant"} />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {filtered.map((c) => (
            <li key={c.address} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar label={c.name || c.address} className="h-8 w-8 text-xs" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.name || c.address}</div>
                {c.name && <div className="truncate text-[13px] text-muted">{c.address}</div>}
              </div>
              <span className="hidden text-xs text-subtle sm:inline">{c.count} envoi{c.count > 1 ? "s" : ""}</span>
              <IconButton label="Modifier" onClick={() => setEditing({ address: c.address, name: c.name ?? "", isNew: false })}>
                <Pencil size={15} />
              </IconButton>
              <IconButton label="Supprimer" onClick={() => remove(c)}>
                <Trash2 size={15} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.isNew ? "Nouveau contact" : "Modifier le contact"}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Annuler</Button>
            <Button variant="primary" onClick={save} disabled={!editing || !isValidEmail(editing.address.trim().toLowerCase())}>
              Enregistrer
            </Button>
          </>
        }
      >
        {editing && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Field label="Adresse e-mail">
              <input autoFocus={editing.isNew} disabled={!editing.isNew} className={inputClass} value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
            </Field>
            <Field label="Nom">
              <input autoFocus={!editing.isNew} className={inputClass} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <button type="submit" hidden />
          </form>
        )}
      </Modal>
    </>
  );
}

function Empty({ icon: Icon, text, hint }: { icon: typeof AtSign; text: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <Icon size={22} className="mb-3 text-subtle" />
      <p className="text-sm font-medium">{text}</p>
      {hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>}
    </div>
  );
}
