"use client";

import type { Editor } from "@tiptap/react";
import { AlertTriangle, CalendarPlus, Flag, Languages, Loader2, MessageSquareReply, RefreshCw, Sparkles } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { api } from "@/lib/api";
import type { AiCategory, AiStatus, Message, MessageSummary } from "@/lib/types";
import { Button, Field, Modal, cn, inputClass, useToast } from "./ui";

/* ---------- Contexte ---------- */

const AiContext = createContext<AiStatus>({ enabled: false });
export const AiProvider = AiContext.Provider;

/** Fonctionnalité IA utilisable dans l'interface */
export function useAiFeature(feature: "compose" | "summary" | "triage" | "search"): boolean {
  const status = useContext(AiContext);
  return status.enabled && status.features[feature];
}

/* ---------- Badges du tri ---------- */

export const CATEGORY_LABELS: Record<AiCategory, string> = {
  personnel: "Personnel",
  client: "Client",
  facture: "Facture",
  commande: "Commande",
  "rendez-vous": "Rendez-vous",
  newsletter: "Newsletter",
  notification: "Notification",
  promotion: "Promotion",
  autre: "Autre",
};

/** Filtres proposés au-dessus de la boîte de réception */
export const AI_FILTERS: { id: string; label: string }[] = [
  { id: "", label: "Tous" },
  { id: "priority", label: "Prioritaires" },
  { id: "reply", label: "À répondre" },
  { id: "client", label: "Clients" },
  { id: "facture", label: "Factures" },
  { id: "rendez-vous", label: "Rendez-vous" },
  { id: "newsletter", label: "Newsletters" },
  { id: "notification", label: "Notifications" },
];

const chip = "inline-flex shrink-0 items-center gap-1 rounded px-1.5 text-[11px] font-medium";

export function AiBadges({ ai, compact }: { ai: MessageSummary["ai"]; compact?: boolean }) {
  if (!ai) return null;
  return (
    <>
      {ai.phishing && ai.phishing.risk !== "low" && (
        <span className={cn(chip, "bg-danger-soft text-danger")} title={ai.phishing.reasons.join("\n")}>
          <AlertTriangle size={11} /> {compact ? "Suspect" : "Hameçonnage possible"}
        </span>
      )}
      {ai.priority === "high" && (
        <span className={cn(chip, "bg-warning-soft text-warning")}>
          <Flag size={11} /> Prioritaire
        </span>
      )}
      {ai.needsReply && <span className={cn(chip, "bg-accent-soft text-accent")}>À répondre</span>}
      {ai.category && ai.category !== "autre" && <span className={cn(chip, "bg-surface-2 text-muted")}>{CATEGORY_LABELS[ai.category]}</span>}
    </>
  );
}

/* ---------- Panneau IA d'un message reçu ---------- */

export function MessageAiPanel({ message, onReply }: { message: Message; onReply: (html: string) => void }) {
  const toast = useToast();
  const canSummarize = useAiFeature("summary");
  const [summary, setSummary] = useState<{ id: string; text: string } | null>(
    message.ai?.summary ? { id: message.id, text: message.ai.summary } : null,
  );
  const [replies, setReplies] = useState<{ id: string; list: { text: string; html: string }[] } | null>(null);
  const [busy, setBusy] = useState<"summary" | "replies" | null>(null);
  const ai = message.ai;
  const shownSummary = summary?.id === message.id ? summary.text : ai?.summary;
  const shownReplies = replies?.id === message.id ? replies.list : null;

  const run = async (kind: "summary" | "replies", refresh = false) => {
    setBusy(kind);
    try {
      if (kind === "summary") {
        const r = await api<{ summary: string }>(`/api/ai/messages/${message.id}/summary${refresh ? "?refresh" : ""}`, { method: "POST" });
        setSummary({ id: message.id, text: r.summary });
      } else {
        const r = await api<{ replies: { text: string; html: string }[] }>(`/api/ai/messages/${message.id}/replies`, { method: "POST" });
        setReplies({ id: message.id, list: r.replies });
      }
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const risky = ai?.phishing && ai.phishing.risk !== "low";
  if (!canSummarize && !ai?.triagedAt) return null;

  return (
    <div className="mt-4 space-y-3">
      {risky && (
        <div className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <b className="font-semibold">{ai.phishing!.risk === "high" ? "Hameçonnage probable." : "Message suspect."}</b> Ne cliquez sur aucun lien et ne
            communiquez aucun mot de passe ni coordonnée bancaire.
            {ai.phishing!.reasons.length > 0 && <span className="block text-danger/80">{ai.phishing!.reasons.join(" · ")}</span>}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-line bg-surface px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Sparkles size={14} className="text-accent" />
          <span className="text-[13px] font-semibold">Assistant</span>
          <AiBadges ai={ai ? { ...ai, phishing: undefined } : undefined} />
          <span className="flex-1" />
          {canSummarize && (
            <>
              {!shownSummary && (
                <Button size="sm" variant="ghost" onClick={() => run("summary")} disabled={busy !== null}>
                  {busy === "summary" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Résumer
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => run("replies")} disabled={busy !== null}>
                {busy === "replies" ? <Loader2 size={13} className="animate-spin" /> : <MessageSquareReply size={13} />} Suggérer des réponses
              </Button>
            </>
          )}
        </div>

        {shownSummary ? (
          <div className="mt-2 flex items-start gap-2">
            <p className="flex-1 whitespace-pre-line text-[13px] leading-relaxed text-fg/90">{shownSummary}</p>
            {canSummarize && (
              <button type="button" title="Régénérer le résumé" aria-label="Régénérer le résumé" onClick={() => run("summary", true)} className="rounded p-1 text-subtle hover:text-fg">
                <RefreshCw size={13} className={cn(busy === "summary" && "animate-spin")} />
              </button>
            )}
          </div>
        ) : (
          ai?.gist && <p className="mt-2 text-[13px] text-muted">{ai.gist}</p>
        )}

        {ai?.events && ai.events.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {ai.events.map((e, i) => (
              <a
                key={i}
                href={`/api/ai/messages/${message.id}/event?i=${i}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[12px] hover:bg-hover"
              >
                <CalendarPlus size={13} className="text-accent" />
                {e.title} · {formatEventDate(e.start)}
                {e.location ? ` · ${e.location}` : ""}
              </a>
            ))}
          </div>
        )}

        {shownReplies && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">Réponses proposées (modifiables avant envoi)</p>
            {shownReplies.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onReply(r.html)}
                className="block w-full rounded-lg border border-line px-3 py-2 text-left text-[13px] hover:border-accent hover:bg-accent-soft"
              >
                {r.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatEventDate(iso: string) {
  const [d, t] = iso.split("T");
  const date = new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  return t ? `${date} à ${t.slice(0, 5).replace(":", " h ")}` : date;
}

/* ---------- Assistant de rédaction ---------- */

type WriteAction = "draft" | "fix" | "shorter" | "longer" | "formal" | "friendly" | "translate" | "custom";

const QUICK_ACTIONS: { id: WriteAction; label: string }[] = [
  { id: "fix", label: "Corriger" },
  { id: "shorter", label: "Plus court" },
  { id: "longer", label: "Plus détaillé" },
  { id: "formal", label: "Plus formel" },
  { id: "friendly", label: "Plus chaleureux" },
];

const LANGUAGES = ["anglais", "français", "espagnol", "allemand", "italien", "portugais", "néerlandais", "arabe", "chinois"];

export type AiWriteContext = { subject?: string; replyTo?: string };

/**
 * Rédige ou transforme le texte de l'éditeur. Avec une sélection, seule la sélection est
 * transformée ; sinon tout le message. Le résultat est affiché avant d'être inséré.
 */
export function AiWriteDialog({ editor, context, onClose }: { editor: Editor; context?: AiWriteContext; onClose: () => void }) {
  const toast = useToast();
  // Plage visée, mémorisée à l'ouverture (le focus part dans la boîte de dialogue)
  const [range] = useState(() => {
    const { from, to, empty } = editor.state.selection;
    if (!empty) return { from, to, text: editor.state.doc.textBetween(from, to, "\n\n"), selection: true };
    const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n\n").trim();
    return { from: 0, to: editor.state.doc.content.size, text, selection: false };
  });
  const hasText = range.text.trim().length > 0;
  const [instruction, setInstruction] = useState("");
  const [custom, setCustom] = useState("");
  const [language, setLanguage] = useState("anglais");
  const [busy, setBusy] = useState<WriteAction | null>(null);
  const [result, setResult] = useState<{ text: string; html: string; action: WriteAction } | null>(null);

  const run = async (action: WriteAction) => {
    setBusy(action);
    try {
      const r = await api<{ text: string; html: string }>("/api/ai/write", {
        method: "POST",
        json: {
          action,
          text: action === "draft" ? undefined : range.text,
          instruction: action === "draft" ? instruction : action === "custom" ? custom : undefined,
          language: action === "translate" ? language : undefined,
          subject: context?.subject,
          replyTo: context?.replyTo,
        },
      });
      setResult({ ...r, action });
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const apply = () => {
    if (!result) return;
    const chain = editor.chain().focus();
    if (result.action === "draft" && !(range.selection || !hasText)) chain.insertContent(result.html).run();
    else chain.insertContentAt({ from: range.from, to: range.to }, result.html).run();
    onClose();
  };

  const spinner = (a: WriteAction) => busy === a && <Loader2 size={13} className="animate-spin" />;

  return (
    <Modal
      open
      onClose={onClose}
      title="Assistant de rédaction"
      wide
      footer={
        result ? (
          <>
            <Button onClick={() => setResult(null)}>Recommencer</Button>
            <Button variant="primary" onClick={apply}>
              {result.action === "draft" && !range.selection && hasText ? "Insérer" : "Remplacer"}
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Fermer</Button>
        )
      }
    >
      {result ? (
        <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm leading-relaxed">{result.text}</div>
      ) : (
        <div className="space-y-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (instruction.trim()) void run("draft");
            }}
          >
            <Field label="Rédiger un message" hint="Ex. : « relance cordiale pour la facture 142, paiement attendu sous 8 jours »">
              <textarea className={cn(inputClass, "h-20 py-2")} value={instruction} onChange={(e) => setInstruction(e.target.value)} autoFocus />
            </Field>
            <Button type="submit" variant="primary" size="sm" className="mt-2" disabled={!instruction.trim() || busy !== null}>
              {spinner("draft") || <Sparkles size={13} />} Rédiger
            </Button>
          </form>

          <div>
            <p className="mb-2 text-[13px] font-medium text-muted">
              {hasText ? (range.selection ? "Transformer la sélection" : "Transformer tout le message") : "Écrivez ou sélectionnez du texte pour le transformer"}
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((a) => (
                <Button key={a.id} size="sm" onClick={() => run(a.id)} disabled={!hasText || busy !== null}>
                  {spinner(a.id)} {a.label}
                </Button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Languages size={15} className="text-muted" />
              <select className={cn(inputClass, "h-8 w-40")} value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Langue">
                {LANGUAGES.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
              <Button size="sm" onClick={() => run("translate")} disabled={!hasText || busy !== null}>
                {spinner("translate")} Traduire
              </Button>
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className={cn(inputClass, "h-8")}
                placeholder="Autre consigne : « ajoute une formule de politesse »…"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
              />
              <Button size="sm" onClick={() => run("custom")} disabled={!hasText || !custom.trim() || busy !== null}>
                {spinner("custom")} Appliquer
              </Button>
            </div>
          </div>
          <p className="text-xs text-subtle">Le texte est envoyé au service d&apos;IA configuré sur ce serveur. Relisez toujours le résultat avant de l&apos;envoyer.</p>
        </div>
      )}
    </Modal>
  );
}
