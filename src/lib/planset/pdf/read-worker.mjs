// Worker thread for the plan-set reader: owns one open PDF and answers
// page requests, so pdf.js's parsing never blocks the web server's thread.
// Started by read.ts with `new Worker(<path to this file>)`.
//
// Messages in:  { type: "open", bytes } | { type: "page", id, page } | { type: "close" }
// Messages out: { type: "opened", pageCount } | { type: "page", id, sheet } | { type: "error", id?, message }
import { parentPort } from "node:worker_threads";
import { openPlanPdfCore } from "./read-core.mjs";

let pdf = null;

parentPort.on("message", async (msg) => {
  try {
    if (msg.type === "open") {
      pdf = await openPlanPdfCore(msg.bytes);
      parentPort.postMessage({ type: "opened", pageCount: pdf.pageCount });
    } else if (msg.type === "page") {
      if (!pdf) throw new Error("No PDF is open.");
      const sheet = await pdf.readPage(msg.page);
      parentPort.postMessage({ type: "page", id: msg.id, sheet });
    } else if (msg.type === "close") {
      if (pdf) await pdf.close();
      pdf = null;
      parentPort.postMessage({ type: "closed" });
    }
  } catch (e) {
    parentPort.postMessage({ type: "error", id: msg.id, message: e instanceof Error ? e.message : String(e) });
  }
});
