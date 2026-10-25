# OpenMail CF

**Webmail multi-domaines open source, auto-hébergé sur Cloudflare.** Envoyez et recevez les e-mails de vos propres domaines depuis une interface web, sans serveur ni base de données externe à administrer : tout tourne sur votre compte Cloudflare (Workers, D1, R2).

> 🇬🇧 *Self-hosted, multi-domain webmail running entirely on Cloudflare (Email Sending, Email Routing, Workers, D1, R2). Clone, fill in `.env` (4 values), run `npm run deploy`. The UI is in French. MIT licensed.*

- ✉️ Envoi via **Cloudflare Email Sending** (pièces jointes, CC/CCI, signatures, éditeur riche, images)
- 📥 Réception via **Cloudflare Email Routing** → un Email Worker → votre boîte de réception
- 🌐 Plusieurs domaines et plusieurs adresses par domaine, plusieurs utilisateurs avec droits par domaine
- 📊 Suivi de remise (Délivré / Rejeté) via les journaux d'envoi Cloudflare
- 🎨 Nom et logo de votre instance (favicon compris) choisis à l'installation, modifiables ensuite
- 🚀 Déploiement en **une commande**

---

## Sommaire

1. [Architecture](#architecture)
2. [Prérequis](#prérequis)
3. [Installation en 5 minutes](#installation-en-5-minutes)
4. [Créer le token Cloudflare](#créer-le-token-cloudflare)
5. [Variables de configuration](#variables-de-configuration)
6. [Ce que fait `npm run deploy`](#ce-que-fait-npm-run-deploy)
7. [Mises à jour](#mises-à-jour)
8. [Développement local](#développement-local)
9. [Personnalisation](#personnalisation)
10. [Sécurité](#sécurité)
11. [Dépannage](#dépannage)
12. [Licence](#licence)

---

## Architecture

```
                 ┌─────────────────────────── Votre compte Cloudflare ───────────────────────────┐
 Navigateur  ───►│  Worker « openmail-cf »  (Next.js via OpenNext)   https://mail.example.com    │
                 │     │  ├─ D1 « openmail-cf »        utilisateurs, messages, adresses, signatures│
                 │     │  ├─ R2 « openmail-cf-files »  pièces jointes, e-mails originaux, images  │
                 │     │  ├─ Images binding            redimensionnement des images              │
                 │     │  └─ API Email Sending         envoi des e-mails ──────────────► Internet  │
                 │     │                                                                         │
                 │     │ HTTPS + INBOX_SECRET                                                    │
                 │     ▼                                                                         │
 E-mail entrant ─┼► Email Routing ─► Worker « openmail-cf-inbox » ─► KV (file d'attente)         │
                 │                    (prévient l'app à chaque message reçu)                     │
                 └───────────────────────────────────────────────────────────────────────────────┘
```

## Prérequis

| | À préparer | Où |
|---|---|---|
| 1 | Un **compte Cloudflare** | [dash.cloudflare.com](https://dash.cloudflare.com) |
| 2 | Votre **domaine ajouté à Cloudflare** (zone active, DNS gérés par Cloudflare) | Dashboard → *Add a domain* |
| 3 | **Email Sending** activé sur le domaine (enregistrements SPF/DKIM ajoutés) | Dashboard → *Email Service* → *Email Sending* → *Onboard domain* |
| 4 | **Email Routing** activé sur le domaine (enregistrements MX ajoutés) | Dashboard → votre domaine → *Email* → *Email Routing* → *Enable* |
| 5 | **R2** activé sur le compte (l'offre gratuite suffit) | Dashboard → *R2 Object Storage* |
| 6 | Un **sous-domaine workers.dev** (créé à la première visite) | Dashboard → *Workers & Pages* |
| 7 | **Node.js 20.12+** et git | [nodejs.org](https://nodejs.org) |

La base de données (**Cloudflare D1**) est créée automatiquement par le déploiement : rien à préparer.

> **Coûts :** Workers, D1, KV, R2 et Email Routing disposent d'offres gratuites suffisantes pour un usage personnel ou une petite équipe. Avec l'offre gratuite, D1 est limité à 500 Mo par base et à un quota quotidien de lectures/écritures (au-delà, les requêtes échouent jusqu'à minuit UTC) ; l'offre *Workers Paid* lève ces limites (10 Go par base). Consultez aussi la [tarification d'Email Sending](https://developers.cloudflare.com/email-service/) pour l'envoi.

## Installation en 5 minutes

```bash
# 1. Cloner et installer
git clone https://github.com/NazifToure01/openmail-cf.git
cd openmail-cf
npm install

# 2. Configurer
cp .env.example .env
#    → remplissez les 4 variables obligatoires (voir ci-dessous)

# 3. Déployer (Worker de réception + application)
npm run deploy
```

Les 4 variables obligatoires dans `.env` :

```ini
CLOUDFLARE_API_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   # voir « Créer le token Cloudflare »
MAIL_DOMAIN=example.com                                  # ou example.com,example.org
APP_PASSWORD=un-mot-de-passe-d-installation-long         # 10 caractères minimum
SESSION_SECRET=<résultat de : openssl rand -hex 32>
```

À la fin du déploiement :

1. Ouvrez **`https://mail.example.com/setup`** (le certificat HTTPS peut prendre quelques minutes la toute première fois).
2. Saisissez `APP_PASSWORD`, puis créez le **compte administrateur** (e-mail + mot de passe personnel). Vous pouvez aussi y choisir le **nom de votre instance** et son **logo** (utilisé comme favicon).
3. Dans **Réglages → Adresses**, ajoutez vos adresses (`contact@example.com`, …). La règle Email Routing qui envoie ces adresses vers votre boîte de réception est **créée automatiquement**.
4. Écrivez votre premier e-mail. 🎉

> `APP_PASSWORD` ne sert qu'à cette première étape : une fois un compte créé, `/setup` est désactivé. Les autres utilisateurs sont invités depuis **Réglages → Utilisateurs**.

## Créer le token Cloudflare

Un seul token suffit pour déployer **et** faire fonctionner l'application.

### Étapes

1. Dashboard Cloudflare → **Manage Account → Account API Tokens** (token rattaché au compte, recommandé)
   — ou **My Profile → API Tokens** (token personnel).
2. **Create Token** → **Create Custom Token** (« Get started »).
3. Nom : `OpenMail CF`.
4. Ajoutez les permissions du tableau ci-dessous.
5. **Account Resources** : *Include* → votre compte.
   **Zone Resources** : *Include* → *Specific zone* → chacun de vos domaines de `MAIL_DOMAIN` (ou *All zones* si vous préférez).
6. *(Facultatif)* **Client IP Address Filtering** : rien à mettre (les Workers n'ont pas d'IP fixe).
7. **Continue to summary → Create Token**, puis copiez la valeur dans `CLOUDFLARE_API_TOKEN`. Elle ne sera plus affichée.

### Permissions à accorder

| Type | Permission | Niveau | Pourquoi |
|---|---|---|---|
| Account | **Workers Scripts** | Edit | Déployer les deux Workers (app + réception) et leurs secrets |
| Account | **Workers KV Storage** | Edit | Créer l'espace KV de la file d'attente des e-mails reçus |
| Account | **Workers R2 Storage** | Edit | Créer le bucket des pièces jointes |
| Account | **D1** | Edit | Créer la base de données et appliquer son schéma |
| Account | **Email Sending** | Edit | Envoyer les e-mails (API Email Sending) |
| Account | **Account Analytics** | Read | Afficher le statut final des envois (Délivré / Rejeté) |
| Account | **Account Settings** | Read | Lire les informations du compte pendant le déploiement |
| Zone | **Zone** | Read | Retrouver l'ID de zone de chaque domaine, détecter les domaines d'envoi |
| Zone | **Workers Routes** | Edit | Brancher l'app sur `mail.example.com` (domaine personnalisé + DNS + certificat) |
| Zone | **Email Routing Rules** | Edit | Créer la règle de réception quand vous ajoutez une adresse dans l'app |

> Si vous utilisez un **token personnel** (*My Profile*) et que `wrangler` réclame des droits utilisateur, ajoutez aussi *User → User Details → Read* et *User → Memberships → Read*.

> Si votre compte utilise les nouveaux rôles Workers, *Workers Scripts : Edit* correspond au rôle **Workers Admin** (nécessaire pour **créer** un Worker la première fois).

### Recommandé : séparer le token de déploiement et le token d'exécution

Le token est stocké comme secret dans le Worker de l'app, car l'app en a besoin pour envoyer des e-mails. Pour qu'une éventuelle fuite ne permette pas de redéployer vos Workers, créez un **second token**, plus restreint, et mettez-le dans `CLOUDFLARE_RUNTIME_TOKEN` :

| Type | Permission | Niveau |
|---|---|---|
| Account | Email Sending | Edit |
| Account | Account Analytics | Read |
| Zone | Zone | Read |
| Zone | Email Routing Rules | Edit |

`CLOUDFLARE_API_TOKEN` ne sert alors qu'à `npm run deploy` (sur votre machine ou votre CI) ; seul `CLOUDFLARE_RUNTIME_TOKEN` est envoyé à Cloudflare comme secret de l'app.

## Variables de configuration

Toutes se placent dans `.env` (jamais versionné). Voir `.env.example` pour le modèle commenté.

| Variable | Obligatoire | Description |
|---|:---:|---|
| `CLOUDFLARE_API_TOKEN` | ✅ | Token Cloudflare (voir ci-dessus) |
| `MAIL_DOMAIN` | ✅ | Domaine(s) d'envoi/réception, séparés par des virgules |
| `APP_PASSWORD` | ✅ | Mot de passe d'installation (création du premier admin) |
| `SESSION_SECRET` | ✅ | Clé HMAC des sessions, 32+ caractères (`openssl rand -hex 32`) |
| `APP_HOSTNAME` | | Adresse de l'app. Défaut : `mail.<premier domaine>` |
| `PROJECT_NAME` | | Préfixe des Workers / base D1 / bucket / KV. Défaut : `openmail-cf` |
| `CLOUDFLARE_ACCOUNT_ID` | | Seulement si le token donne accès à plusieurs comptes |
| `CLOUDFLARE_RUNTIME_TOKEN` | | Token restreint utilisé par l'app en production |
| `CLOUDFLARE_ANALYTICS_TOKEN` | | Token séparé pour le suivi de remise |
| `CLOUDFLARE_ROUTING_TOKEN` | | Token séparé pour les règles Email Routing |
| `CATCH_ALL` | | `true` : toutes les adresses inconnues du domaine arrivent dans l'app |
| `FORWARD_TO` | | Copie de chaque e-mail reçu vers cette adresse (à vérifier dans Email Routing → *Destination addresses*) |
| `BRAND_ASSETS_URL` | | URL publique des logos insérables dans les e-mails |

## Ce que fait `npm run deploy`

Le script [`scripts/deploy.mjs`](scripts/deploy.mjs) est **idempotent** : relancez-le autant de fois que nécessaire.

1. **Vérifie** `.env` (variables présentes, `SESSION_SECRET` assez long, `APP_PASSWORD` assez fort).
2. **Retrouve** votre compte, l'ID de zone de chaque domaine et votre sous-domaine `workers.dev` ; signale si Email Sending ou Email Routing ne sont pas activés.
3. **Crée si besoin** l'espace KV `openmail-cf-inbox`, le bucket R2 `openmail-cf-files` et la base D1 `openmail-cf`, puis **applique les migrations** SQL du dossier [`migrations/`](migrations/) qui ne l'ont pas encore été.
4. **Génère** `INBOX_SECRET` (secret partagé entre l'app et le Worker de réception), conservé dans `.deploy/state.json`.
5. **Déploie le Worker de réception** `openmail-cf-inbox` (dossier `worker/`).
6. **Compile l'app** Next.js avec OpenNext puis la **déploie** sur `https://<APP_HOSTNAME>` ; Cloudflare crée l'enregistrement DNS et le certificat.
7. Envoie les valeurs sensibles comme **secrets Wrangler** chiffrés (jamais dans le code déployé).

Les fichiers `wrangler.deploy.jsonc` et `worker/wrangler.deploy.json` sont générés à chaque déploiement et ignorés par git.

Commandes partielles :

```bash
npm run deploy:inbox   # Worker de réception seulement
npm run deploy:app     # application seulement
```

## Mises à jour

```bash
git pull
npm install
npm run deploy
```

Vos données (D1, R2) et votre `INBOX_SECRET` sont conservés ; les nouvelles migrations du schéma sont appliquées automatiquement.

## Développement local

```bash
cp .env.example .env     # ou réutilisez celui du déploiement
npm run db:migrate:local # crée les tables dans la base D1 locale (.wrangler/state)
npm run dev              # http://localhost:3000
```

En local, l'app lit directement `.env` et utilise une base D1 simulée (aucune donnée de production). Pour tester la réception, renseignez aussi `INBOX_WORKER_URL` et `INBOX_SECRET` (valeur dans `.deploy/state.json`) et, pour les règles de réception, `MAIL_DOMAINS=example.com=<zone id>`. Les bindings D1, R2 et Images sont simulés localement grâce à `wrangler.jsonc`.

Worker de réception en local :

```bash
cd worker && npm install && npx wrangler dev
```

## Personnalisation

- **Nom et logo de l'instance** : choisis lors de l'installation (`/setup`), puis modifiables par un administrateur dans **Réglages → Apparence**, sans redéployer. Le logo (PNG, JPEG ou WebP, idéalement carré 512 × 512 px) est redimensionné par le binding Images et stocké dans R2 ; il sert de favicon, d'icône d'écran d'accueil (iOS / Android), de logo des pages de connexion et de l'en-tête, et peut être inséré dans les e-mails depuis l'éditeur. Sans logo personnalisé, l'icône par défaut (`public/default-icon.svg`, `public/default-apple-icon.png`) est utilisée.
- **Logos insérables dans les e-mails** : remplacez les PNG de `worker/public/brand/` (`logo.png`, `logo-dark.png`, `symbol.png`, `icon.png`) en gardant les mêmes noms, puis `npm run deploy:inbox`.
- **Couleurs** : variables CSS dans `src/app/globals.css`.

## Sécurité

- `.env`, `.deploy/` et les configurations générées sont exclus de git. **Ne publiez jamais votre `.env`.**
- Les secrets sont transmis à Cloudflare via un fichier temporaire (`--secrets-file`) supprimé aussitôt ; le script vide aussi le fichier `.open-next/cloudflare/next-env.mjs` où OpenNext recopierait sinon le contenu de `.env`.
- Mots de passe hachés en PBKDF2-SHA256, sessions signées HMAC-SHA256 (révocables par utilisateur).
- L'API du Worker de réception est protégée par `INBOX_SECRET` (comparaison en temps constant) ; seules les images des e-mails et les logos sont publics (le logo de l'instance est servi publiquement sur `/brand/icon.png`).
- Utilisez de préférence un [token d'exécution restreint](#recommandé--séparer-le-token-de-déploiement-et-le-token-dexécution).
- Pour signaler une faille, ouvrez une *security advisory* privée sur le dépôt GitHub plutôt qu'une issue publique.

## Dépannage

| Message | Solution |
|---|---|
| `Token refusé par Cloudflare` | Token mal copié, expiré ou révoqué. |
| `… permission « X »` | Ajoutez la permission indiquée au token (*Edit token*), puis relancez. |
| `Le domaine … est introuvable sur ce compte` | Le domaine n'est pas sur ce compte Cloudflare, ou n'est pas dans les *Zone Resources* du token. |
| `Aucun sous-domaine workers.dev` | Ouvrez *Workers & Pages* une fois dans le dashboard pour le créer. |
| Erreur R2 `10042` | Activez R2 dans le dashboard (*R2 Object Storage*). |
| Erreur sur le domaine personnalisé / `mail.example.com` existe déjà | Un enregistrement DNS `mail` existe déjà : supprimez-le ou choisissez un autre `APP_HOSTNAME`. |
| `Sender denied` à l'envoi | Le domaine n'est pas *onboardé* dans Email Sending. |
| Rien n'arrive dans la boîte de réception | Email Routing activé ? L'adresse a-t-elle été ajoutée dans *Réglages → Adresses* (ou `CATCH_ALL=true`) ? Journaux : *Workers & Pages → openmail-cf-inbox → Logs*. |
| `no such table` | Le schéma n'est pas appliqué : relancez `npm run deploy` (ou `npm run db:migrate:local` en local). |
| `exceeded D1's free tier daily row read/write limit` | Quota gratuit D1 du jour atteint : attendez minuit UTC ou passez à *Workers Paid*. |

Journaux en direct : `npx wrangler tail openmail-cf` (ou `openmail-cf-inbox`).

## Licence

[MIT](LICENSE) — utilisez, modifiez et redistribuez librement, y compris à des fins commerciales, en conservant la notice de licence.

Les contributions sont les bienvenues : ouvrez une issue ou une pull request.
