"use client";

import { createPortal } from "react-dom";
import { ArrowRight, Calculator, DownloadSimple, FileText, X } from "@phosphor-icons/react";

/**
 * "Which app?" sheet shown whenever a tradie taps Install / Share →
 * Add to Home Screen. Tradies2Quote and T2QCAL are two separate
 * installable web apps on the same site (separate manifests, separate
 * Home Screen icons), and a browser can only install the app whose page
 * is open. So the option for the app you are already in runs this
 * page's install flow, and the other option takes you to that app's own
 * install page, where Share → Add to Home Screen adds *that* icon.
 */
export type InstallableApp = "tradies2quote" | "t2qcal";

export const INSTALL_APPS: Record<
  InstallableApp,
  { name: string; blurb: string; installPath: string }
> = {
  tradies2quote: {
    name: "Tradies2Quote",
    blurb: "Quotes, invoices, clients and material prices.",
    installPath: "/install",
  },
  t2qcal: {
    name: "T2QCAL",
    blurb: "Construction calculators with drawings and saved working. No sign-in needed.",
    installPath: "/t2qcal/install",
  },
};

type Props = {
  /** The app whose page is currently open. */
  current: InstallableApp;
  /** Runs this page's own install flow (native prompt or iOS steps). */
  onInstallCurrent: () => void;
  onClose: () => void;
};

export function InstallAppChooser({ current, onInstallCurrent, onClose }: Props) {
  const order: InstallableApp[] = ["tradies2quote", "t2qcal"];
  // Portalled to <body>: the landing header is a transformed sticky bar,
  // which would otherwise turn this fixed overlay into a header-relative box.
  const sheet = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-chooser-title"
      data-testid="install-app-chooser"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 p-4 backdrop-blur sm:items-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="t2q-card relative w-full max-w-md p-6 sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          data-testid="install-app-chooser-close"
          className="absolute right-4 top-4 p-1 text-ink-500 hover:text-white"
        >
          <X size={16} weight="bold" />
        </button>
        <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.25em] text-brand">
          {"// add to home screen"}
        </div>
        <h3
          id="install-chooser-title"
          className="mb-1 font-display text-2xl uppercase tracking-tight sm:text-3xl"
        >
          Which app do you <span className="text-brand">want?</span>
        </h3>
        <p className="mb-5 text-sm text-ink-300">
          Each one installs as its own icon. Add one now and come back for the other any time.
        </p>

        <div className="grid gap-3">
          {order.map((app) => {
            const meta = INSTALL_APPS[app];
            const isCurrent = app === current;
            const Icon = app === "t2qcal" ? Calculator : FileText;
            const label = `Install ${meta.name}`;
            return (
              <div
                key={app}
                data-testid={`install-app-option-${app}`}
                className="flex flex-col gap-3 border border-ink-700 bg-ink-950 p-4 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-sm bg-brand text-ink-900">
                    <Icon size={22} weight="bold" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-base uppercase tracking-tight">{meta.name}</div>
                    <p className="text-xs leading-relaxed text-ink-300">{meta.blurb}</p>
                  </div>
                </div>
                {isCurrent ? (
                  <button
                    type="button"
                    onClick={onInstallCurrent}
                    aria-label={label}
                    data-testid={`install-app-choose-${app}`}
                    className="t2q-btn-primary h-11 w-full justify-center px-3 text-xs sm:w-auto"
                  >
                    <DownloadSimple size={16} weight="bold" />
                    Install {meta.name}
                  </button>
                ) : (
                  <a
                    href={meta.installPath}
                    aria-label={label}
                    data-testid={`install-app-choose-${app}`}
                    className="t2q-btn-ghost h-11 w-full justify-center px-3 text-xs sm:w-auto"
                  >
                    Install {meta.name}
                    <ArrowRight size={16} weight="bold" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? sheet : createPortal(sheet, document.body);
}
