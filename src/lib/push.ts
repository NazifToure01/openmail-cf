import "server-only";
import { canSeeMessage, type SessionUser } from "./session";
import { placeholders } from "./db";
import { pushTokens, users } from "./store";
import type { Message } from "./types";

/**
 * Notifications push (service Expo) : à l'arrivée d'un e-mail, chaque personne qui a accès
 * à la boîte concernée reçoit l'expéditeur et l'objet.
 */

type ExpoTicket = { status: "ok" | "error"; details?: { error?: string } };

export async function notifyNewMessages(list: Message[]) {
  if (!list.length) return;
  const [allUsers, tokens] = await Promise.all([
    users.find("disabled = 0"),
    pushTokens.find(),
  ]);
  if (!tokens.length) return;

  const notifications: { to: string; title: string; body: string; data: Record<string, string>; sound: "default" }[] = [];
  for (const m of list) {
    const recipients = new Set(allUsers.filter((u) => canSeeMessage(u as SessionUser, m)).map((u) => u.id));
    for (const t of tokens) {
      if (!recipients.has(t.userId)) continue;
      notifications.push({
        to: t.token,
        title: m.from.name || m.from.address,
        body: m.subject || "(sans objet)",
        data: { messageId: m.id, domain: m.domain ?? "", mailbox: m.deliveredTo ?? "" },
        sound: "default",
      });
    }
  }

  const stale: string[] = [];
  for (let i = 0; i < notifications.length; i += 100) {
    const chunk = notifications.slice(i, i + 100);
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(chunk),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { data?: ExpoTicket[] } | null;
    json?.data?.forEach((ticket, j) => {
      if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") stale.push(chunk[j].to);
    });
  }
  // Appareils désinstallés : jetons supprimés
  for (let i = 0; i < stale.length; i += 90) {
    const chunk = stale.slice(i, i + 90);
    await pushTokens.removeWhere(`id IN (${placeholders(chunk)})`, chunk);
  }
}
