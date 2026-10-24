import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Base de données Cloudflare D1 (binding DB). En local, `next dev` simule D1 grâce à
 * initOpenNextCloudflareForDev (tables créées par `npm run db:migrate:local`).
 *
 * Chaque table stocke un document JSON par ligne (colonne `data`) ; les champs utilisés dans
 * les filtres sont exposés en colonnes générées et indexées (voir migrations/). Les requêtes
 * filtrent donc sur ces colonnes en SQL, et les documents renvoyés ont la même forme qu'avant.
 */

type D1Result<T> = { results: T[]; meta: { changes: number } };
type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1Result<unknown>>;
};
export type D1Like = {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1Result<unknown>[]>;
};

export async function database(): Promise<D1Like> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as { DB?: D1Like }).DB;
  if (!db) throw new Error("La base de données (binding D1 « DB ») n'est pas configurée");
  return db;
}

/** Violation d'unicité (adresse, e-mail ou message reçu déjà enregistrés) */
export class DuplicateError extends Error {}

const isDuplicate = (err: unknown) => /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(String((err as Error)?.message ?? err));

async function exec<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isDuplicate(err)) throw new DuplicateError((err as Error).message);
    throw err;
  }
}

/** Modification partielle d'un document : champs remplacés, retirés ou incrémentés */
export type Change<T> = {
  set?: Partial<T>;
  unset?: (keyof T & string)[];
  inc?: Partial<Record<keyof T & string, number>>;
};

// D1 : 32 arguments au plus par fonction SQL, 100 paramètres liés par requête
const PAIRS_PER_CALL = 15;
const path = (field: string) => `$."${field.replace(/"/g, "")}"`;

/** Expression SQL qui applique `change` à la colonne data */
function changeExpression<T>(change: Change<T>): { sql: string; params: unknown[] } {
  let sql = "data";
  const params: unknown[] = [];
  // Comme ignoreUndefined de MongoDB : un champ `undefined` n'est pas modifié
  const set = Object.entries(change.set ?? {}).filter(([, v]) => v !== undefined);
  for (let i = 0; i < set.length; i += PAIRS_PER_CALL) {
    const chunk = set.slice(i, i + PAIRS_PER_CALL);
    sql = `json_set(${sql}, ${chunk.map(() => "?, json(?)").join(", ")})`;
    for (const [k, v] of chunk) params.push(path(k), JSON.stringify(v));
  }
  for (const [k, n] of Object.entries(change.inc ?? {}) as [string, number][]) {
    sql = `json_set(${sql}, ?, coalesce(json_extract(data, ?), 0) + ?)`;
    params.push(path(k), path(k), n);
  }
  if (change.unset?.length) {
    sql = `json_remove(${sql}, ${change.unset.map(() => "?").join(", ")})`;
    params.push(...change.unset.map(path));
  }
  return { sql, params };
}

const parse = <T,>(row: { data: string } | null): T | null => (row ? (JSON.parse(row.data) as T) : null);

export type TableOptions<T> = {
  /** Champ qui sert de clé primaire (colonne id) */
  key: keyof T & string;
  /**
   * Champs volumineux stockés à part, en morceaux, dans la table <nom>_bodies (une ligne D1 est
   * limitée à 2 Mo). Ils ne sont relus que par get(id, { bodies: true }).
   */
  bodies?: (keyof T & string)[];
  /** Longueur maximale conservée pour certains champs texte (aperçu et recherche) */
  truncate?: Partial<Record<keyof T & string, number>>;
};

// 500 000 caractères UTF-16 : au plus ~1,5 Mo en UTF-8, sous la limite de 2 Mo par ligne
const CHUNK = 500_000;

export class Table<T extends object> {
  constructor(
    readonly name: string,
    private readonly options: TableOptions<T>,
  ) {}

  private get bodiesTable() {
    return `${this.name}_bodies`;
  }

  /** Sépare les champs volumineux du document et applique les troncatures */
  private split(doc: Partial<T>): { data: Partial<T>; bodies: [string, string | null][] } {
    const data = { ...doc } as Record<string, unknown>;
    const bodies: [string, string | null][] = [];
    for (const field of this.options.bodies ?? []) {
      if (!(field in data)) continue;
      const value = data[field];
      delete data[field];
      if (value !== undefined) bodies.push([field, (value as string | null) ?? null]);
    }
    for (const [field, max] of Object.entries(this.options.truncate ?? {}) as [string, number][]) {
      if (typeof data[field] === "string" && (data[field] as string).length > max) data[field] = (data[field] as string).slice(0, max);
    }
    return { data: data as Partial<T>, bodies };
  }

  private bodyStatements(db: D1Like, id: string, bodies: [string, string | null][]): D1Statement[] {
    const statements: D1Statement[] = [];
    for (const [field, value] of bodies) {
      statements.push(db.prepare(`DELETE FROM ${this.bodiesTable} WHERE id = ? AND field = ?`).bind(id, field));
      if (value === null) continue;
      for (let seq = 0; seq * CHUNK < value.length; seq++) {
        statements.push(
          db
            .prepare(`INSERT INTO ${this.bodiesTable} (id, field, seq, chunk) VALUES (?, ?, ?, ?)`)
            .bind(id, field, seq, value.slice(seq * CHUNK, (seq + 1) * CHUNK)),
        );
      }
    }
    return statements;
  }

  /** Document par sa clé ; `bodies: true` ajoute les champs volumineux */
  async get(id: string, { bodies = false } = {}): Promise<T | null> {
    const db = await database();
    const doc = parse<T>(await db.prepare(`SELECT data FROM ${this.name} WHERE id = ?`).bind(id).first<{ data: string }>());
    if (!doc || !bodies || !this.options.bodies?.length) return doc;
    const { results } = await db
      .prepare(`SELECT field, chunk FROM ${this.bodiesTable} WHERE id = ? ORDER BY field, seq`)
      .bind(id)
      .all<{ field: string; chunk: string }>();
    const record = doc as Record<string, unknown>;
    for (const field of this.options.bodies) record[field] = null;
    for (const r of results) record[r.field] = ((record[r.field] as string | null) ?? "") + r.chunk;
    return doc;
  }

  /** Documents filtrés : `where` porte sur les colonnes de la table, `tail` ajoute ORDER BY / LIMIT */
  async find(where = "1 = 1", params: unknown[] = [], tail = ""): Promise<T[]> {
    const db = await database();
    const { results } = await db
      .prepare(`SELECT data FROM ${this.name} WHERE ${where} ${tail}`)
      .bind(...params)
      .all<{ data: string }>();
    return results.map((r) => JSON.parse(r.data) as T);
  }

  async first(where: string, params: unknown[] = []): Promise<T | null> {
    return (await this.find(where, params, "LIMIT 1"))[0] ?? null;
  }

  async count(where = "1 = 1", params: unknown[] = []): Promise<number> {
    const db = await database();
    const row = await db.prepare(`SELECT count(*) AS n FROM ${this.name} WHERE ${where}`).bind(...params).first<{ n: number }>();
    return row?.n ?? 0;
  }

  /** Ajoute un document ; DuplicateError si la clé ou un champ unique existe déjà */
  async insert(doc: T): Promise<void> {
    const db = await database();
    const id = String(doc[this.options.key]);
    const { data, bodies } = this.split(doc);
    await exec(() =>
      db.batch([
        db.prepare(`INSERT INTO ${this.name} (id, data) VALUES (?, ?)`).bind(id, JSON.stringify(data)),
        ...this.bodyStatements(db, id, bodies),
      ]),
    );
  }

  /** Ajoute ou remplace entièrement un document */
  async put(doc: T): Promise<void> {
    const db = await database();
    const id = String(doc[this.options.key]);
    const { data, bodies } = this.split(doc);
    await exec(() =>
      db.batch([
        db
          .prepare(`INSERT INTO ${this.name} (id, data) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET data = excluded.data`)
          .bind(id, JSON.stringify(data)),
        ...this.bodyStatements(db, id, bodies),
      ]),
    );
  }

  /** Modifie un document (éventuellement sous condition `where`) ; renvoie sa nouvelle version, ou null s'il n'existe pas */
  async update(id: string, change: Change<T>, where = "1 = 1", params: unknown[] = []): Promise<T | null> {
    const db = await database();
    const { data: set, bodies } = this.split(change.set ?? {});
    const expr = changeExpression({ ...change, set });
    const statement = db
      .prepare(`UPDATE ${this.name} SET data = ${expr.sql} WHERE id = ? AND (${where}) RETURNING data`)
      .bind(...expr.params, id, ...params);
    const [result] = await exec(() => db.batch([statement]));
    const doc = parse<T>((result.results[0] as { data: string } | undefined) ?? null);
    if (doc && bodies.length) await db.batch(this.bodyStatements(db, id, bodies));
    return doc;
  }

  /** Modifie tous les documents filtrés (champs non volumineux uniquement) ; renvoie leur nombre */
  async updateWhere(where: string, params: unknown[], change: Change<T>): Promise<number> {
    const db = await database();
    const expr = changeExpression({ ...change, set: this.split(change.set ?? {}).data });
    const result = await exec(() =>
      db.prepare(`UPDATE ${this.name} SET data = ${expr.sql} WHERE ${where}`).bind(...expr.params, ...params).run(),
    );
    return result.meta.changes;
  }

  /** Supprime un document (éventuellement sous condition `where`) ; renvoie le document supprimé */
  async remove(id: string, where = "1 = 1", params: unknown[] = []): Promise<T | null> {
    const db = await database();
    const doc = parse<T>(
      await db.prepare(`DELETE FROM ${this.name} WHERE id = ? AND (${where}) RETURNING data`).bind(id, ...params).first<{ data: string }>(),
    );
    if (doc && this.options.bodies?.length) await db.prepare(`DELETE FROM ${this.bodiesTable} WHERE id = ?`).bind(id).run();
    return doc;
  }

  /** Supprime les documents filtrés ; renvoie leur nombre */
  async removeWhere(where: string, params: unknown[] = []): Promise<number> {
    const db = await database();
    const statements = [db.prepare(`DELETE FROM ${this.name} WHERE ${where}`).bind(...params)];
    if (this.options.bodies?.length) {
      statements.unshift(
        db.prepare(`DELETE FROM ${this.bodiesTable} WHERE id IN (SELECT id FROM ${this.name} WHERE ${where})`).bind(...params),
      );
    }
    const results = await db.batch(statements);
    return results[results.length - 1].meta.changes;
  }
}

/** Marqueurs « ?, ?, ? » pour une liste IN (…) */
export const placeholders = (values: unknown[]) => values.map(() => "?").join(", ");
