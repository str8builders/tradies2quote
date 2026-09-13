"use client";
import { Printer } from "@phosphor-icons/react";
export function PrintButton() {
  return <button type="button" className="t2q-btn-primary-pro" onClick={() => window.print()} data-testid="poster-print"><Printer size={18} weight="bold" />Print poster</button>;
}
