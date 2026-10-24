"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileText,
  Forward,
  MailOpen,
  Pencil,
  Reply,
  ReplyAll,
  RotateCcw,
  Star,
  Trash2,
  XCircle,
} from "lucide-react";
import { EmailFrame } from "./email-frame";
import { formatAddress } from "@/lib/addresses";
import { formatBytes, formatFullDate } from "@/lib/api";
import type { Address, Message } from "@/lib/types";
import { Avatar, Button, IconButton, Spinner, cn } from "./ui";

export type ViewAction =
  | "reply"
  | "replyAll"
  | "followup"
  | "forward"
  | "duplicate"
  | "edit"
  | "trash"
  | "restore"
  | "delete"
  | "star"
  | "unread";

export function MessageView({
  message,
  loading,
  deliveryError,
  onAction,
  onBack,
}: {
  message: Message | null;
  deliveryError?: string | null;
  loading: boolean;
  onAction: (action: ViewAction) => void;
  onBack: () => void;
}) {
  if (loading && !message) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }
  if (!message) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted">
        <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2">
          <FileText size={24} />
        </div>
        <p className="text-sm">Sélectionnez un message pour l&apos;afficher</p>
        <p className="text-xs text-subtle">
          Appuyez sur <kbd className="rounded border border-line px-1">C</kbd> pour écrire un nouveau message
        </p>
      </div>
    );
  }

  const inTrash = message.folder === "trash";
  const isDraft = message.folder === "drafts";
  const incoming = message.direction === "in";
  const visibleAttachments = message.attachments.filter((a) => !a.inline);
  const date = message.sentAt ?? message.updatedAt;

  return (
    <article className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
        <IconButton label="Retour" onClick={onBack} className="lg:hidden">
          <ArrowLeft size={17} />
        </IconButton>
        {isDraft ? (
          <Button size="sm" variant="primary" onClick={() => onAction("edit")}>
            <Pencil size={14} /> Modifier le brouillon
          </Button>
        ) : (
          !inTrash &&
          (incoming ? (
            <>
              <Button size="sm" onClick={() => onAction("reply")}>
                <Reply size={14} /> Répondre
              </Button>
              <Button size="sm" onClick={() => onAction("replyAll")}>
                <ReplyAll size={14} /> <span className="hidden sm:inline">Répondre à tous</span>
              </Button>
              <Button size="sm" onClick={() => onAction("forward")}>
                <Forward size={14} /> Transférer
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" onClick={() => onAction("followup")} title="Écrire à nouveau aux mêmes destinataires">
                <Reply size={14} /> Relancer
              </Button>
              <Button size="sm" onClick={() => onAction("forward")}>
                <Forward size={14} /> Transférer
              </Button>
              <IconButton label="Dupliquer en nouveau message" onClick={() => onAction("duplicate")}>
                <Copy size={16} />
              </IconButton>
            </>
          ))
        )}
        <div className="ml-auto flex items-center gap-1">
          {incoming && !inTrash && (
            <IconButton label="Marquer comme non lu" onClick={() => onAction("unread")}>
              <MailOpen size={17} />
            </IconButton>
          )}
          {!inTrash && (
            <IconButton label={message.starred ? "Retirer des suivis" : "Suivre"} onClick={() => onAction("star")}>
              <Star size={17} className={cn(message.starred && "fill-warning text-warning")} />
            </IconButton>
          )}
          {inTrash ? (
            <>
              <Button size="sm" onClick={() => onAction("restore")}>
                <RotateCcw size={14} /> Restaurer
              </Button>
              <Button size="sm" variant="ghost" className="text-danger" onClick={() => onAction("delete")}>
                <Trash2 size={14} /> Supprimer définitivement
              </Button>
            </>
          ) : isDraft ? (
            <IconButton label="Supprimer le brouillon" onClick={() => onAction("delete")}>
              <Trash2 size={17} />
            </IconButton>
          ) : (
            <IconButton label="Mettre à la corbeille" onClick={() => onAction("trash")}>
              <Trash2 size={17} />
            </IconButton>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-5 py-5 sm:px-8">
          <h1 className="mb-4 text-xl font-semibold leading-snug tracking-tight">{message.subject || "(sans objet)"}</h1>

          <div className="flex items-start gap-3">
            <Avatar label={message.from.name || message.from.address} />
            <div className="min-w-0 flex-1 text-[13px]">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <div className="min-w-0">
                  <span className="text-sm font-semibold">{message.from.name || message.from.address}</span>
                  {message.from.name && <span className="ml-1.5 text-muted">&lt;{message.from.address}&gt;</span>}
                </div>
                <time className="shrink-0 text-xs text-muted" dateTime={date}>
                  {formatFullDate(date)}
                </time>
              </div>
              <AddressLine label="À" list={message.to} />
              <AddressLine label="Cc" list={message.cc} />
              <AddressLine label="Cci" list={message.bcc} />
              {message.replyTo && <AddressLine label="Répondre à" list={[message.replyTo]} />}
            </div>
          </div>

          {message.error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
              <XCircle size={16} className="mt-0.5 shrink-0" />
              <div>
                <b className="font-semibold">Échec du dernier envoi.</b> {message.error}
              </div>
            </div>
          )}
          {message.result && <DeliveryStatus result={message.result} delivery={message.delivery} trackingError={deliveryError} />}

          <div className="mt-6">
            <EmailFrame html={message.html ?? message.bodyHtml} />
            {message.rawId && (
              <a href={`/api/attachments/${message.rawId}?download`} className="mt-2 inline-flex items-center gap-1 text-xs text-subtle hover:text-fg">
                <Download size={12} /> Télécharger l&apos;original (.eml)
              </a>
            )}
          </div>

          {visibleAttachments.length > 0 && (
            <div className="mt-6 border-t border-line pt-4">
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">
                {visibleAttachments.length} pièce{visibleAttachments.length > 1 ? "s" : ""} jointe{visibleAttachments.length > 1 ? "s" : ""}
              </h2>
              <div className="flex flex-wrap gap-2">
                {visibleAttachments.map((a) => (
                  <div key={a.id} className="flex w-60 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2">
                    <FileText size={18} className="shrink-0 text-muted" />
                    <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 hover:underline">
                      <div className="truncate text-[13px] font-medium">{a.filename}</div>
                      <div className="text-xs text-subtle">{formatBytes(a.size)}</div>
                    </a>
                    <a href={`/api/attachments/${a.id}?download`} aria-label={`Télécharger ${a.filename}`} className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-fg">
                      <Download size={15} />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function AddressLine({ label, list }: { label: string; list: Address[] }) {
  if (!list.length) return null;
  return (
    <div className="mt-0.5 text-muted">
      <span className="mr-1">{label} :</span>
      {list.map((a, i) => (
        <span key={a.address} title={formatAddress(a)} className="text-fg/80">
          {a.name ? `${a.name} <${a.address}>` : a.address}
          {i < list.length - 1 && ", "}
        </span>
      ))}
    </div>
  );
}

function DeliveryStatus({
  result,
  delivery,
  trackingError,
}: {
  result: NonNullable<Message["result"]>;
  delivery?: Message["delivery"];
  trackingError?: string | null;
}) {
  const detail = (list: string[]) =>
    list.map((a) => (delivery?.[a]?.detail ? `${a} : ${delivery[a].detail}` : a)).join("\n");
  const groups = [
    { list: result.delivered, label: "Délivré", icon: CheckCircle2, cls: "bg-success-soft text-success" },
    { list: result.queued, label: "En file d'attente", icon: Clock, cls: "bg-warning-soft text-warning" },
    { list: result.permanent_bounces, label: "Rejet définitif", icon: XCircle, cls: "bg-danger-soft text-danger" },
    { list: result.suppressed_recipients ?? [], label: "Bloqué (liste de suppression)", icon: AlertTriangle, cls: "bg-danger-soft text-danger" },
  ].filter((g) => g.list.length);
  if (!groups.length) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {groups.map((g) => (
        <span key={g.label} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", g.cls)} title={detail(g.list)}>
          <g.icon size={13} />
          {g.label} · {g.list.length === 1 ? g.list[0] : `${g.list.length} destinataires`}
        </span>
      ))}
      {result.queued.length > 0 && trackingError && (
        <p className="w-full text-xs text-subtle">{trackingError}</p>
      )}
    </div>
  );
}
