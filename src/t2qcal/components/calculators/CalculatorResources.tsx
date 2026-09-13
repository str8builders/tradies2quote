"use client";
import {Books} from "@phosphor-icons/react";
import catalog from "@/t2qcal/lib/native-catalog.json";
import {resourcesForTool} from "@/t2qcal/lib/calculator-resources";
import type {ToolEntry} from "@/t2qcal/lib/tools";
import {ResourceRow,useDocumentShelf} from "../ResourceShelf";

/** The NZ standards and trade manuals that go with this calculator, with Keep offline. */
export function CalculatorResources({tool}:{tool:ToolEntry}){
  const shelf=useDocumentShelf();
  const rows=resourcesForTool(tool.slug,tool.category);
  if(rows.length===0)return null;
  return <section className="calculator-resources" aria-labelledby="calculator-resources-title" data-testid="calculator-resources">
    <h2 id="calculator-resources-title" className="native-section-label"><span><Books size={16} weight="bold"/>Standards &amp; manuals for this job</span><a className="native-link-button" href="/t2qcal/resources">All {catalog.resources.length}</a></h2>
    <p className="native-footnote calculator-resources-lead">NZS 3604 and the Building Code clauses this work is checked against, plus the manufacturer manuals. Keep them on the phone for site.</p>
    <div className="native-group">{rows.map(r=><ResourceRow key={r.id} r={r} shelf={shelf}/>)}</div>
  </section>;
}
