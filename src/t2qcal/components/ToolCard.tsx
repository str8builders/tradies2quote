import { getCategory, type ToolEntry } from "@/t2qcal/lib/tools";

export function ToolCard({ tool, compact = false }: { tool: ToolEntry; compact?: boolean }) {
  const category = getCategory(tool.category);
  const content = (
    <>
      <div className="tool-card-top">
        <span className="tool-icon" style={{ "--tool-accent": category?.accent } as React.CSSProperties} aria-hidden="true">
          <i /><i />
        </span>
        <span className="unit-pill">{tool.units === "both" ? "mm · in" : tool.units === "metric" ? "mm" : "in"}</span>
      </div>
      <strong>{tool.name}</strong>
      {!compact && <p>{tool.summary}</p>}
      <span className="tool-link-label">{tool.available ? "Open calculator" : "Mapped for migration"} <b>→</b></span>
    </>
  );

  if (!tool.available) return <div className={`tool-card tool-card-muted ${compact ? "compact" : ""}`}>{content}</div>;
  return <a className={`tool-card ${compact ? "compact" : ""}`} href={`/t2qcal/calculator/${tool.slug}`}>{content}</a>;
}
