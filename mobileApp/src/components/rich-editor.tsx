import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";

import { WebView } from "react-native-webview";
import { useTheme } from "./theme";
import { AppText, Button, Field, Icon, type IconName } from "./ui";

/**
 * Éditeur de texte riche : zone éditable (WebView) + barre d'outils native.
 * Produit du HTML simple (p, strong, em, u, s, a, ul/ol, blockquote, h2, img, couleurs, alignement)
 * que le serveur convertit en HTML compatible avec les clients mail, comme pour l'app web.
 */

export type RichEditorHandle = {
  insertImage: (url: string, width?: number) => void;
  focus: () => void;
};

const TEXT_COLORS = ["#111827", "#6b7280", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#7c3aed"];
const HIGHLIGHTS = ["#fef08a", "#bbf7d0", "#bae6fd", "#fbcfe8", "transparent"];

function editorHtml(initial: string, placeholder: string, dark: boolean) {
  const text = dark ? "#EEF0F5" : "#101C3B";
  const muted = dark ? "#6D7897" : "#8C95A8";
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  html,body{margin:0;padding:0;background:transparent;color:${text};font-family:-apple-system,Roboto,Arial,sans-serif;font-size:16px;line-height:1.5}
  #e{min-height:220px;padding:12px 16px 40px;outline:none;overflow-wrap:anywhere}
  #e:empty:before{content:attr(data-placeholder);color:${muted}}
  #e p{margin:0 0 10px} #e img{max-width:100%;height:auto;border-radius:4px}
  #e blockquote{margin:0 0 10px;padding-left:12px;border-left:3px solid #cbd5e1;color:${muted}}
  #e a{color:#2563eb} #e ul,#e ol{padding-left:22px;margin:0 0 10px}
</style></head><body>
<div id="e" contenteditable="true" data-placeholder="${placeholder.replace(/"/g, "&quot;")}">${initial}</div>
<script>
  var e=document.getElementById('e'); var t;
  document.execCommand('defaultParagraphSeparator', false, 'p');
  function post(){ var h=e.innerHTML; if(!e.textContent.trim() && !e.querySelector('img')) h=''; window.ReactNativeWebView.postMessage(JSON.stringify({type:'html',html:h})); }
  function state(){ var s={}; ['bold','italic','underline','strikeThrough','insertUnorderedList','insertOrderedList'].forEach(function(c){ try{s[c]=document.queryCommandState(c)}catch(x){} });
    var n=window.getSelection().anchorNode; var link=false; while(n&&n!==e){ if(n.nodeName==='A'){link=true;break} n=n.parentNode }
    s.link=link; window.ReactNativeWebView.postMessage(JSON.stringify({type:'state',state:s})); }
  e.addEventListener('input', function(){ clearTimeout(t); t=setTimeout(post, 250); state(); });
  document.addEventListener('selectionchange', state);
  window.cmd=function(c,v){ e.focus(); document.execCommand(c,false,v||null); post(); state(); };
  window.insertHTML=function(h){ e.focus(); document.execCommand('insertHTML',false,h); post(); };
  window.focusEnd=function(){ e.focus(); var r=document.createRange(); r.selectNodeContents(e); r.collapse(false); var s=window.getSelection(); s.removeAllRanges(); s.addRange(r); };
</script></body></html>`;
}

export const RichEditor = forwardRef<RichEditorHandle, {
  initialHtml: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  onPickImage?: () => void;
}>(function RichEditor({ initialHtml, onChange, placeholder = "Écrivez votre message…", minHeight = 260, onPickImage }, ref) {
  const t = useTheme();
  const [web, setWeb] = useState<InstanceType<typeof WebView> | null>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [palette, setPalette] = useState<"color" | "highlight" | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  // La page n'est construite qu'une fois : le contenu initial ne doit pas la recharger
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => ({ html: editorHtml(initialHtml, placeholder, t.dark) }), [t.dark]);

  const run = (js: string) => web?.injectJavaScript(`${js}; true;`);
  const cmd = (c: string, v?: string) => run(`window.cmd(${JSON.stringify(c)}, ${JSON.stringify(v ?? null)})`);

  useImperativeHandle(ref, () => ({
    insertImage: (url, width) =>
      run(`window.insertHTML(${JSON.stringify(`<img src="${url}" alt=""${width ? ` width="${Math.min(width, 560)}"` : ""}><p><br></p>`)})`),
    focus: () => run("window.focusEnd()"),
  }));

  const tools: { icon: IconName; label: string; on?: boolean; press: () => void }[] = [
    { icon: "remove-outline", label: "Barré", on: active.strikeThrough, press: () => cmd("strikeThrough") },
    { icon: "list-outline", label: "Liste à puces", on: active.insertUnorderedList, press: () => cmd("insertUnorderedList") },
    { icon: "list-circle-outline", label: "Liste numérotée", on: active.insertOrderedList, press: () => cmd("insertOrderedList") },
    { icon: "link-outline", label: "Lien", on: active.link, press: () => setLinkOpen(true) },
    { icon: "color-palette-outline", label: "Couleur", press: () => setPalette(palette === "color" ? null : "color") },
    { icon: "color-fill-outline", label: "Surlignage", press: () => setPalette(palette === "highlight" ? null : "highlight") },
    { icon: "chatbox-ellipses-outline", label: "Citation", press: () => cmd("formatBlock", "blockquote") },
    { icon: "reorder-four-outline", label: "Aligner à gauche", press: () => cmd("justifyLeft") },
    { icon: "reorder-three-outline", label: "Centrer", press: () => cmd("justifyCenter") },
    ...(onPickImage ? [{ icon: "image-outline" as IconName, label: "Image", press: onPickImage }] : []),
    { icon: "arrow-undo-outline", label: "Annuler", press: () => cmd("undo") },
    { icon: "arrow-redo-outline", label: "Rétablir", press: () => cmd("redo") },
    { icon: "close-circle-outline", label: "Effacer la mise en forme", press: () => cmd("removeFormat") },
  ];

  const applyLink = () => {
    let url = linkUrl.trim();
    if (!url) return setLinkOpen(false);
    if (!/^(https?:|mailto:|tel:)/i.test(url)) url = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url) ? `mailto:${url}` : `https://${url}`;
    if (linkText.trim()) {
      const safe = linkText.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      run(`window.insertHTML(${JSON.stringify(`<a href="${url.replace(/"/g, "%22")}">${safe}</a>&nbsp;`)})`);
    } else {
      cmd("createLink", url);
    }
    setLinkOpen(false);
    setLinkUrl("");
    setLinkText("");
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, borderBottomWidth: 0.5, borderBottomColor: t.border }}
        contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 6, gap: 2 }}
      >
        {/* Gras, italique et souligné en lettres (pas d'icônes dédiées dans Ionicons) */}
        <ToolText label="G" a11y="Gras" on={active.bold} onPress={() => cmd("bold")} />
        <ToolText label="I" a11y="Italique" italic on={active.italic} onPress={() => cmd("italic")} />
        <ToolText label="S" a11y="Souligné" underline on={active.underline} onPress={() => cmd("underline")} />
        {tools.map((tool) => (
          <Pressable
            key={tool.label}
            accessibilityLabel={tool.label}
            onPress={tool.press}
            style={{ width: 38, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: tool.on ? t.accentSoft : "transparent" }}
          >
            <Icon name={tool.icon} size={19} color={tool.on ? t.accent : t.text} />
          </Pressable>
        ))}
      </ScrollView>
      {palette && (
        <View style={{ flexDirection: "row", gap: 10, padding: 10, borderBottomWidth: 0.5, borderBottomColor: t.border }}>
          {(palette === "color" ? TEXT_COLORS : HIGHLIGHTS).map((c) => (
            <Pressable
              key={c}
              accessibilityLabel={c === "transparent" ? "Aucun" : c}
              onPress={() => {
                cmd(palette === "color" ? "foreColor" : "hiliteColor", c);
                setPalette(null);
              }}
              style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c === "transparent" ? t.surface : c, borderWidth: 1, borderColor: t.border }}
            />
          ))}
        </View>
      )}
      <WebView
        ref={setWeb}
        originWhitelist={["*"]}
        source={source}
        // iOS : pas de barre « < > Terminé » au-dessus du clavier ; focus possible depuis la barre d'outils
        hideKeyboardAccessoryView
        keyboardDisplayRequiresUserAction={false}
        style={{ backgroundColor: "transparent", minHeight }}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data) as { type: string; html?: string; state?: Record<string, boolean> };
            if (msg.type === "html") onChange(msg.html ?? "");
            if (msg.type === "state" && msg.state) setActive(msg.state);
          } catch {}
        }}
        onShouldStartLoadWithRequest={(req) => req.url === "about:blank" || req.url.startsWith("data:")}
      />

      <Modal visible={linkOpen} transparent animationType="fade" onRequestClose={() => setLinkOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 }}>
            <View style={{ backgroundColor: t.surface, borderRadius: 16, padding: 18, gap: 12 }}>
              <AppText variant="heading">Insérer un lien</AppText>
              <Field label="Adresse" value={linkUrl} onChangeText={setLinkUrl} autoCapitalize="none" keyboardType="url" placeholder="https://example.com" autoFocus />
              <Field label="Texte affiché (facultatif)" value={linkText} onChangeText={setLinkText} placeholder="Sinon, le texte sélectionné" />
              <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end" }}>
                <Button title="Annuler" variant="ghost" onPress={() => setLinkOpen(false)} />
                {active.link && <Button title="Retirer" variant="secondary" onPress={() => { cmd("unlink"); setLinkOpen(false); }} />}
                <Button title="Insérer" onPress={applyLink} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
});

function ToolText({ label, a11y, italic, underline, on, onPress }: { label: string; a11y: string; italic?: boolean; underline?: boolean; on?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityLabel={a11y}
      onPress={onPress}
      style={{ width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: on ? t.accentSoft : "transparent" }}
    >
      <AppText style={{ fontStyle: italic ? "italic" : "normal", textDecorationLine: underline ? "underline" : "none", fontWeight: "700", fontSize: 17 }} color={on ? t.accent : t.text}>
        {label}
      </AppText>
    </Pressable>
  );
}
