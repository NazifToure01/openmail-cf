/** Erreur renvoyée telle quelle au client (statut HTTP + message + code optionnel) */
export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}
