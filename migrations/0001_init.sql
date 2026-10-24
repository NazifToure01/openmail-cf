-- Schéma initial d'OpenMail CF (Cloudflare D1 / SQLite).
-- Chaque table stocke un document JSON (data) ; les champs filtrés sont des colonnes générées indexées.
-- Appliqué par `npm run deploy` (distant) ou `npm run db:migrate:local` (développement).

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  domain TEXT GENERATED ALWAYS AS (json_extract(data, '$.domain')) VIRTUAL,
  folder TEXT GENERATED ALWAYS AS (json_extract(data, '$.folder')) VIRTUAL,
  direction TEXT GENERATED ALWAYS AS (json_extract(data, '$.direction')) VIRTUAL,
  sent_at TEXT GENERATED ALWAYS AS (json_extract(data, '$.sentAt')) VIRTUAL,
  inbound_key TEXT GENERATED ALWAYS AS (json_extract(data, '$.inboundKey')) VIRTUAL,
  raw_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.rawId')) VIRTUAL,
  send_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.result.message_id')) VIRTUAL
);
CREATE INDEX messages_domain_folder ON messages (domain, folder, sent_at);
CREATE UNIQUE INDEX messages_inbound_key ON messages (inbound_key);
CREATE INDEX messages_sent_at ON messages (sent_at);

-- Champs volumineux des messages (html, quotedHtml), découpés en morceaux de 500 000 caractères
CREATE TABLE messages_bodies (
  id TEXT NOT NULL,
  field TEXT NOT NULL,
  seq INTEGER NOT NULL,
  chunk TEXT NOT NULL,
  PRIMARY KEY (id, field, seq)
);

CREATE TABLE identities (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  address TEXT GENERATED ALWAYS AS (json_extract(data, '$.address')) VIRTUAL,
  domain TEXT GENERATED ALWAYS AS (lower(substr(json_extract(data, '$.address'), instr(json_extract(data, '$.address'), '@') + 1))) VIRTUAL,
  signature_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.signatureId')) VIRTUAL
);
CREATE UNIQUE INDEX identities_address ON identities (address);
CREATE INDEX identities_domain ON identities (domain);

CREATE TABLE signatures (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  domain TEXT GENERATED ALWAYS AS (json_extract(data, '$.domain')) VIRTUAL
);
CREATE INDEX signatures_domain ON signatures (domain);

-- id = adresse e-mail
CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  name TEXT GENERATED ALWAYS AS (json_extract(data, '$.name')) VIRTUAL,
  count INTEGER GENERATED ALWAYS AS (json_extract(data, '$.count')) VIRTUAL,
  last_used_at TEXT GENERATED ALWAYS AS (json_extract(data, '$.lastUsedAt')) VIRTUAL
);
CREATE INDEX contacts_rank ON contacts (count DESC, last_used_at DESC);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at TEXT GENERATED ALWAYS AS (json_extract(data, '$.createdAt')) VIRTUAL
);
CREATE INDEX attachments_created_at ON attachments (created_at);

-- id = nom du fichier hébergé
CREATE TABLE images (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  domain TEXT GENERATED ALWAYS AS (json_extract(data, '$.domain')) VIRTUAL,
  hash TEXT GENERATED ALWAYS AS (json_extract(data, '$.hash')) VIRTUAL,
  created_at TEXT GENERATED ALWAYS AS (json_extract(data, '$.createdAt')) VIRTUAL
);
CREATE INDEX images_domain_hash ON images (domain, hash);
CREATE INDEX images_domain_created_at ON images (domain, created_at);

-- id = adresse e-mail
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  name TEXT GENERATED ALWAYS AS (json_extract(data, '$.name')) VIRTUAL,
  disabled INTEGER GENERATED ALWAYS AS (coalesce(json_extract(data, '$.disabled'), 0)) VIRTUAL
);

-- id = jeton Expo de l'appareil
CREATE TABLE push_tokens (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  user_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.userId')) VIRTUAL
);
CREATE INDEX push_tokens_user_id ON push_tokens (user_id);
