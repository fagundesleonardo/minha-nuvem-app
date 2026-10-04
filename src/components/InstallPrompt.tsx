"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/upload";
import { isAutoSyncSupported, authorizeFolder, syncNow } from "@/lib/photoSync";
import { LogoMark } from "@/components/Logo";

const DISMISS_KEY = "minha-nuvem:install-dismissed-at";
const DISMISS_DAYS = 7;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function wasRecentlyDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const days = (Date.now() - Number(raw)) / (1000 * 60 * 60 * 24);
    return days < DISMISS_DAYS;
  } catch {
    return false;
  }
}

function isStandalone() {
  if (typeof window === "undefined") return true;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari-specific flag
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Uploads a batch of files picked via the plain <input type=file> fallback (used on iOS, where there's no folder-level authorization API) and records each as device_media — same bookkeeping the auto-sync path does. */
async function uploadBatch(files: File[], onDone: (count: number) => void) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  let done = 0;
  for (const file of files) {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) continue;
    const result = await uploadFile(file, null).catch(() => ({ ok: false as const, error: "falhou" }));
    if (result.ok) {
      await supabase.from("device_media").insert({
        owner_id: user.id,
        file_id: result.fileId,
        media_type: file.type.startsWith("video/") ? "video" : "photo",
        captured_at: file.lastModified ? new Date(file.lastModified).toISOString() : null,
      });
      done++;
      onDone(done);
    }
  }
}

/**
 * Banner that helps people actually get the app installed on their phone,
 * then — once installed — offers one-tap photo/video auto-sync setup.
 *
 * Android/desktop Chrome fires `beforeinstallprompt` and we can trigger the
 * native install flow with one tap. iOS Safari never fires that event and
 * has no install API at all — the only way to install there is the manual
 * Share -> "Adicionar à Tela de Início" flow, so for iOS we show clear,
 * illustrated instructions instead of a broken "Instalar" button.
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showIOSSteps, setShowIOSSteps] = useState(false);
  const [askSync, setAskSync] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  /* eslint-disable react-hooks/set-state-in-effect --
     This whole effect only reads browser-only globals (navigator/window)
     that don't exist during SSR, so the state it sets can't be computed
     during render — an effect is the correct (not just tolerated) tool
     here for the platform-detection state below. */
  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) return;

    const ua = window.navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    setIsIOS(iOS);

    if (iOS) {
      setVisible(true);
      return;
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    function onInstalled() {
      setDeferredPrompt(null);
      setAskSync(true); // keep the banner up one more step to offer photo/video auto-sync
    }
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore (private browsing etc.)
    }
    setVisible(false);
    setShowIOSSteps(false);
    setAskSync(false);
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === "accepted") {
      setAskSync(true);
    } else {
      setVisible(false);
    }
  }

  async function handleAuthorizeSync() {
    if (isAutoSyncSupported()) {
      setSyncBusy(true);
      const handle = await authorizeFolder();
      if (!handle) {
        setSyncBusy(false);
        return; // picker cancelled — leave the ask visible so they can retry
      }
      const result = await syncNow().catch(() => null);
      setSyncBusy(false);
      setSyncMessage(result ? `Pronto! ${result.uploaded} arquivo(s) sincronizados.` : "Autorizado — sincronizando em segundo plano.");
      setTimeout(dismiss, 2500);
    } else {
      // iOS / browsers without folder access: best effort is the native multi-select picker.
      fallbackInputRef.current?.click();
    }
  }

  async function handleFallbackFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setSyncBusy(true);
    await uploadBatch(Array.from(files), (count) => setSyncMessage(`Enviando... ${count} concluído(s)`));
    setSyncBusy(false);
    setSyncMessage("Pronto!");
    setTimeout(dismiss, 2000);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 p-3 sm:p-4">
      <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl shadow-lg p-4">
        {askSync ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <LogoMark size={24} />
              <p className="text-sm font-medium text-slate-900">App instalado! 🎉</p>
            </div>
            <p className="text-sm text-slate-600">
              {isAutoSyncSupported()
                ? "Toque em \"Sim, autorizar\" uma única vez — o seletor já abre direto na pasta de fotos do aparelho, é só confirmar. A partir daí, todas as fotos e vídeos (inclusive os novos) sincronizam sozinhos para sempre, sem você selecionar nada de novo."
                : "Nesse navegador não é possível autorizar acesso completo automaticamente (limitação do iPhone/Safari) — você pode selecionar várias fotos e vídeos de uma vez para enviar agora."}
            </p>
            {syncMessage && <p className="text-xs text-blue-600">{syncMessage}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={dismiss} className="text-sm px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
                Agora não
              </button>
              <button
                onClick={handleAuthorizeSync}
                disabled={syncBusy}
                className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {syncBusy ? "Aguarde..." : isAutoSyncSupported() ? "Sim, autorizar" : "Selecionar fotos"}
              </button>
            </div>
            <input
              ref={fallbackInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => handleFallbackFiles(e.target.files)}
            />
          </div>
        ) : isIOS && showIOSSteps ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-900">Instalar na tela de início</p>
            <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside">
              <li>
                Toque no ícone de <strong>compartilhar</strong> (o quadrado com uma seta para cima) na barra do
                Safari.
              </li>
              <li>
                Role a lista de opções e toque em <strong>&quot;Adicionar à Tela de Início&quot;</strong>.
              </li>
              <li>
                Toque em <strong>&quot;Adicionar&quot;</strong> no canto superior direito.
              </li>
            </ol>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => {
                  setShowIOSSteps(false);
                  setAskSync(true);
                }}
                className="text-sm px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                Entendi
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <LogoMark size={32} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900">Instale o Minha Nuvem</p>
              <p className="text-xs text-slate-500">Acesso rápido direto da tela inicial do seu celular.</p>
            </div>
            <button onClick={dismiss} className="text-slate-400 hover:text-slate-600 px-1 text-sm">
              ✕
            </button>
            {isIOS ? (
              <button
                onClick={() => setShowIOSSteps(true)}
                className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 whitespace-nowrap"
              >
                Como instalar
              </button>
            ) : (
              <button
                onClick={handleInstallClick}
                className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 whitespace-nowrap"
              >
                Instalar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
