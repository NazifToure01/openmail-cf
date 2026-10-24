import { currentDomain } from "@/lib/domains";
import { mailboxAddresses } from "@/lib/mailboxes";
import { handler, summarize } from "@/lib/server";
import { currentUser, mailboxAccess } from "@/lib/session";
import { identities, messages } from "@/lib/store";
import type { Folder, FolderCounts, Mailbox } from "@/lib/types";

const FOLDERS: Folder[] = ["inbox", "sent", "drafts", "trash"];

export const GET = handler(async (request: Request) => {
  const url = new URL(request.url);
  const view = url.searchParams.get("folder") ?? "inbox";
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  // Boîte sélectionnée (ex. contact@example.com) ; vide = toutes les boîtes
  const mailbox = (url.searchParams.get("mailbox") ?? "").trim().toLowerCase();
  const domain = (await currentDomain()).name;
  const access = mailboxAccess(currentUser(), domain);
  const allowed = (address: string) => access === "*" || (access ?? []).includes(address);

  const [all, ids] = await Promise.all([
    // Sans les champs lourds (html, quotedHtml), lus seulement par /api/messages/[id]
    messages.find("domain = ?", [domain]),
    identities.find("domain = ?", [domain]),
  ]);

  // Liste des boîtes, avec leurs compteurs (sur l'ensemble des messages du domaine)
  const boxes = new Map<string, Mailbox>();
  for (const i of ids.filter((i) => allowed(i.address))) boxes.set(i.address, { address: i.address, name: i.name || undefined, unread: 0, total: 0 });
  const owners = new Map<string, string[]>();
  for (const m of all) {
    const addrs = mailboxAddresses(m, domain).filter(allowed);
    // Un message sans boîte accessible n'est pas visible (sauf administrateur pour les messages sans adresse @domaine)
    if (!addrs.length && access !== "*") continue;
    owners.set(m.id, addrs);
    for (const a of addrs) {
      const box = boxes.get(a) ?? { address: a, unread: 0, total: 0 };
      box.total += 1;
      if (m.folder === "inbox" && !m.read) box.unread += 1;
      boxes.set(a, box);
    }
  }
  const scoped = all.filter((m) => owners.has(m.id) && (!mailbox || (owners.get(m.id) ?? []).includes(mailbox)));

  const counts = Object.fromEntries(FOLDERS.map((f) => [f, 0])) as FolderCounts;
  counts.starred = 0;
  counts.unread = 0;
  for (const m of scoped) {
    counts[m.folder] += 1;
    if (m.folder === "inbox" && !m.read) counts.unread += 1;
    if (m.starred && m.folder !== "trash") counts.starred += 1;
  }

  let list = scoped.filter((m) => (view === "starred" ? m.starred && m.folder !== "trash" : m.folder === view));
  if (q) {
    list = list.filter((m) =>
      [
        m.subject,
        m.from.address,
        m.from.name ?? "",
        ...[...m.to, ...m.cc, ...m.bcc].flatMap((a) => [a.address, a.name ?? ""]),
        m.text ?? "",
        ...m.attachments.map((a) => a.filename),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }
  list.sort((a, b) => (b.sentAt ?? b.updatedAt).localeCompare(a.sentAt ?? a.updatedAt));
  const mailboxes = [...boxes.values()].sort((a, b) => b.total - a.total || a.address.localeCompare(b.address));
  return Response.json({ messages: list.map(summarize), counts, mailboxes });
});
