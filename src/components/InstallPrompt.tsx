"use client";

import { useEffect, useState } from "react";

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

/**
 * Banner that helps people actually get the app installed on their phone.
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
      setVisible(false);
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
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 p-3 sm:p-4">
      <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl shadow-lg p-4">
        {isIOS && showIOSSteps ? (
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
              <button onClick={dismiss} className="text-sm px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
                Entendi
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-2xl">☁️</span>
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
