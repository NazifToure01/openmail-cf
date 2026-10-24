"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "./ui";

/** Affiche un e-mail HTML dans une iframe isolée (pas de scripts) qui s'ajuste à sa hauteur */
export function EmailFrame({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let observer: ResizeObserver | undefined;
    const onLoad = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      // Police par défaut pour les e-mails qui n'en précisent pas (les styles du message restent prioritaires)
      const base = doc.createElement("style");
      base.textContent = "body{margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;overflow-wrap:anywhere}img{max-width:100%;height:auto}";
      doc.head?.prepend(base);
      doc.querySelectorAll("a").forEach((a) => {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      });
      const measure = () => setHeight(Math.max(60, doc.body.scrollHeight));
      measure();
      observer = new ResizeObserver(measure);
      observer.observe(doc.body);
    };
    frame.addEventListener("load", onLoad);
    return () => {
      frame.removeEventListener("load", onLoad);
      observer?.disconnect();
    };
  }, [html]);

  return (
    <div className={cn("rounded-xl border border-line bg-white px-4 py-3 sm:px-5 sm:py-4", className)}>
      <iframe
        ref={ref}
        title="Contenu du message"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={html}
        style={{ height }}
        className="block w-full"
      />
    </div>
  );
}
