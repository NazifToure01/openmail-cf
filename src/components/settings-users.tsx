"use client";

import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserCog, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Avatar, Button, Field, IconButton, Modal, cn, inputClass, useToast } from "./ui";

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  access: { domain: string; mailboxes: "*" | string[] }[];
  disabled?: boolean;
};

type Draft = {
  id?: string;
  email: string;
  name: string;
  role: "admin" | "member";
  password: string;
  disabled: boolean;
  /** Par domaine : null = pas d'accès, "*" = toutes les boîtes, sinon adresses séparées par des virgules */
  access: Record<string, "*" | string | null>;
};

const toDraft = (u: AppUser | null, domains: string[]): Draft => ({
  id: u?.id,
  email: u?.email ?? "",
  name: u?.name ?? "",
  role: u?.role ?? "member",
  password: "",
  disabled: Boolean(u?.disabled),
  access: Object.fromEntries(
    domains.map((d) => {
      const a = u?.access.find((x) => x.domain === d);
      return [d, !a ? null : a.mailboxes === "*" ? "*" : a.mailboxes.join(", ")];
    }),
  ),
});

function describeAccess(u: AppUser) {
  if (u.role === "admin") return "Administrateur · tous les domaines";
  if (!u.access.length) return "Aucun accès";
  return u.access.map((a) => (a.mailboxes === "*" ? `${a.domain} (toutes les boîtes)` : `${a.mailboxes.join(", ")}`)).join(" · ");
}

/** Comptes et droits (administrateurs) */
export function UsersSettings({ me }: { me: AppUser }) {
  const toast = useToast();
  const [list, setList] = useState<AppUser[] | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([api<{ users: AppUser[] }>("/api/users"), api<{ domains: { name: string }[] }>("/api/domains")])
        .then(([u, d]) => {
          setList(u.users);
          setDomains(d.domains.map((x) => x.name));
        })
        .catch((err: Error) => toast(err.message, "error")),
    [toast],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const access = Object.entries(editing.access)
      .filter(([, v]) => v !== null)
      .map(([domain, v]) => ({
        domain,
        mailboxes: v === "*" ? "*" : String(v).split(/[,;\s]+/).filter(Boolean),
      }));
    const body = {
      email: editing.email,
      name: editing.name,
      role: editing.role,
      disabled: editing.disabled,
      access,
      ...(editing.password ? { password: editing.password } : {}),
    };
    try {
      await api(editing.id ? `/api/users/${encodeURIComponent(editing.id)}` : "/api/users", { method: editing.id ? "PATCH" : "POST", json: body });
      toast(editing.id ? "Compte mis à jour" : "Compte créé", "success");
      setEditing(null);
      void load();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u: AppUser) => {
    if (!confirm(`Supprimer le compte de ${u.name} (${u.email}) ?`)) return;
    await api(`/api/users/${encodeURIComponent(u.id)}`, { method: "DELETE" }).catch((e: Error) => toast(e.message, "error"));
    void load();
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Utilisateurs</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Chaque personne a son propre identifiant. Choisissez les domaines et les boîtes qu&apos;elle peut consulter et depuis lesquelles elle peut écrire.
          </p>
        </div>
        <Button variant="primary" onClick={() => setEditing(toDraft(null, domains))}>
          <Plus size={15} /> Ajouter
        </Button>
      </div>

      {list === null ? null : list.length === 0 ? (
        <p className="text-sm text-muted">Aucun compte.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {list.map((u) => (
            <li key={u.id} className={cn("flex items-center gap-3 px-4 py-3", u.disabled && "opacity-60")}>
              <Avatar label={u.name || u.email} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{u.name}</span>
                  {u.role === "admin" && <ShieldCheck size={14} className="shrink-0 text-accent" aria-label="Administrateur" />}
                  {u.disabled && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">Désactivé</span>}
                  {u.id === me.id && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">Vous</span>}
                </div>
                <div className="truncate text-[13px] text-muted">{u.email}</div>
                <div className="truncate text-xs text-subtle">{describeAccess(u)}</div>
              </div>
              <IconButton label="Modifier" onClick={() => setEditing(toDraft(u, domains))}>
                <Pencil size={16} />
              </IconButton>
              {u.id !== me.id && (
                <IconButton label="Supprimer" onClick={() => remove(u)}>
                  <Trash2 size={16} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Modifier le compte" : "Nouveau compte"}
        wide
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Annuler</Button>
            <Button variant="primary" onClick={save} disabled={saving || !editing?.email || (!editing?.id && editing?.password.length < 10)}>
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
              void save();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nom">
                <input className={inputClass} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label="E-mail (identifiant)">
                <input className={inputClass} type="email" disabled={Boolean(editing.id)} value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </Field>
            </div>
            <Field label={editing.id ? "Nouveau mot de passe (laisser vide pour ne pas changer)" : "Mot de passe (10 caractères minimum)"} hint="Changer le mot de passe déconnecte la personne sur tous ses appareils.">
              <input className={inputClass} type="password" autoComplete="new-password" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} />
            </Field>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={editing.role === "admin"} disabled={editing.id === me.id} onChange={(e) => setEditing({ ...editing, role: e.target.checked ? "admin" : "member" })} />
                Administrateur (tous les domaines, gère les comptes et les adresses)
              </label>
              {editing.id && editing.id !== me.id && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={editing.disabled} onChange={(e) => setEditing({ ...editing, disabled: e.target.checked })} />
                  Compte désactivé
                </label>
              )}
            </div>

            {editing.role !== "admin" && (
              <div>
                <span className="mb-2 block text-[13px] font-medium text-muted">Accès</span>
                <div className="divide-y divide-line rounded-xl border border-line">
                  {domains.map((d) => {
                    const value = editing.access[d];
                    const setAccess = (v: "*" | string | null) => setEditing({ ...editing, access: { ...editing.access, [d]: v } });
                    return (
                      <div key={d} className="space-y-2 px-3 py-2.5">
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <input type="checkbox" checked={value !== null} onChange={(e) => setAccess(e.target.checked ? "*" : null)} />
                          {d}
                        </label>
                        {value !== null && (
                          <div className="space-y-2 pl-6 text-[13px]">
                            <label className="flex items-center gap-2">
                              <input type="radio" checked={value === "*"} onChange={() => setAccess("*")} />
                              Toutes les boîtes
                            </label>
                            <label className="flex items-center gap-2">
                              <input type="radio" checked={value !== "*"} onChange={() => setAccess("")} />
                              Seulement :
                            </label>
                            {value !== "*" && (
                              <input
                                className={inputClass}
                                placeholder={`prenom@${d}, contact@${d}`}
                                value={value}
                                onChange={(e) => setAccess(e.target.value)}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <button type="submit" hidden />
          </form>
        )}
      </Modal>
    </>
  );
}

/** Mon compte : nom et mot de passe */
export function AccountSettings({ me, onUpdated }: { me: AppUser; onUpdated: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(me.name);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);

  const saveName = async () => {
    setSaving(true);
    try {
      await api("/api/auth/me", { method: "PATCH", json: { name } });
      toast("Nom mis à jour", "success");
      onUpdated();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    setSaving(true);
    try {
      await api("/api/auth/me", { method: "PATCH", json: { currentPassword: current, newPassword: next } });
      toast("Mot de passe modifié, reconnectez-vous", "success");
      await api("/api/auth/logout", { method: "POST" }).catch(() => {});
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      setTimeout(() => (window.location.href = "/login"), 1200);
    } catch (err) {
      toast((err as Error).message, "error");
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Mon compte</h1>
        <p className="mt-1 text-sm text-muted">
          {me.email} · {me.role === "admin" ? "Administrateur" : "Membre"}
        </p>
      </div>
      <section className="mb-6 space-y-3 rounded-2xl border border-line bg-surface p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <UserCog size={15} /> Profil
        </h2>
        <Field label="Nom affiché">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button variant="primary" onClick={saveName} disabled={saving || !name.trim() || name === me.name}>
          Enregistrer
        </Button>
      </section>
      <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound size={15} /> Mot de passe
        </h2>
        <Field label="Mot de passe actuel">
          <input className={inputClass} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="Nouveau mot de passe" hint="10 caractères minimum. Vos autres appareils seront déconnectés.">
          <input className={inputClass} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Button variant="primary" onClick={savePassword} disabled={saving || !current || next.length < 10}>
          Changer le mot de passe
        </Button>
      </section>
    </>
  );
}

export const USERS_ICON = Users;
