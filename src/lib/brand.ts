/** Nom par défaut de l'instance (modifiable dans Réglages → Apparence) */
export const DEFAULT_APP_NAME = "OpenMail CF";
export const APP_NAME_MAX = 40;

/** Personnalisation de l'instance, choisie à l'installation puis dans Réglages → Apparence */
export type Branding = {
  name: string;
  /** Version du logo personnalisé (horodatage), null pour le logo par défaut */
  logoVersion: string | null;
};

export const DEFAULT_BRANDING: Branding = { name: DEFAULT_APP_NAME, logoVersion: null };

/** URL du favicon (512 px) et de l'icône iOS (180 px) ; la version invalide le cache du navigateur */
export const brandIconUrl = (b: Branding, file: "icon.png" | "apple-icon.png" = "icon.png") =>
  b.logoVersion ? `/brand/${file}?v=${encodeURIComponent(b.logoVersion)}` : file === "icon.png" ? "/default-icon.svg" : "/default-apple-icon.png";

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
