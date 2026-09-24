// Markup contracts for the kit (roles, names, states, sizes). Rendered to
// static HTML in node like the repo's other *.test.tsx files; the interactive
// rules live in pure modules under ./lib and are tested there.

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { BottomActionBar } from "./bottom-action-bar";
import { BottomSheet, SheetPanel } from "./bottom-sheet";
import { Button, ButtonLink } from "./button";
import { Callout } from "./callout";
import { Card } from "./card";
import { EmptyState } from "./empty-state";
import { IconButton } from "./icon-button";
import { ListRow } from "./list-row";
import { Money } from "./money";
import { NumberPad } from "./number-pad";
import { OutdoorModeToggle } from "./outdoor-mode-toggle";
import { Screen } from "./screen";
import { SectionTitle } from "./section-title";
import { SegmentedControl } from "./segmented-control";
import { Skeleton } from "./skeleton";
import { StatusPill } from "./status-pill";
import { StatusRail } from "./status-rail";
import { NumberField, TextField } from "./text-field";
import { ToastProvider, useToast } from "./toast";
import { Toggle } from "./toggle";
import { TopBar } from "./top-bar";

const html = (el: ReactElement) => renderToStaticMarkup(el);
const noop = () => {};
/** The opening tag of the first element matching a fragment. */
const tag = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, `"${fragment}" in ${markup.slice(0, 200)}`).toBeGreaterThanOrEqual(0);
  const start = markup.lastIndexOf("<", at);
  return markup.slice(start, markup.indexOf(">", at) + 1);
};

describe("Button", () => {
  it("primary is the big 56 px button; others are 48 px; sm keeps a 48 px tap area", () => {
    expect(html(<Button>Send quote</Button>)).toContain("min-h-14");
    expect(html(<Button variant="secondary">Edit</Button>)).toContain("min-h-12");
    expect(html(<Button variant="ghost">Skip</Button>)).toContain("min-h-12");
    const sm = html(<Button variant="secondary" size="sm">Edit</Button>);
    expect(sm).toContain("min-h-10");
    expect(sm).toContain("after:-inset-1");
  });

  it("never submits a form by accident and shows its label", () => {
    const out = html(<Button>Send quote</Button>);
    expect(out).toMatch(/^<button type="button"/);
    expect(out).toContain(">Send quote</span>");
  });

  it("loading: busy, blocked, spinner hidden from screen readers, optional label", () => {
    const out = html(
      <Button loading loadingLabel="Saving…">
        Save
      </Button>,
    );
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain("disabled");
    expect(out).toMatch(/<svg[^>]*aria-hidden="true"[^>]*animate-spin/);
    expect(out).toContain("motion-reduce:animate-none");
    expect(out).toContain(">Saving…</span>");
    // Loading keeps the variant's colours (it is not greyed out like disabled).
    expect(out).toContain("bg-ui-brand");
  });

  it("disabled looks disabled", () => {
    const out = html(<Button disabled>Send</Button>);
    expect(out).toContain("text-ui-faint");
    expect(out).not.toContain("bg-ui-brand");
  });

  it("full width and icons", () => {
    const out = html(
      <Button fullWidth icon={<Plus />}>
        New quote
      </Button>,
    );
    expect(out).toContain("w-full");
    expect(out).toMatch(/<span aria-hidden="true"[^>]*><svg/);
  });

  it("ButtonLink is a real link that looks like a button", () => {
    const out = html(
      <ButtonLink href="/app/quotes/new" variant="secondary">
        Start a quote
      </ButtonLink>,
    );
    expect(out).toMatch(/^<a [^>]*href="\/app\/quotes\/new"/);
    expect(out).toContain("min-h-12");
  });
});

describe("IconButton", () => {
  it("is 48 × 48 with its label as the accessible name", () => {
    const out = html(<IconButton label="Close" icon={<Plus />} />);
    const button = tag(out, "<button");
    expect(button).toContain('aria-label="Close"');
    expect(button).toContain("h-12 w-12");
    expect(out).toMatch(/<span aria-hidden="true"/);
  });
});

describe("Toggle", () => {
  it("is a switch named by its visible label, with the state in words", () => {
    const off = html(<Toggle checked={false} onChange={noop} label="Remember for next time" id="remember" />);
    const button = tag(off, 'role="switch"');
    expect(button).toContain('aria-checked="false"');
    expect(button).toContain('aria-labelledby="remember-label"');
    expect(off).toContain('<label id="remember-label" for="remember"');
    expect(off).toContain(">Off</span>");
    const on = html(<Toggle checked onChange={noop} label="Remember" />);
    expect(tag(on, 'role="switch"')).toContain('aria-checked="true"');
    expect(on).toContain(">On</span>");
    expect(on).toContain("translate-x-6");
  });

  it("describes itself, disables, and submits with a form", () => {
    const out = html(
      <Toggle checked onChange={noop} label="Outdoor" description="For bright sun" disabled name="outdoor" id="o" />,
    );
    expect(tag(out, 'role="switch"')).toContain('aria-describedby="o-description"');
    expect(tag(out, 'role="switch"')).toContain("disabled");
    expect(out).toContain('<input type="hidden" name="outdoor" value="on"/>');
  });
});

describe("SegmentedControl", () => {
  const options = [
    { value: "all", label: "All" },
    { value: "unpaid", label: "Unpaid" },
    { value: "paid", label: "Paid" },
  ] as const;

  it("is a radio group with one tab stop on the chosen option", () => {
    const out = html(<SegmentedControl label="Show" options={options} value="unpaid" onChange={noop} />);
    expect(out).toContain('role="radiogroup"');
    const radios = out.match(/<button[^>]*role="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(3);
    expect(radios.map((r) => /aria-checked="true"/.test(r))).toEqual([false, true, false]);
    expect(radios.map((r) => /tabindex="0"/.test(r))).toEqual([false, true, false]);
    for (const r of radios) expect(r).toContain("min-h-12");
    expect(out).not.toContain('role="tab"');
  });

  it("falls back to the first option for an unknown value", () => {
    const out = html(
      <SegmentedControl label="Show" options={options} value={"x" as "all"} onChange={noop} />,
    );
    expect(tag(out, 'role="radio"')).toContain('aria-checked="true"');
  });
});

describe("StatusRail", () => {
  it("lists the six steps and marks the one waiting as the current step", () => {
    const out = html(<StatusRail position="Booked" />);
    expect(out).toContain('aria-label="Job progress"');
    const items = out.match(/<li[^>]*>/g) ?? [];
    expect(items).toHaveLength(6);
    expect(items.filter((li) => li.includes('aria-current="step"'))).toHaveLength(1);
    expect(tag(out, 'aria-current="step"')).toContain('data-state="current"');
    expect(out).toContain('>Booked</span><span class="sr-only">, next up</span>');
    expect(out).toContain("scaleX(0.6)");
  });

  it("a paid job is all done", () => {
    const out = html(<StatusRail position="complete" />);
    expect(out).not.toContain("aria-current");
    expect((out.match(/data-state="done"/g) ?? []).length).toBe(6);
    expect(out).toContain("scaleX(1)");
  });

  it("animates the fill with transform only, and not for reduced motion", () => {
    const out = html(<StatusRail position="Sent" />);
    expect(tag(out, "data-rail-fill")).toContain("transition-transform");
    expect(tag(out, "data-rail-fill")).toContain("motion-reduce:transition-none");
    expect(tag(html(<StatusRail position="Sent" animate={false} />), "data-rail-fill")).not.toContain(
      "transition",
    );
  });
});

describe("Money", () => {
  it("uses the app's money format with tabular figures", () => {
    expect(html(<Money amount={1240} />)).toBe(
      '<span data-amount="1240" class="tabular-nums whitespace-nowrap">$1,240.00</span>',
    );
    expect(html(<Money amount={3.85} currency="GBP" />)).toContain(">£3.85<");
    expect(html(<Money amount={-20} currency="AUD" />)).toContain(">-$20.00<");
    expect(html(<Money amount={Number.NaN} />)).toContain(">$0.00<");
  });
});

describe("BottomSheet", () => {
  it("renders nothing inside the dialog while closed", () => {
    const out = html(<BottomSheet open={false} onClose={noop} title="Price" />);
    expect(out).toMatch(/^<dialog [^>]*><\/dialog>$/);
    expect(out).not.toMatch(/<dialog[^>]*\sopen(=|\s|>)/);
  });

  it("is a dialog named by its title and described, with a Close button", () => {
    const out = html(
      <BottomSheet open onClose={noop} title="What do you pay for this?" description="1 of 2">
        <p>Body</p>
      </BottomSheet>,
    );
    const dialog = tag(out, "<dialog");
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(dialog)?.[1];
    const describedBy = /aria-describedby="([^"]+)"/.exec(dialog)?.[1];
    expect(out).toContain(`<h2 id="${labelledBy}"`);
    expect(out).toContain(`<p id="${describedBy}"`);
    expect(out).toContain('aria-label="Close"');
    expect(out).toContain("animate-ui-sheet-in motion-reduce:animate-none");
    expect(out).toContain("data-sheet-scrim");
  });

  it("SheetPanel can be shown inline (kit previews)", () => {
    const out = html(<SheetPanel title="Preview" footer={<span>Save</span>} />);
    expect(out).toContain(">Preview</h2>");
    expect(out).not.toContain('aria-label="Close"');
  });
});

describe("NumberPad", () => {
  it("has twelve big keys with spoken names for the symbols", () => {
    const out = html(<NumberPad value="" onChange={noop} label="Price" />);
    expect(out).toContain('role="group" aria-label="Price"');
    const keys = out.match(/<button[^>]*>/g) ?? [];
    expect(keys).toHaveLength(12);
    for (const k of keys) expect(k).toContain("min-h-16");
    expect(tag(out, 'data-key="."')).toContain('aria-label="Decimal point"');
    expect(tag(out, 'data-key="backspace"')).toContain('aria-label="Delete last digit"');
  });

  it("drops the point key for whole numbers", () => {
    const out = html(<NumberPad value="" onChange={noop} decimals={0} />);
    expect(out).not.toContain('data-key="."');
    expect((out.match(/<button/g) ?? []).length).toBe(11);
  });
});

describe("TextField and NumberField", () => {
  it("labels the input and wires hint and error to it", () => {
    const out = html(
      <TextField id="name" label="Client name" hint="As it goes on the quote" error="Add a name" />,
    );
    expect(out).toContain('<label for="name"');
    const input = tag(out, "<input");
    expect(input).toContain('aria-invalid="true"');
    expect(input).toContain('aria-describedby="name-hint name-error"');
    expect(input).toContain("ui-input-reset");
    expect(out).toContain('id="name-error"');
    expect(out).toContain("border-ui-bad");
  });

  it("NumberField brings up the number keyboard", () => {
    const out = html(
      <NumberField id="price" label="Price each" prefix="$" value="3.85" onValueChange={noop} />,
    );
    const input = tag(out, "<input");
    expect(input).toContain('inputMode="decimal"');
    expect(input).toContain('value="3.85"');
    expect(input).toContain("tabular-nums");
    expect(out).toContain(">$</span>");
    expect(tag(html(<NumberField label="Count" value="" onValueChange={noop} decimals={0} />), "<input")).toContain(
      'inputMode="numeric"',
    );
  });
});

describe("Toast", () => {
  it("keeps a polite live region in the page", () => {
    const out = html(
      <ToastProvider>
        <p>Page</p>
      </ToastProvider>,
    );
    expect(out).toContain('role="status" aria-live="polite"');
  });

  it("useToast outside the provider fails loudly", () => {
    function Orphan() {
      useToast();
      return null;
    }
    expect(() => html(createElement(Orphan))).toThrow(/ToastProvider/);
  });
});

describe("content parts", () => {
  it("ListRow is a link, a button or plain content", () => {
    expect(html(<ListRow title="Decking" href="/x" />)).toMatch(/^<a [^>]*href="\/x"/);
    expect(html(<ListRow title="Hangers" onClick={noop} />)).toMatch(/^<button type="button"/);
    const plain = html(<ListRow title="Labour" subtitle="3 days" trailing={<Money amount={1680} />} />);
    expect(plain).toMatch(/^<div /);
    expect(plain).not.toContain("<svg");
    expect(plain).toContain("min-h-16");
    expect(html(<ListRow title="x" href="/x" />)).toContain("<svg");
  });

  it("SectionTitle: page titles are the big heading, sections the sans title", () => {
    expect(html(<SectionTitle size="page">Morning, Mike</SectionTitle>)).toMatch(/<h1 [^>]*ui-heading/);
    expect(html(<SectionTitle>What&apos;s in the job</SectionTitle>)).toMatch(/<h2 [^>]*ui-title/);
  });

  it("TopBar has a clear way back and the screen title", () => {
    const out = html(<TopBar title="Deck at 14 Rata St" back={{ href: "/app" }} />);
    expect(out).toMatch(/<a [^>]*href="\/app"[^>]*>.*Back<\/a>/);
    expect(out).toMatch(/<h1 [^>]*>Deck at 14 Rata St<\/h1>/);
  });

  it("TopBar owns the notch, or sticks just below it where the shell owns it", () => {
    const own = tag(html(<TopBar title="Jobs" />), "<header");
    expect(own).toContain("top-0 pt-[env(safe-area-inset-top)]");
    const shell = tag(html(<TopBar title="Jobs" safeArea={false} />), "<header");
    expect(shell).toContain("top-[env(safe-area-inset-top)]");
    expect(shell).not.toContain("top-0");
    expect(shell).not.toContain("pt-[env(safe-area-inset-top)]");
  });

  it("BottomActionBar sticks to the bottom clear of the home indicator", () => {
    const out = html(
      <BottomActionBar hint="Next: book the job">
        <Button fullWidth>Book the job</Button>
      </BottomActionBar>,
    );
    expect(out).toContain("sticky bottom-0");
    expect(out).toContain("env(safe-area-inset-bottom)");
    expect(out).toContain("Next: book the job");
  });

  it("StatusPill, Callout, EmptyState, Skeleton, Card, Screen use ui tokens", () => {
    expect(html(<StatusPill tone="warn">Needs price</StatusPill>)).toContain("bg-ui-warn-soft text-ui-warn");
    const callout = html(<Callout tone="warn" title="2 items need your price" />);
    expect(callout).toContain("border-ui-warn bg-ui-warn-soft");
    expect(html(<EmptyState title="No jobs yet" />)).toMatch(/<h2 [^>]*>No jobs yet<\/h2>/);
    expect(html(<Skeleton />)).toContain('aria-hidden="true"');
    expect(html(<Skeleton />)).toContain("motion-reduce:animate-none");
    expect(html(<Card>Hi</Card>)).toContain("rounded-ui-lg border border-ui-line bg-ui-surface");
    expect(html(<Screen>Hi</Screen>)).toContain("[color-scheme:var(--ui-color-scheme)]");
  });
});

describe("OutdoorModeToggle", () => {
  it("is a labelled switch showing the device setting", () => {
    const off = html(<OutdoorModeToggle initialOn={false} />);
    expect(tag(off, 'role="switch"')).toContain('aria-checked="false"');
    expect(off).toContain(">Outdoor mode</label>");
    expect(tag(html(<OutdoorModeToggle initialOn />), 'role="switch"')).toContain('aria-checked="true"');
  });
});
