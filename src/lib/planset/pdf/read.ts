import "server-only";
// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — open a plan PDF and read its pages (text, lines, fills).
//
// The reading itself is read-core.mjs (plain JS). On the server it runs in a
// worker thread (read-worker.mjs, started by path at runtime so the bundler
// never touches pdf.js): pdf.js parses on whatever thread calls it, and a
// heavy A1 engineer's sheet stalled that thread for 1.8 s — on the web
// server's main thread that freezes every other request. Tests read inline.
// ─────────────────────────────────────────────────────────────────────────

import path from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import type { SheetRaw } from "../types";

export type OpenPlanPdf = {
  pageCount: number;
  /** Read one page (1-based). */
  readPage(page: number): Promise<SheetRaw>;
  close(): Promise<void>;
};

export type OpenOptions = {
  /** Read on a worker thread. Default: yes, except under vitest. */
  thread?: boolean;
};

const HERE = "src/lib/planset/pdf";

/** Open a plan PDF. The bytes are copied, so the caller can keep using them. */
export async function openPlanPdf(bytes: Uint8Array, opts: OpenOptions = {}): Promise<OpenPlanPdf> {
  const thread = opts.thread ?? !process.env.VITEST;
  if (!thread) {
    const core = pathToFileURL(path.join(process.cwd(), HERE, "read-core.mjs")).href;
    const { openPlanPdfCore } = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ core)) as {
      openPlanPdfCore: (b: Uint8Array) => Promise<OpenPlanPdf>;
    };
    return openPlanPdfCore(bytes);
  }
  return openInWorker(bytes);
}

type WorkerReply =
  | { type: "opened"; pageCount: number }
  | { type: "page"; id: number; sheet: SheetRaw }
  | { type: "closed" }
  | { type: "error"; id?: number; message: string };

function openInWorker(bytes: Uint8Array): Promise<OpenPlanPdf> {
  const worker = new Worker(path.join(process.cwd(), HERE, "read-worker.mjs"));
  const pending = new Map<number, { resolve: (s: SheetRaw) => void; reject: (e: Error) => void }>();
  let nextId = 1;
  let onOpened: ((n: number) => void) | null = null;
  let onOpenFailed: ((e: Error) => void) | null = null;
  let onClosed: (() => void) | null = null;

  const failAll = (e: Error) => {
    onOpenFailed?.(e);
    for (const p of pending.values()) p.reject(e);
    pending.clear();
  };
  worker.on("message", (msg: WorkerReply) => {
    if (msg.type === "opened") onOpened?.(msg.pageCount);
    else if (msg.type === "page") {
      pending.get(msg.id)?.resolve(msg.sheet);
      pending.delete(msg.id);
    } else if (msg.type === "closed") onClosed?.();
    else if (msg.type === "error") {
      const err = new Error(`Couldn't read the PDF: ${msg.message}`);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)!.reject(err);
        pending.delete(msg.id);
      } else failAll(err);
    }
  });
  worker.on("error", (e) => failAll(e instanceof Error ? e : new Error(String(e))));
  worker.on("exit", (code) => {
    if (code !== 0) failAll(new Error(`The PDF reader stopped (exit ${code}).`));
  });

  return new Promise<OpenPlanPdf>((resolve, reject) => {
    onOpenFailed = (e) => {
      void worker.terminate();
      reject(e);
    };
    onOpened = (pageCount) => {
      onOpenFailed = null;
      resolve({
        pageCount,
        readPage: (page) =>
          new Promise<SheetRaw>((res, rej) => {
            const id = nextId++;
            pending.set(id, { resolve: res, reject: rej });
            worker.postMessage({ type: "page", id, page });
          }),
        close: async () => {
          await new Promise<void>((res) => {
            const timer = setTimeout(res, 2_000);
            onClosed = () => {
              clearTimeout(timer);
              res();
            };
            worker.postMessage({ type: "close" });
          });
          await worker.terminate();
        },
      });
    };
    const copy = bytes.slice();
    worker.postMessage({ type: "open", bytes: copy }, [copy.buffer]);
  });
}
