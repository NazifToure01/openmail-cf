"use client";

import { CalendarClock, Gauge, Loader2, SearchCheck, Send, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Field, Spinner, cn, inputClass, useToast } from "./ui";

type Features = { compose: boolean; summary: boolean; triage: boolean; search: boolean };
type AiSettingsData = {
  provider: { name: string; kind: string; host: string | null; model: string; embeddingModel: string | null } | null;
  settings: { features: Features; dailyLimit: number; digest: { enabled: boolean; hour: number; timeZone: string } };
  usage: { total: number; auto: number };
  index: { indexed: number; total: number } | null;
};

const FEATURES: { id: keyof Features; label: string; hint: string }[] = [
  { id: "compose", label: "Assistant de rédaction", hint: "Rédiger, corriger, reformuler et traduire depuis l'éditeur." },
  { id: "summary", label: "Résumés et réponses suggérées", hint: "À la demande, depuis la lecture d'un e-mail." },
  { id: "triage", label: "Tri des e-mails reçus", hint: "Catégorie, priorité, réponse attendue, hameçonnage et rendez-vous, à chaque réception." },
  { id: "search", label: "Recherche par le sens et questions", hint: "Chaque e-mail est converti en vecteur (embeddings) pour être retrouvé par son sens." },
];

const section = "space-y-3 rounded-2xl border border-line bg-surface p-5";

/** Réglages → IA (administrateur) */
export function AiSettings({ onSaved }: { onSaved: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<AiSettingsData | null>(null);
  const [draft, setDraft] = useState<AiSettingsData["settings"] | null>(null);
  const [saving, setSaving] = useState(false);
  const [indexing, setIndexing] = useState<{ remaining: number } | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(
    () =>
      api<AiSettingsData>("/api/ai/settings")
        .then((d) => {
          setData(d);
          setDraft(d.settings);
        })
        .catch((err: Error) => toast(err.message, "error")),
    [toast],
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (!data || !draft) {
    return (
      <div className="flex justify-center py-10 text-muted">
        <Spinner />
      </div>
    );
  }

  const header = (
    <div className="mb-6">
      <h1 className="text-xl font-semibold tracking-tight">Intelligence artificielle</h1>
      <p className="mt-1 max-w-xl text-sm text-muted">
        Fonctionnalités facultatives. Les e-mails concernés sont transmis au service d&apos;IA configuré sur le serveur ; l&apos;IA ne fait que
        proposer : rien n&apos;est envoyé sans votre validation.
      </p>
    </div>
  );

  if (!data.provider) {
    return (
      <>
        {header}
        <section className={section}>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles size={15} /> IA désactivée
          </h2>
          <p className="text-[13px] leading-relaxed text-muted">
            Pour l&apos;activer, définissez <code>AI_PROVIDER</code> dans le fichier <code>.env</code> puis relancez <code>npm run deploy</code> :
          </p>
          <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs">{`# Modèles Cloudflare, sans clé (les données restent chez Cloudflare)
AI_PROVIDER=workers-ai

# ou un fournisseur compatible OpenAI
AI_PROVIDER=mistral        # openai, mistral, openai-compatible
AI_API_KEY=…`}</pre>
          <p className="text-[13px] text-muted">Détails dans le README, section « Intelligence artificielle ».</p>
        </section>
      </>
    );
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings);
  const setFeature = (id: keyof Features, on: boolean) => setDraft({ ...draft, features: { ...draft.features, [id]: on } });
  const setDigest = (patch: Partial<AiSettingsData["settings"]["digest"]>) => setDraft({ ...draft, digest: { ...draft.digest, ...patch } });

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/ai/settings", { method: "PUT", json: draft });
      toast("Réglages IA enregistrés", "success");
      await load();
      onSaved();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  /** Indexe les anciens e-mails par lots, jusqu'au dernier */
  const indexAll = async () => {
    setIndexing({ remaining: (data.index?.total ?? 0) - (data.index?.indexed ?? 0) });
    try {
      for (let i = 0; i < 1000; i++) {
        const r = await api<{ indexed: number; remaining: number }>("/api/ai/index", { method: "POST" });
        setIndexing({ remaining: r.remaining });
        if (r.remaining === 0 || r.indexed === 0) break;
      }
      toast("Tous les e-mails sont indexés", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setIndexing(null);
      void load();
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      await api("/api/ai/digest/test", { method: "POST" });
      toast("Résumé envoyé à votre adresse", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setTesting(false);
    }
  };

  const searchAvailable = Boolean(data.provider.embeddingModel);

  return (
    <>
      {header}
      <div className="space-y-6">
        <section className={section}>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles size={15} /> Fournisseur
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
            <dt className="text-muted">Service</dt>
            <dd>
              {data.provider.name}
              {data.provider.host && <span className="text-subtle"> · {data.provider.host}</span>}
            </dd>
            <dt className="text-muted">Modèle</dt>
            <dd className="break-all font-mono text-xs leading-5">{data.provider.model}</dd>
            <dt className="text-muted">Embeddings</dt>
            <dd className="break-all font-mono text-xs leading-5">{data.provider.embeddingModel ?? "— (recherche par le sens indisponible)"}</dd>
          </dl>
          <p className="text-xs text-subtle">Modifiable dans .env (AI_PROVIDER, AI_MODEL, AI_EMBEDDING_MODEL), puis npm run deploy.</p>
        </section>

        <section className={section}>
          <h2 className="text-sm font-semibold">Fonctionnalités</h2>
          {FEATURES.map((f) => {
            const unavailable = f.id === "search" && !searchAvailable;
            return (
              <label key={f.id} className={cn("flex items-start gap-3", unavailable && "opacity-50")}>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[var(--accent)]"
                  checked={draft.features[f.id] && !unavailable}
                  disabled={unavailable}
                  onChange={(e) => setFeature(f.id, e.target.checked)}
                />
                <span>
                  <span className="block text-sm font-medium">{f.label}</span>
                  <span className="block text-xs text-muted">{f.hint}</span>
                </span>
              </label>
            );
          })}
        </section>

        <section className={section}>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <CalendarClock size={15} /> Résumé quotidien par e-mail
          </h2>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={draft.digest.enabled} onChange={(e) => setDigest({ enabled: e.target.checked })} />
            Envoyer chaque jour à chaque utilisateur le résumé de ses e-mails des dernières 24 heures
          </label>
          <div className="flex flex-wrap gap-3">
            <Field label="Heure d'envoi">
              <select className={cn(inputClass, "w-28")} value={draft.digest.hour} onChange={(e) => setDigest({ hour: Number(e.target.value) })}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")} h 00
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fuseau horaire">
              <input className={cn(inputClass, "w-48")} value={draft.digest.timeZone} onChange={(e) => setDigest({ timeZone: e.target.value })} />
            </Field>
          </div>
          <p className="text-xs text-subtle">Envoyé depuis l&apos;adresse d&apos;envoi par défaut, par la tâche planifiée du Worker de réception (chaque heure).</p>
          <Button size="sm" onClick={sendTest} disabled={testing}>
            {testing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} M&apos;envoyer un aperçu maintenant
          </Button>
        </section>

        <section className={section}>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Gauge size={15} /> Limites
          </h2>
          <Field label="Requêtes IA par utilisateur et par jour" hint="Rédaction, résumés, réponses, recherches. Le tri automatique a sa propre limite (AI_AUTO_DAILY_LIMIT).">
            <div className="w-32">
              <input
                className={inputClass}
                inputMode="numeric"
                value={draft.dailyLimit}
                onChange={(e) => setDraft({ ...draft, dailyLimit: Number(e.target.value.replace(/\D/g, "")) || 0 })}
              />
            </div>
          </Field>
          <p className="text-[13px] text-muted">
            Aujourd&apos;hui : {data.usage.total} requête{data.usage.total > 1 ? "s" : ""}, dont {data.usage.auto} automatique{data.usage.auto > 1 ? "s" : ""}.
          </p>
        </section>

        {searchAvailable && data.index && (
          <section className={section}>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <SearchCheck size={15} /> Index de recherche
            </h2>
            <p className="text-[13px] text-muted">
              {data.index.indexed} e-mail{data.index.indexed > 1 ? "s" : ""} indexé{data.index.indexed > 1 ? "s" : ""} sur {data.index.total}. Les nouveaux e-mails
              (reçus et envoyés) sont indexés automatiquement.
            </p>
            {data.index.indexed < data.index.total && (
              <Button size="sm" onClick={indexAll} disabled={indexing !== null || !draft.features.search}>
                {indexing ? <Loader2 size={13} className="animate-spin" /> : <SearchCheck size={13} />}
                {indexing ? `Indexation… ${indexing.remaining} restant${indexing.remaining > 1 ? "s" : ""}` : "Indexer les anciens e-mails"}
              </Button>
            )}
          </section>
        )}

        <div className="flex justify-end">
          <Button variant="primary" onClick={save} disabled={saving || !dirty || draft.dailyLimit < 1}>
            Enregistrer
          </Button>
        </div>
      </div>
    </>
  );
}
