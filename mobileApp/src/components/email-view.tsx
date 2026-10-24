import * as WebBrowser from "expo-web-browser";
import { useMemo, useState } from "react";
import { Linking } from "react-native";
import { WebView } from "react-native-webview";
import { API_URL } from "@/lib/config";
import { useTheme } from "./theme";

/**
 * Affiche un e-mail HTML dans une WebView sans JavaScript de l'expéditeur (seul notre script
 * de mesure de hauteur s'exécute), sur fond blanc comme dans les clients mail.
 * Les liens s'ouvrent dans le navigateur ; les images intégrées utilisent le jeton de session.
 */
export function EmailView({ html, token }: { html: string; token: string | null }) {
  const t = useTheme();
  const [height, setHeight] = useState(120);

  const source = useMemo(() => {
    // Images intégrées d'un e-mail reçu : /api/attachments/<id> → adresse complète avec jeton
    const withImages = html.replace(/(["'(])\/api\/attachments\/([a-f0-9-]{36})/g, (_m, q: string, id: string) =>
      `${q}${API_URL}/api/attachments/${id}${token ? `?access_token=${encodeURIComponent(token)}` : ""}`,
    );
    // Les scripts du message sont retirés : seul le script de mesure ci-dessous s'exécute
    const safe = withImages.replace(/<script[\s\S]*?<\/script>/gi, "");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5">
<style>html,body{margin:0;padding:0;background:#fff;color:#1f2937;font-family:-apple-system,Roboto,Arial,sans-serif;font-size:15px;line-height:1.5;overflow-wrap:anywhere}body{padding:14px 16px}img{max-width:100%!important;height:auto!important}table{max-width:100%!important}a{color:#2563eb}</style></head>
<body>${safe}</body></html>`;
  }, [html, token]);

  const measure = `
    (function(){
      function send(){ window.ReactNativeWebView.postMessage(String(Math.ceil(document.documentElement.scrollHeight))); }
      new ResizeObserver(send).observe(document.body);
      window.addEventListener('load', send);
      Array.prototype.forEach.call(document.images, function(img){ img.addEventListener('load', send); });
      send();
    })(); true;`;

  return (
    <WebView
      originWhitelist={["*"]}
      source={{ html: source, baseUrl: API_URL }}
      injectedJavaScript={measure}
      onMessage={(e) => {
        const h = Number(e.nativeEvent.data);
        if (h > 0) setHeight(Math.min(h, 20000));
      }}
      onShouldStartLoadWithRequest={(req) => {
        // Chargement initial du contenu (adresse de base) : autorisé ; tout autre lien → navigateur / appli
        if (req.url === "about:blank" || req.url.replace(/\/$/, "") === API_URL) return true;
        if (req.url.startsWith("http")) void WebBrowser.openBrowserAsync(req.url);
        else if (/^(mailto|tel|sms):/.test(req.url)) void Linking.openURL(req.url);
        return false;
      }}
      scrollEnabled={false}
      style={{ height, backgroundColor: "#fff" }}
      containerStyle={{ borderRadius: 12, overflow: "hidden", borderWidth: 0.5, borderColor: t.border }}
      setSupportMultipleWindows={false}
      javaScriptEnabled
      allowsLinkPreview={false}
    />
  );
}
