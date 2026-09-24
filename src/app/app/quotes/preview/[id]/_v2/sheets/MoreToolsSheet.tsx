"use client";

import { ArrowSquareOut, FileText, LinkSimple, PencilSimpleLine, XCircle } from "@phosphor-icons/react/dist/ssr";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { SavePdfButton } from "@/app/app/_components/SavePdfButton";
import { QuotePhotos } from "@/app/_components/quote/QuotePhotos";
import { explainFormula } from "@/lib/explainFormula";
import type { QuoteLineItem } from "@/lib/quote-types";
import { CsiGroupedView } from "../../_components/CsiGroupedView";
import { MaterialsListButton } from "../../_components/MaterialsListButton";
import { T2QCALWorking, hasT2QCALWorking } from "../../_components/T2QCALWorking";
import { DayNotes } from "../parts/DayNotes";
import { ToolSection } from "../parts/ToolSection";
import type { DayNote, ServerTool } from "../types";
import { CopyButton } from "./clipboard";
import { detailedEditorHref } from "./sender-parts";

/** Lines with a worked-out quantity to show (formula or calculator record). */
export function linesWithWorking(lines: readonly QuoteLineItem[]): QuoteLineItem[] {
  return lines.filter((line) => explainFormula(line.formula).length > 0 || hasT2QCALWorking(line));
}

export interface MoreToolsSheetProps {
  quoteId: string;
  publicLink: string | null;
  hasPdf: boolean;
  lines: QuoteLineItem[];
  jobSummary: string | null;
  /** quote_data.notes: things the tradie should check. */
  notes: string[];
  bookedDate: string | null;
  dayNotes: DayNote[];
  serverTools: ServerTool[];
  /** "They said no" is offered while the owner may still decline. */
  onDecline?: () => void;
  onClose: () => void;
}

/**
 * Everything that isn't the next step, one tap away: the client's link, the
 * PDF, photos, notes, and the classic page's review tools and panels, reused
 * as they are.
 */
export function MoreToolsSheet(props: MoreToolsSheetProps) {
  const { quoteId, publicLink, lines } = props;
  const working = linesWithWorking(lines);
  const hasMaterials = lines.some((line) => line.type !== "labour");
  return (
    <BottomSheet open onClose={props.onClose} title="More tools" description="Everything else for this job.">
      <div className="space-y-3" data-testid="job-more-tools">
        {publicLink ? (
          <ToolSection id="link" title="Your client's link" subtitle="Where they see and accept the quote">
            <div className="grid gap-2">
              <CopyButton text={publicLink} variant="secondary" icon={<LinkSimple weight="bold" />} failHint="Couldn't copy the link.">
                Copy the link
              </CopyButton>
              <a
                href={publicLink}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses({ variant: "ghost", fullWidth: true })}
              >
                <ArrowSquareOut aria-hidden="true" weight="bold" className="text-[1.15em]" />
                Open it
              </a>
            </div>
          </ToolSection>
        ) : null}

        <ToolSection id="pdf" title="Quote PDF" subtitle="Download it or keep a copy">
          <div className="grid gap-2">
            <SavePdfButton
              url={`/api/quotes/${quoteId}/pdf`}
              filename={`quote-${quoteId}.pdf`}
              label="Download the PDF"
              className={buttonClasses({ variant: "secondary", fullWidth: true })}
            />
            {props.hasPdf ? (
              <ButtonLink href={`/app/quotes/preview/${quoteId}/pdf`} variant="ghost" fullWidth icon={<FileText weight="bold" />}>
                See the PDF your client got
              </ButtonLink>
            ) : null}
          </div>
        </ToolSection>

        <ToolSection id="photos" title="Photos" subtitle="Photos of the site for this job">
          <QuotePhotos quoteId={quoteId} />
        </ToolSection>

        {hasMaterials ? (
          <ToolSection id="materials-list" title="Materials list" subtitle="Quantities only, for the merchant">
            <MaterialsListButton items={lines} jobSummary={props.jobSummary} />
          </ToolSection>
        ) : null}

        {props.bookedDate ? (
          <ToolSection id="day-notes" title="Notes for the job day">
            <DayNotes day={props.bookedDate} notes={props.dayNotes} />
          </ToolSection>
        ) : null}

        {props.notes.length > 0 ? (
          <ToolSection id="quote-notes" title="Things to check" subtitle={`${props.notes.length} ${props.notes.length === 1 ? "note" : "notes"}`}>
            <ul className="list-disc space-y-1 pl-5">
              {props.notes.map((note, i) => (
                <li key={`${i}-${note}`}>{note}</li>
              ))}
            </ul>
          </ToolSection>
        ) : null}

        {props.serverTools.map((tool) => (
          <ToolSection key={tool.id} id={tool.id} title={tool.title} subtitle={tool.subtitle}>
            {tool.content}
          </ToolSection>
        ))}

        {lines.length > 0 ? (
          <ToolSection id="csi" title="Trade groups" subtitle="The same lines grouped by trade">
            <CsiGroupedView items={lines} />
          </ToolSection>
        ) : null}

        {working.length > 0 ? (
          <ToolSection id="working" title="How the numbers were worked out">
            <ul className="space-y-4">
              {working.map((line, i) => (
                <li key={`${i}-${line.description}`} className="space-y-2">
                  <p className="font-semibold">{line.description || "Untitled line"}</p>
                  {explainFormula(line.formula) ? <p className="text-ui-muted">{explainFormula(line.formula)}</p> : null}
                  <T2QCALWorking line={line} />
                </li>
              ))}
            </ul>
          </ToolSection>
        ) : null}

        <div className="grid gap-2 pt-2">
          <ButtonLink href={detailedEditorHref(quoteId)} variant="secondary" fullWidth icon={<PencilSimpleLine weight="bold" />}>
            Open the detailed editor
          </ButtonLink>
          <p className="text-ui-sm text-ui-muted">
            Terms, markup, measurements, drawing sizes and supplier checks, in the older layout.
          </p>
          {props.onDecline ? (
            <Button variant="ghost" fullWidth icon={<XCircle weight="bold" />} onClick={props.onDecline}>
              They said no
            </Button>
          ) : null}
        </div>
      </div>
    </BottomSheet>
  );
}
