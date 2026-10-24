/** Types de l'API OpenMail CF (copie de src/lib/types.ts du serveur, à garder synchronisée) */

export type Address = { address: string; name?: string };

export type AttachmentMeta = {
  id: string;
  filename: string;
  type: string;
  size: number;
  /** Identifiant des images intégrées (cid:) d'un e-mail reçu */
  contentId?: string;
  /** Image affichée dans le corps du message (masquée de la liste des pièces jointes) */
  inline?: boolean;
};

export type Folder = "inbox" | "sent" | "drafts" | "trash";

export type SendResult = {
  delivered: string[];
  queued: string[];
  permanent_bounces: string[];
  suppressed_recipients?: string[];
  message_id?: string;
};

export type Message = {
  id: string;
  folder: Folder;
  /** Domaine d'envoi auquel appartient le message (ex. example.com) */
  domain?: string;
  /** "in" = reçu, "out" = rédigé ici (défaut) */
  direction?: "in" | "out";
  /** Lu / non lu (messages reçus) */
  read?: boolean;
  /** En-têtes de fil de discussion */
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  /** Clé du message dans le Worker de réception (évite les doublons) */
  inboundKey?: string;
  /** Adresse @domaine qui a réellement reçu le message (enveloppe SMTP, couvre les Cci) */
  deliveredTo?: string;
  /** Fichier .eml original (messages reçus) */
  rawId?: string;
  /** Dossier d'origine, pour restaurer depuis la corbeille */
  previousFolder?: Folder;
  from: Address;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  replyTo: Address | null;
  subject: string;
  /** Contenu saisi dans l'éditeur (sans signature ni citation) */
  bodyHtml: string;
  signatureId: string | null;
  /** Message cité (transfert / relance) */
  quotedHtml: string | null;
  /** Rendu final envoyé */
  html?: string;
  text?: string;
  attachments: AttachmentMeta[];
  starred: boolean;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  result?: SendResult;
  /** Statut final par destinataire, lu dans les journaux d'envoi Cloudflare */
  delivery?: Record<string, { status: string; at: string; detail?: string }>;
  /** Dernière erreur d'envoi (brouillon dont l'envoi a échoué) */
  error?: string;
};

export type MessageSummary = Pick<
  Message,
  | "id"
  | "folder"
  | "direction"
  | "read"
  | "deliveredTo"
  | "from"
  | "to"
  | "cc"
  | "bcc"
  | "subject"
  | "starred"
  | "createdAt"
  | "updatedAt"
  | "sentAt"
  | "result"
  | "error"
> & { snippet: string; attachmentCount: number };

export type Identity = {
  id: string;
  address: string;
  name: string;
  signatureId: string | null;
  isDefault: boolean;
};

export type Signature = {
  id: string;
  /** Domaine auquel la signature est rattachée */
  domain?: string;
  name: string;
  html: string;
};

export type Contact = {
  address: string;
  name?: string;
  count: number;
  lastUsedAt: string;
};

/** Données envoyées par le formulaire de rédaction */
export type ComposeInput = {
  draftId?: string | null;
  from: Address;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  replyTo: Address | null;
  subject: string;
  bodyHtml: string;
  signatureId: string | null;
  quotedHtml: string | null;
  attachmentIds: string[];
  /** Réponse à un message reçu : en-têtes In-Reply-To / References */
  inReplyTo?: string | null;
  references?: string | null;
};

export type FolderCounts = Record<Folder, number> & { starred: number; unread: number };

/** Une adresse @domaine utilisée en réception ou en envoi */
export type Mailbox = { address: string; name?: string; unread: number; total: number };

/** État de la réception d'une adresse dans Cloudflare Email Routing */
export type RoutingStatus =
  /** Une règle envoie cette adresse au Worker : réception active */
  | "worker"
  /** Le Catch-all actif envoie toutes les adresses au Worker */
  | "catchall"
  /** Une règle existe mais transfère ailleurs (Gmail…) ou est désactivée : pas dans l'app */
  | "other"
  /** Aucune règle : les e-mails envoyés à cette adresse sont refusés */
  | "none";

export type RoutingInfo = {
  configured: boolean;
  statuses: Record<string, RoutingStatus>;
  error: string | null;
};

/** Image hébergée pour les e-mails (bibliothèque « Mes images ») */
export type LibraryImage = {
  /** Nom du fichier sur le Worker : <uuid>.png|jpg|gif */
  name: string;
  url: string;
  filename: string;
  width: number;
  height: number;
  size: number;
  /** Empreinte SHA-256 du fichier hébergé, pour ne pas importer deux fois la même image */
  hash: string;
  domain: string;
  createdAt: string;
};

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  access: { domain: string; mailboxes: "*" | string[] }[];
  disabled?: boolean;
};

export type DomainOption = { name: string; reception: boolean };
