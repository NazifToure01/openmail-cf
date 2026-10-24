import { refreshDeliveries } from "@/lib/delivery";
import { handler } from "@/lib/server";

/** Met à jour le statut final des envois encore « en file d'attente » */
export const POST = handler(async () => Response.json(await refreshDeliveries()));
