"use client";

import { useRef } from "react";
import { FloppyDisk, PencilSimple } from "@phosphor-icons/react/dist/ssr";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { useReducedMotion } from "@/components/ui/lib/use-reduced-motion";
import { SectionTitle } from "@/components/ui/section-title";
import { Skeleton } from "@/components/ui/skeleton";
import { TextField } from "@/components/ui/text-field";
import { TextAreaField } from "../../settings/_newlook/fields";
import { EMPTY_TEMPLATE, useTermsTemplates, type Template, type TermsTemplatesState } from "../_lib/useTermsTemplates";

/** The old page's words when templates aren't on; the iPhone app names no plan (3.1.3(f)). */
function NotSwitchedOn({ inApp }: { inApp: boolean }) {
  if (inApp) {
    return (
      <Card as="section" padding="lg" data-testid="templates-off">
        <p className="text-ui-muted">Shared terms templates aren&rsquo;t switched on for this account.</p>
      </Card>
    );
  }
  return (
    <Card as="section" padding="lg" className="space-y-4" data-testid="templates-off">
      <p className="text-ui-muted">Reusable team terms are included with Builder.</p>
      <ButtonLink href="/app/upgrade?plan=builder" variant="secondary" fullWidth>
        View plans
      </ButtonLink>
    </Card>
  );
}

/**
 * /app/templates in the new look: the form in a card with a big text box,
 * then each saved template as a card. Same API and checks as the old page
 * (through useTermsTemplates); `inApp` is decided on the server.
 */
export function TemplatesView({ templates, inApp }: { templates: TermsTemplatesState; inApp: boolean }) {
  const { items, enabled, edit, loaded, form, setForm, error, notice, busy, save } = templates;
  const formRef = useRef<HTMLFormElement>(null);
  const reducedMotion = useReducedMotion();

  const startEdit = (template: Template) => {
    setForm(template);
    // The form is at the top; bring it into view on a phone.
    formRef.current?.scrollIntoView({ block: "start", behavior: reducedMotion ? "instant" : "smooth" });
  };

  return (
    <div className="space-y-6" data-testid="templates-view">
      {error ? (
        <div role="alert">
          <Callout tone="bad" title={error} />
        </div>
      ) : null}
      {notice ? (
        <div role="status">
          <Callout tone="ok" title={notice} />
        </div>
      ) : null}

      {!loaded && !error ? (
        <div role="status" aria-busy="true" className="space-y-3">
          <p className="text-ui-muted">Loading your templates…</p>
          <Skeleton className="h-40 w-full" />
        </div>
      ) : null}

      {loaded && !enabled ? <NotSwitchedOn inApp={inApp} /> : null}

      {edit ? (
        <Card as="section" padding="lg" aria-labelledby="templates-form-title">
          <form ref={formRef} onSubmit={save} className="scroll-mt-28 space-y-6" data-testid="templates-form">
            <SectionTitle id="templates-form-title">{form.id ? "Change this template" : "Add a template"}</SectionTitle>
            <TextField
              label="Template name"
              required
              maxLength={100}
              autoComplete="off"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
            <TextAreaField
              label="Your terms"
              required
              rows={8}
              maxLength={20000}
              value={form.body}
              onChange={(event) => setForm({ ...form, body: event.target.value })}
            />
            <div className="space-y-2">
              <Button type="submit" fullWidth loading={busy} loadingLabel="Saving…" icon={<FloppyDisk weight="bold" />}>
                Save template
              </Button>
              {form.id ? (
                <Button variant="ghost" fullWidth onClick={() => setForm(EMPTY_TEMPLATE)}>
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </form>
        </Card>
      ) : null}

      {items.length > 0 ? (
        <section aria-labelledby="templates-list-title" className="space-y-3">
          <SectionTitle id="templates-list-title">Your templates</SectionTitle>
          <ul className="space-y-3" data-testid="templates-list">
            {items.map((template) => (
              <Card as="li" key={template.id} padding="lg" className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="ui-title min-w-0 text-ui-lg break-words text-ui-text">{template.title}</h3>
                  {edit ? (
                    <Button variant="secondary" size="sm" icon={<PencilSimple weight="bold" />} onClick={() => startEdit(template)}>
                      Edit
                    </Button>
                  ) : null}
                </div>
                <p className="break-words whitespace-pre-wrap text-ui-muted">{template.body}</p>
              </Card>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** The live page part: the templates hook plus the view. */
export function TemplatesCards({ inApp = false }: { inApp?: boolean }) {
  return <TemplatesView templates={useTermsTemplates()} inApp={inApp} />;
}
