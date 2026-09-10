"use client";

import { useEffect } from "react";

// Registro do Service Worker do shell da UI (L5-T05, ADR-001/RNF-04).
//
// Componente cliente minúsculo, montado uma vez no `RootLayout`. Não faz
// nada além de registrar `public/sw.js` — toda a lógica de cache/offline vive
// no próprio Service Worker. Falha de registro (browser sem suporte, HTTPS
// ausente em algum ambiente, etc.) é silenciosa por design: PWA é um
// aprimoramento progressivo, nunca um requisito para o app funcionar online.
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Intencional: ausência de Service Worker não pode quebrar o app.
    });
  }, []);

  return null;
}
