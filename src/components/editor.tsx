"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Code,
  Heading1,
  Heading2,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  Loader2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Trash2,
  Underline,
  Undo2,
  Unlink,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BRAND_ASSETS, brandIconUrl } from "@/lib/brand";
import { AppIcon, useBrandAssetsUrl, useBranding } from "./brand";
import { api, uploadImage } from "@/lib/api";
import type { LibraryImage } from "@/lib/types";
import { Button, Field, IconButton, Modal, cn, inputClass, useToast } from "./ui";

const TEXT_COLORS = ["#111827", "#6b7280", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777"];
const BG_COLORS = ["#fef08a", "#bbf7d0", "#bae6fd", "#fbcfe8", "#fed7aa", "#e9d5ff", "#e5e7eb"];
const FONT_SIZES = [
  { label: "Petit", value: "12px" },
  { label: "Normal", value: "" },
  { label: "Grand", value: "18px" },
  { label: "Très grand", value: "24px" },
];

export function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return "";
  if (/^(https?:|mailto:|tel:)/i.test(url)) return url;
  if (/^[^\s@/]+@[^\s@]+\.[^\s@]+$/.test(url)) return `mailto:${url}`;
  if (/^\+?[\d\s().-]{6,}$/.test(url)) return `tel:${url.replace(/[^\d+]/g, "")}`;
  return `https://${url.replace(/^\/+/, "")}`;
}

export function RichEditor({
  value,
  onChange,
  placeholder,
  minHeight = 220,
  autoFocus,
  onReady,
  footer,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  autoFocus?: boolean;
  onReady?: (editor: Editor) => void;
  footer?: ReactNode;
  className?: string;
}) {
  const toast = useToast();
  const onChangeRef = useRef(onChange);
  const onPasteImageRef = useRef<((file: File) => void) | null>(null);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? "start" : false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { rel: "noopener noreferrer" } },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ inline: false, allowBase64: false }),
      TextStyleKit.configure({ fontFamily: false, lineHeight: false }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value,
    editorProps: {
      attributes: { class: "mail-content px-4 py-3", style: `min-height:${minHeight}px` },
      // Image collée (capture d'écran, copie depuis un site…) : hébergée puis insérée
      handlePaste: (view, event) => {
        const image = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
        if (!image) return false;
        event.preventDefault();
        onPasteImageRef.current?.(image);
        return true;
      },
    },
    onUpdate: ({ editor }) => onChangeRef.current(editor.isEmpty ? "" : editor.getHTML()),
  });

  useEffect(() => {
    if (editor && onReady) onReady(editor);
  }, [editor, onReady]);

  useEffect(() => {
    onPasteImageRef.current = (file) => {
      if (!editor) return;
      toast("Envoi de l'image…", "info");
      uploadImage(file)
        .then((img) => editor.chain().focus().setImage({ src: img.url, alt: "", width: displayWidth(img.width) }).run())
        .catch((err: Error) => toast(err.message, "error"));
    };
  }, [editor, toast]);

  // L'option autofocus de Tiptap est ignorée quand l'éditeur est créé après le montage
  useEffect(() => {
    if (editor && autoFocus) requestAnimationFrame(() => editor.commands.focus("start"));
  }, [editor, autoFocus]);

  // Synchronise une valeur modifiée de l'extérieur (ex : changement de signature éditée)
  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (value !== current) editor.commands.setContent(value || "", { emitUpdate: false });
  }, [editor, value]);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {/* Monté seulement quand l'éditeur existe : useEditorState ne suit pas un passage de null à une instance */}
      {editor ? <Toolbar editor={editor} /> : <div className="h-10 border-b border-line" />}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
        {footer}
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const brandUrl = useBrandAssetsUrl();
  const { logoVersion } = useBranding();
  const [palette, setPalette] = useState<"text" | "bg" | null>(null);

  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => (!e ? null : {
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      left: e.isActive({ textAlign: "left" }),
      center: e.isActive({ textAlign: "center" }),
      right: e.isActive({ textAlign: "right" }),
      fontSize: (e.getAttributes("textStyle").fontSize as string | undefined) ?? "",
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  if (!s) return <div className="h-10 border-b border-line" />;

  const chain = () => editor.chain().focus();

  return (
    <>
      <div
        className="relative flex flex-wrap items-center gap-0.5 border-b border-line px-2 py-1"
        onMouseDown={(e) => {
          // Garde la sélection de l'éditeur quand on clique sur la barre
          if ((e.target as HTMLElement).closest("button")) e.preventDefault();
        }}
      >
        <IconButton label="Annuler (⌘Z)" onClick={() => chain().undo().run()} disabled={!s.canUndo}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton label="Rétablir (⇧⌘Z)" onClick={() => chain().redo().run()} disabled={!s.canRedo}>
          <Redo2 size={16} />
        </IconButton>
        <Sep />
        <select
          aria-label="Taille du texte"
          value={s.fontSize}
          onChange={(e) => (e.target.value ? chain().setFontSize(e.target.value).run() : chain().unsetFontSize().run())}
          className="h-8 rounded-md bg-transparent px-1.5 text-[13px] text-muted outline-none hover:bg-hover"
        >
          {FONT_SIZES.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <Sep />
        <IconButton label="Gras (⌘B)" active={s.bold} onClick={() => chain().toggleBold().run()}>
          <Bold size={16} />
        </IconButton>
        <IconButton label="Italique (⌘I)" active={s.italic} onClick={() => chain().toggleItalic().run()}>
          <Italic size={16} />
        </IconButton>
        <IconButton label="Souligné (⌘U)" active={s.underline} onClick={() => chain().toggleUnderline().run()}>
          <Underline size={16} />
        </IconButton>
        <IconButton label="Barré" active={s.strike} onClick={() => chain().toggleStrike().run()}>
          <Strikethrough size={16} />
        </IconButton>
        <div className="relative">
          <IconButton label="Couleur du texte" active={palette === "text"} onClick={() => setPalette(palette === "text" ? null : "text")}>
            <Baseline size={16} />
          </IconButton>
          {palette === "text" && (
            <Palette
              colors={TEXT_COLORS}
              onPick={(c) => {
                if (c) chain().setColor(c).run();
                else chain().unsetColor().run();
                setPalette(null);
              }}
            />
          )}
        </div>
        <div className="relative">
          <IconButton label="Surlignage" active={palette === "bg"} onClick={() => setPalette(palette === "bg" ? null : "bg")}>
            <Highlighter size={16} />
          </IconButton>
          {palette === "bg" && (
            <Palette
              colors={BG_COLORS}
              onPick={(c) => {
                if (c) chain().setBackgroundColor(c).run();
                else chain().unsetBackgroundColor().run();
                setPalette(null);
              }}
            />
          )}
        </div>
        <Sep />
        <IconButton label="Lien (⌘K)" active={s.link} onClick={() => setLinkOpen(true)}>
          <Link2 size={16} />
        </IconButton>
        {s.link && (
          <IconButton label="Retirer le lien" onClick={() => chain().extendMarkRange("link").unsetLink().run()}>
            <Unlink size={16} />
          </IconButton>
        )}
        <IconButton label="Insérer une image" onClick={() => setImageOpen(true)}>
          <ImagePlus size={16} />
        </IconButton>
        {(brandUrl || logoVersion) && (
          <IconButton label="Insérer un logo" onClick={() => setBrandOpen(true)}>
            <AppIcon className="h-4 w-4" />
          </IconButton>
        )}
        <Sep />
        <IconButton label="Titre" active={s.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}>
          <Heading1 size={16} />
        </IconButton>
        <IconButton label="Sous-titre" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
          <Heading2 size={16} />
        </IconButton>
        <IconButton label="Liste à puces" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
          <List size={16} />
        </IconButton>
        <IconButton label="Liste numérotée" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
          <ListOrdered size={16} />
        </IconButton>
        <IconButton label="Citation" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
          <Quote size={16} />
        </IconButton>
        <IconButton label="Code" active={s.code} onClick={() => chain().toggleCode().run()}>
          <Code size={16} />
        </IconButton>
        <Sep />
        <IconButton label="Aligner à gauche" active={s.left} onClick={() => chain().setTextAlign("left").run()}>
          <AlignLeft size={16} />
        </IconButton>
        <IconButton label="Centrer" active={s.center} onClick={() => chain().setTextAlign("center").run()}>
          <AlignCenter size={16} />
        </IconButton>
        <IconButton label="Aligner à droite" active={s.right} onClick={() => chain().setTextAlign("right").run()}>
          <AlignRight size={16} />
        </IconButton>
        <IconButton label="Séparateur" onClick={() => chain().setHorizontalRule().run()}>
          <Minus size={16} />
        </IconButton>
        <IconButton label="Effacer la mise en forme" onClick={() => chain().unsetAllMarks().clearNodes().run()}>
          <RemoveFormatting size={16} />
        </IconButton>
      </div>

      <LinkShortcut editor={editor} onOpen={() => setLinkOpen(true)} />
      {linkOpen && <LinkDialog editor={editor} onClose={() => setLinkOpen(false)} />}
      {imageOpen && <ImageDialog editor={editor} onClose={() => setImageOpen(false)} />}
      {brandOpen && <BrandDialog editor={editor} onClose={() => setBrandOpen(false)} />}
      {palette && <div className="fixed inset-0 z-10" onMouseDown={() => setPalette(null)} />}
    </>
  );
}

const Sep = () => <span className="mx-1 h-5 w-px bg-line" aria-hidden />;

function Palette({ colors, onPick }: { colors: string[]; onPick: (c: string | null) => void }) {
  return (
    <div className="animate-pop absolute left-0 top-9 z-20 w-44 rounded-xl border border-line bg-surface p-2 shadow-pop">
      <div className="grid grid-cols-5 gap-1.5">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            onClick={() => onPick(c)}
            className="h-6 w-6 rounded-md border border-black/10 transition-transform hover:scale-110"
            style={{ background: c }}
          />
        ))}
      </div>
      <button type="button" onClick={() => onPick(null)} className="mt-2 w-full rounded-md py-1 text-xs text-muted hover:bg-hover">
        Par défaut
      </button>
    </div>
  );
}

function LinkShortcut({ editor, onOpen }: { editor: Editor; onOpen: () => void }) {
  useEffect(() => {
    const dom = editor.view.dom;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    dom.addEventListener("keydown", onKey);
    return () => dom.removeEventListener("keydown", onKey);
  }, [editor, onOpen]);
  return null;
}

function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const { from, to, empty } = editor.state.selection;
  const [href, setHref] = useState((editor.getAttributes("link").href as string | undefined) ?? "");
  const [text, setText] = useState(empty ? "" : editor.state.doc.textBetween(from, to, " "));
  const isEditing = editor.isActive("link");

  const apply = () => {
    const url = normalizeUrl(href);
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return onClose();
    }
    if (empty && !isEditing) {
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text: text || url.replace(/^mailto:|^tel:/, ""), marks: [{ type: "link", attrs: { href: url } }] })
        .insertContent(" ")
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? "Modifier le lien" : "Insérer un lien"}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={apply}>
            {isEditing ? "Mettre à jour" : "Insérer"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        {empty && !isEditing && (
          <Field label="Texte affiché">
            <input className={inputClass} value={text} onChange={(e) => setText(e.target.value)} placeholder="Cliquez ici" />
          </Field>
        )}
        <Field label="Adresse" hint="URL (https://…), adresse e-mail ou numéro de téléphone">
          <input autoFocus className={inputClass} value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://example.com" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** Largeur affichée par défaut d'une image importée : la largeur utile d'un e-mail est d'environ 600 px */
const displayWidth = (width: number) => (width ? Math.min(width, 560) : undefined);

function ImageDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [mode, setMode] = useState<"library" | "upload" | "url">("library");
  const [library, setLibrary] = useState<LibraryImage[] | null>(null);
  const [picked, setPicked] = useState<LibraryImage | null>(null);

  useEffect(() => {
    api<{ images: LibraryImage[] }>("/api/images")
      .then(({ images }) => {
        setLibrary(images);
        // Bibliothèque vide : on propose directement l'import
        if (images.length === 0) setMode("upload");
      })
      .catch(() => {
        setLibrary([]);
        setMode("upload");
      });
  }, []);

  const removeImage = async (img: LibraryImage) => {
    if (!confirm(`Supprimer « ${img.filename} » ?\n\nElle ne s'affichera plus dans les e-mails déjà envoyés qui l'utilisent.`)) return;
    try {
      await api(`/api/images/${img.name}`, { method: "DELETE" });
      setLibrary((l) => (l ?? []).filter((x) => x.name !== img.name));
      if (picked?.name === img.name) setPicked(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const [src, setSrc] = useState("");
  const [alt, setAlt] = useState("");
  const [width, setWidth] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Choisissez un fichier image (PNG, JPEG, GIF, WebP…)");
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    if (!alt) setAlt(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  };

  const apply = async () => {
    if (mode === "library") {
      if (!picked) return;
      editor
        .chain()
        .focus()
        .setImage({ src: picked.url, alt: alt || undefined, width: width ? Number(width) : displayWidth(picked.width) })
        .run();
      return onClose();
    }
    if (mode === "url") {
      const url = normalizeUrl(src);
      if (!/^https?:/.test(url)) return;
      editor.chain().focus().setImage({ src: url, alt: alt || undefined, width: width ? Number(width) : undefined }).run();
      return onClose();
    }
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const img = await uploadImage(file);
      setLibrary((l) => (l && !l.some((x) => x.name === img.name) ? [img, ...l] : l));
      editor
        .chain()
        .focus()
        .setImage({ src: img.url, alt: alt || undefined, width: width ? Number(width) : displayWidth(img.width) })
        .run();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setUploading(false);
    }
  };

  const canInsert = mode === "library" ? Boolean(picked) : mode === "url" ? Boolean(src.trim()) : Boolean(file);

  return (
    <Modal
      open
      onClose={onClose}
      title="Insérer une image"
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={apply} disabled={!canInsert || uploading}>
            {uploading ? "Envoi…" : "Insérer"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void apply();
        }}
      >
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1 text-[13px] font-medium">
          {(["library", "upload", "url"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn("rounded-md py-1.5 transition-colors", mode === m ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}
            >
              {m === "library" ? `Mes images${library?.length ? ` (${library.length})` : ""}` : m === "upload" ? "Importer" : "URL"}
            </button>
          ))}
        </div>

        {mode === "library" ? (
          library === null ? (
            <div className="flex justify-center py-8 text-muted">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : library.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Aucune image importée pour l&apos;instant.</p>
          ) : (
            <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
              {library.map((img) => (
                <div key={img.name} className="group relative">
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(img);
                      setAlt(img.filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
                    }}
                    onDoubleClick={() => {
                      setPicked(img);
                      editor.chain().focus().setImage({ src: img.url, alt: "", width: displayWidth(img.width) }).run();
                      onClose();
                    }}
                    title={`${img.filename} · ${img.width}×${img.height}`}
                    className={cn(
                      "flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border bg-[repeating-conic-gradient(#f1f2f4_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-1.5",
                      picked?.name === img.name ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-line-strong",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Supprimer ${img.filename}`}
                    onClick={() => removeImage(img)}
                    className="absolute right-1 top-1 hidden rounded-md bg-surface/90 p-1 text-muted shadow-sm hover:text-danger group-hover:block"
                  >
                    <Trash2 size={13} />
                  </button>
                  <div className="mt-1 truncate text-[11px] text-subtle">{img.filename}</div>
                </div>
              ))}
            </div>
          )
        ) : mode === "upload" ? (
          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                pick(e.dataTransfer.files[0]);
              }}
              className="flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-5 text-center text-sm text-muted transition-colors hover:border-accent hover:text-fg"
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="max-h-40 max-w-full rounded-lg" />
              ) : (
                <>
                  <ImagePlus size={22} />
                  <span>Cliquez ou déposez une image ici</span>
                </>
              )}
              {file && <span className="text-xs text-subtle">{file.name} · cliquer pour changer</span>}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
            <p className="mt-1.5 text-xs text-subtle">
              L&apos;image est redimensionnée (1200 px max), puis hébergée en ligne pour s&apos;afficher chez tous vos destinataires.
            </p>
          </div>
        ) : (
          <Field label="URL de l'image" hint="Adresse publique d'une image (https://…).">
            <input autoFocus className={inputClass} value={src} onChange={(e) => setSrc(e.target.value)} placeholder="https://…/logo.png" />
          </Field>
        )}

        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Field label="Texte alternatif">
            <input className={inputClass} value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Description de l'image" />
          </Field>
          <Field label="Largeur (px)">
            <input className={inputClass} inputMode="numeric" value={width} onChange={(e) => setWidth(e.target.value.replace(/\D/g, ""))} placeholder="auto" />
          </Field>
        </div>
        {mode === "url" && /^https?:\/\/.+/.test(normalizeUrl(src)) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={normalizeUrl(src)} alt="" className="max-h-40 rounded-lg border border-line" />
        )}
        {error && <p className="text-[13px] text-danger">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** Insère un logo hébergé publiquement (seul moyen fiable d'afficher une image dans Gmail / Outlook) */
function BrandDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const base = useBrandAssetsUrl();
  const branding = useBranding();
  // Logo de l'instance (servi par l'app), puis logos du Worker de réception
  const assets = [
    ...(branding.logoVersion
      ? [{ src: `${window.location.origin}${brandIconUrl(branding)}`, label: "Logo de l'instance", hint: "Choisi dans Réglages", width: 64, preview: "light" }]
      : []),
    ...(base ? BRAND_ASSETS.map((a) => ({ ...a, src: `${base}/${a.file}` })) : []),
  ];
  const [src, setSrc] = useState<string | undefined>(assets[0]?.src);
  const asset = assets.find((a) => a.src === src);
  const [width, setWidth] = useState<string>(String(asset?.width ?? 160));

  const insert = () => {
    if (!asset) return;
    editor
      .chain()
      .focus()
      .setImage({ src: asset.src, alt: branding.name, width: Number(width) || asset.width })
      .run();
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Logo"
      wide
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={insert} disabled={!asset}>
            Insérer
          </Button>
        </>
      }
    >
      {!assets.length ? (
        <p className="text-sm text-muted">
          Les logos doivent être accessibles depuis Internet pour s&apos;afficher chez vos destinataires. Renseignez{" "}
          <code>INBOX_WORKER_URL</code> (ou <code>BRAND_ASSETS_URL</code>), puis relancez <code>npm run deploy</code>.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {assets.map((a) => (
              <button
                key={a.src}
                type="button"
                onClick={() => {
                  setSrc(a.src);
                  setWidth(String(a.width));
                }}
                className={cn(
                  "flex flex-col overflow-hidden rounded-xl border text-left transition-colors",
                  a.src === src ? "border-accent ring-2 ring-accent/25" : "border-line hover:border-line-strong",
                )}
              >
                <span className={cn("flex h-20 items-center justify-center p-3", a.preview === "dark" ? "bg-[#101C3B]" : "bg-white")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.src} alt="" className="max-h-full max-w-full object-contain" />
                </span>
                <span className="border-t border-line px-2.5 py-2">
                  <span className="block text-[13px] font-medium">{a.label}</span>
                  <span className="block text-xs text-subtle">{a.hint}</span>
                </span>
              </button>
            ))}
          </div>
          <Field label="Largeur affichée (px)" hint="160 px conviennent pour une signature ou un en-tête ; l'image est nette jusqu'à 480 px.">
            <div className="w-32">
              <input className={inputClass} inputMode="numeric" value={width} onChange={(e) => setWidth(e.target.value.replace(/\D/g, ""))} />
            </div>
          </Field>
        </div>
      )}
    </Modal>
  );
}
