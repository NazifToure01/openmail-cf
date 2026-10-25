-- Fonctionnalités IA (facultatives, activées par AI_PROVIDER)

-- Consommation par utilisateur et par jour (id = "<utilisateur>:<AAAA-MM-JJ>", ou "auto:<jour>"
-- pour les traitements automatiques : tri des e-mails reçus, indexation, résumé quotidien)
CREATE TABLE ai_usage (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

-- Vecteurs de la recherche par le sens : un par message, encodé en base64 (Float32)
CREATE TABLE message_embeddings (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  model TEXT NOT NULL,
  vector TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX message_embeddings_domain ON message_embeddings (domain);
