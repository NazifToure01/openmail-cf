import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, tokenFromRequest, verifySessionToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protection CSRF : les requêtes qui modifient des données doivent venir de l'app elle-même
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (origin && new URL(origin).host !== host) {
      return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
    }
  }

  // Session : cookie (web) ou « Authorization: Bearer » (clients API). L'utilisateur est revérifié par l'API.
  const authenticated = await verifySessionToken(tokenFromRequest(request.headers, request.cookies.get(SESSION_COOKIE)?.value));
  const isPublic =
    pathname === "/login" ||
    pathname === "/setup" ||
    pathname.startsWith("/api/auth/") ||
    // Appel du Worker de réception (protégé par INBOX_SECRET)
    pathname === "/api/inbox/hook" ||
    // Résumé quotidien déclenché par la tâche planifiée du Worker (protégé par INBOX_SECRET)
    pathname === "/api/ai/digest" ||
    pathname === "/api/health" ||
    // Images des e-mails et logos : lues par les clients mail des destinataires
    pathname.startsWith("/img/") ||
    pathname.startsWith("/brand/");

  if (isPublic) {
    if (authenticated && pathname === "/login") return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }
  if (!authenticated) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|jpg|jpeg|webp)$).*)"],
};
