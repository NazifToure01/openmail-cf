/** Nom affiché de l'application (NEXT_PUBLIC_APP_NAME, lu au moment du build) */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "OpenMail CF";

/**
 * Logos utilisables dans les e-mails, servis publiquement par le Worker (dossier worker/public/brand).
 * Remplacez ces fichiers PNG par les vôtres en gardant les mêmes noms, puis redéployez.
 */
export const BRAND_ASSETS = [
  { file: "logo.png", label: "Logo", hint: "Pour fond clair", width: 160, preview: "light" },
  { file: "logo-dark.png", label: "Logo fond sombre", hint: "Bandeau sombre", width: 160, preview: "dark" },
  { file: "symbol.png", label: "Symbole", hint: "Sans le nom", width: 48, preview: "light" },
  { file: "icon.png", label: "Icône", hint: "Carré arrondi", width: 48, preview: "light" },
] as const;

export const BRAND_COLORS = { navy: "#101C3B", orange: "#F5A524", paper: "#F7F7F5" };
