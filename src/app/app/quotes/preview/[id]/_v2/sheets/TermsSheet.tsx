"use client";

import { useState } from "react";
import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { SelectField, TextAreaField } from "@/app/app/settings/_newlook/fields";
import { useTermsTemplates } from "@/app/app/templates/_lib/useTermsTemplates";

/** A saved terms template, as the picker lists it. */
export interface TermsTemplateChoice {
  id: string;
  title: string;
}

export interface TermsSheetViewProps {
  /** What's in the box: the quote's terms as the sheet opened, then as typed. */
  draft: string;
  /** The tradie's saved terms to pick from; [] while they load or when there are none. */
  templates: readonly TermsTemplateChoice[];
  /** The saved terms last put in the box, while what was there before can go back. */
  replaced: string | null;
  /** Accepted and later: the terms show, but can't change. */
  locked: boolean;
  busy: boolean;
  error: string | null;
  onType: (terms: string) => void;
  onPick: (templateId: string) => void;
  onUndo: () => void;
  onSave: () => void;
  onClose: () => void;
}

/**
 * The quote's terms in a big box, with the tradie's saved terms one pick
 * away (the classic editor's terms card and template picker). A pick swaps
 * the box's words and can be put back until the sheet saves. A locked quote
 * shows its terms read-only.
 */
export function TermsSheetView({
  draft,
  templates,
  replaced,
  locked,
  busy,
  error,
  onType,
  onPick,
  onUndo,
  onSave,
  onClose,
}: TermsSheetViewProps) {
  if (locked) {
    return (
      <BottomSheet
        open
        onClose={onClose}
        title="Terms"
        description="This quote has been accepted, so its terms can't change now."
        footer={
          <Button fullWidth onClick={onClose}>
            Done
          </Button>
        }
      >
        <div data-testid="job-terms" data-locked="true">
          {draft.trim() ? (
            <Card className="break-words whitespace-pre-line">{draft}</Card>
          ) : (
            <p className="text-ui-muted">There are no terms on this quote.</p>
          )}
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Terms"
      description="Your client sees these under the total on the quote."
      footer={
        <Button fullWidth data-testid="job-terms-save" loading={busy} loadingLabel="Saving…" onClick={onSave}>
          Save the terms
        </Button>
      }
    >
      <div className="space-y-5" data-testid="job-terms" data-locked="false">
        {templates.length > 0 ? (
          <div className="space-y-3">
            <SelectField
              label="Use your saved terms"
              value=""
              onChange={(event) => onPick(event.target.value)}
              options={[
                { value: "", label: "Pick saved terms…" },
                ...templates.map((template) => ({ value: template.id, label: template.title })),
              ]}
              hint="It replaces what's in the box below."
              disabled={busy}
              data-testid="job-terms-template"
            />
            <div aria-live="polite">
              {replaced ? (
                <Callout
                  tone="info"
                  title={`Swapped in “${replaced}”`}
                  action={
                    <Button
                      variant="secondary"
                      fullWidth
                      icon={<ArrowCounterClockwise weight="bold" />}
                      disabled={busy}
                      onClick={onUndo}
                    >
                      Put back what was there
                    </Button>
                  }
                >
                  Check the wording before you save.
                </Callout>
              ) : null}
            </div>
          </div>
        ) : null}
        <TextAreaField
          label="Your terms"
          value={draft}
          onChange={(event) => onType(event.target.value)}
          rows={8}
          disabled={busy}
          data-testid="job-terms-text"
        />
        {error ? (
          <div role="alert">
            <Callout tone="bad" title={error} />
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}

export interface TermsSheetProps {
  /** quote_data.terms as the page shows it. */
  terms: string;
  /** Accepted and later (the save action refuses a locked quote anyway). */
  locked?: boolean;
  /** Saves the quote with these terms (optimistic on the page, rolled back on failure). */
  onSave: (terms: string) => Promise<{ ok: true } | { error: string }>;
  onClose: () => void;
}

const noop = () => {};

/**
 * Change the quote's terms without leaving the job. The saved templates come
 * from /api/terms-templates (useTermsTemplates, as on the templates page);
 * a locked quote only shows its terms, so nothing is loaded for it.
 */
export function TermsSheet(props: TermsSheetProps) {
  if (props.locked) {
    return (
      <TermsSheetView
        draft={props.terms ?? ""}
        templates={[]}
        replaced={null}
        locked
        busy={false}
        error={null}
        onType={noop}
        onPick={noop}
        onUndo={noop}
        onSave={props.onClose}
        onClose={props.onClose}
      />
    );
  }
  return <EditTerms {...props} />;
}

function EditTerms({ terms, onSave, onClose }: TermsSheetProps) {
  // The terms as the sheet opened: Save with nothing changed just closes.
  const [opened] = useState(terms ?? "");
  const [draft, setDraft] = useState(opened);
  const [replaced, setReplaced] = useState<{ title: string; before: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { items } = useTermsTemplates();
  // Templates are a help, never a reason for the sheet to fail: odd rows are skipped.
  const saved = (Array.isArray(items) ? items : []).flatMap((template) =>
    template?.id && typeof template.body === "string" && template.body.trim()
      ? [{ id: template.id, title: template.title?.trim() || "Untitled terms", body: template.body }]
      : [],
  );

  function pick(id: string) {
    const template = saved.find((t) => t.id === id);
    if (!template) return;
    // Put back what the tradie had, not an earlier pick.
    setReplaced((last) => ({ title: template.title, before: last?.before ?? draft }));
    setDraft(template.body);
    setError(null);
  }

  function undo() {
    if (!replaced) return;
    setDraft(replaced.before);
    setReplaced(null);
  }

  async function save() {
    if (draft === opened) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    let result: { ok: true } | { error: string };
    try {
      result = await onSave(draft);
    } catch {
      result = { error: "That didn't save. Check your signal and try again." };
    }
    setBusy(false);
    if ("error" in result) setError(result.error);
  }

  return (
    <TermsSheetView
      draft={draft}
      templates={saved}
      replaced={replaced?.title ?? null}
      locked={false}
      busy={busy}
      error={error}
      onType={setDraft}
      onPick={pick}
      onUndo={undo}
      onSave={save}
      onClose={onClose}
    />
  );
}
