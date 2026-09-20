import { notFound } from "next/navigation";
import { QuoteImportClient } from "@/app/app/materials/import-quote/_components/QuoteImportClient";

/** Isolated UI fixture. Never available in a production build. */
export default function UpgradeHarness() {
  if (process.env.NODE_ENV !== "development" || process.env.T2Q_UPGRADE_HARNESS !== "1") notFound();
  return <main className="mx-auto max-w-4xl p-4"><h1>Supplier review fixture</h1><QuoteImportClient currency="NZD" taxRate={0.15} /></main>;
}
