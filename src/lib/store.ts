import "server-only";
import { Table } from "./db";
import type { AttachmentMeta, Contact, Identity, LibraryImage, Message, Signature } from "./types";

/**
 * Tables D1 (schéma dans migrations/). Chaque document garde son identifiant applicatif
 * (`id`, `address`…), qui sert aussi de clé primaire, pour que l'API renvoie les mêmes objets.
 */

export type StoredAttachment = AttachmentMeta & { createdAt: string };

/** Personnalisation de l'instance (document unique « branding ») */
export type BrandingSetting = { id: "branding"; name?: string; logoVersion?: string | null; updatedAt: string };

/** Réglages des fonctionnalités IA (document unique « ai ») */
export type AiSetting = {
  id: "ai";
  features: Record<"compose" | "summary" | "triage" | "search", boolean>;
  /** Appels IA par utilisateur et par jour */
  dailyLimit: number;
  digest: { enabled: boolean; hour: number; timeZone: string; lastSentDay?: string };
  updatedAt: string;
};

export type AiUsage = { id: string; count: number; day: string };

export type User = {
  id: string;
  email: string;
  name: string;
  /** PBKDF2-SHA256 : "pbkdf2$<itérations>$<sel base64>$<hash base64>" */
  passwordHash: string;
  role: "admin" | "member";
  /** Accès par domaine : "*" = toutes les boîtes du domaine, sinon liste d'adresses */
  access: { domain: string; mailboxes: "*" | string[] }[];
  /** Incrémenté pour révoquer toutes les sessions de l'utilisateur */
  tokenVersion: number;
  disabled?: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Le rendu HTML et la citation sont stockés à part (lus seulement pour afficher un message) */
export const messages = new Table<Message>("messages", {
  key: "id",
  bodies: ["html", "quotedHtml"],
  // Le texte ne sert qu'à l'aperçu et à la recherche
  truncate: { text: 20_000 },
});
export const identities = new Table<Identity>("identities", { key: "id" });
export const signatures = new Table<Signature>("signatures", { key: "id" });
export const contacts = new Table<Contact>("contacts", { key: "address" });
export const attachments = new Table<StoredAttachment>("attachments", { key: "id" });
export const images = new Table<LibraryImage>("images", { key: "name" });
export const users = new Table<User>("users", { key: "id" });
export const settings = new Table<BrandingSetting>("settings", { key: "id" });
export const aiSettings = new Table<AiSetting>("settings", { key: "id" });
export const aiUsage = new Table<AiUsage>("ai_usage", { key: "id" });
