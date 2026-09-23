"use client";
import { useId, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { ArrowRight } from "@phosphor-icons/react";
import { formatCurrency } from "@/lib/quote-defaults";

function trimNumber(value: number): string {
  // Deterministic on server and phone (Intl/toLocaleString output differs
  // between ICU builds and tripped hydration before).
  return String(Math.round(value * 1000) / 1000);
}

/** A tiny try-it calculator inside the T2QCAL section. Example numbers only. */
export function WorkflowExample() {
  const [length, setLength] = useState("5");
  const [width, setWidth] = useState("4");
  const [price, setPrice] = useState("35");
  const id = useId();
  const values = [Number(length), Number(width), Number(price)];
  const valid =
    [length, width, price].every((value) => value.trim() !== "") &&
    values.every((value) => Number.isFinite(value) && value > 0 && value <= 10000);
  const area = valid ? values[0] * values[1] : 0;
  const total = area * values[2];
  return (
    <div className="studio-tryit" aria-labelledby={`${id}-title`} role="group">
      <div>
        <h3 id={`${id}-title`}>Try it: price a floor.</h3>
        <p>Change the numbers and watch the material line update.</p>
      </div>
      <div className="studio-tryit-fields">
        <label>
          Length (m)
          <Input type="number" inputMode="decimal" min="0.01" max="10000" step="0.1" value={length} onChange={(e) => setLength(e.target.value)} />
        </label>
        <label>
          Width (m)
          <Input type="number" inputMode="decimal" min="0.01" max="10000" step="0.1" value={width} onChange={(e) => setWidth(e.target.value)} />
        </label>
        <label>
          Rate per m² (NZD)
          <Input type="number" inputMode="decimal" min="0.01" max="10000" step="1" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
      </div>
      <div className="studio-tryit-result" role="status" aria-live="polite">
        {valid ? (
          <>
            <span>Flooring · {trimNumber(area)} m²</span>
            <strong>{formatCurrency(total, "NZD")}</strong>
          </>
        ) : (
          <span>Enter a positive length, width and rate.</span>
        )}
      </div>
      <p className="studio-fineprint">
        Example only. A real quote adds your labour, waste, markup and GST
        from your own settings.{" "}
        <Link href="/t2qcal/takeoff" className="studio-inline-link">
          Measure from a PDF plan <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </p>
    </div>
  );
}
