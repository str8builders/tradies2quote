"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { categories, tools } from "@/t2qcal/lib/tools";
import { ToolCard } from "./ToolCard";

export function DirectoryExplorer() {
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); search.current?.focus(); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [readyOnly, setReadyOnly] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tools.filter((tool) => {
      const matchesQuery = !q || `${tool.name} ${tool.summary}`.toLowerCase().includes(q);
      return matchesQuery && (category === "all" || tool.category === category) && (!readyOnly || tool.available);
    });
  }, [query, category, readyOnly]);

  return (
    <>
      <section className="directory-controls" aria-label="Calculator filters" id="directory">
        <label className="search-control">
          <span>Search</span>
          <input ref={search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try “rafter”, “spacing” or “tile”…" type="search" />
          <kbd>⌘ K</kbd>
        </label>
        <label className="select-control">
          <span>Trade</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">Every category</option>
            {categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="check-control">
          <input type="checkbox" checked={readyOnly} onChange={(event) => setReadyOnly(event.target.checked)} />
          <span>Interactive now</span>
        </label>
      </section>
      <div className="directory-result-line"><strong>{filtered.length}</strong> tools in this view</div>
      <section className="tool-grid directory-grid" aria-live="polite">
        {filtered.map((tool) => <ToolCard key={tool.slug} tool={tool} />)}
      </section>
      {filtered.length === 0 && <div className="empty-state"><strong>No tool matches that search.</strong><p>Try a material, job or measurement instead.</p></div>}
    </>
  );
}
