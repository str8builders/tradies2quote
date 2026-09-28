"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/support", label: "Support" },
] as const;

export function SectionTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Legal sections"
      className="border-b border-ink-700 bg-ink-950"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <ul className="flex gap-1 -mb-px">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center px-4 py-4 font-mono text-xs uppercase tracking-[0.2em] border-b-2 transition-colors ${
                    active
                      ? "text-white border-brand"
                      : "text-ink-300 border-transparent hover:text-ink-100"
                  }`}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
