import { Suspense } from "react";
import {
  ArrowClockwise,
  Camera,
  Lightning,
  LinkSimple,
  Plus,
  Stack,
  Storefront,
  Tag,
  UploadSimple,
} from "@phosphor-icons/react/dist/ssr";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { Screen } from "@/components/ui/screen";
import { SectionTitle } from "@/components/ui/section-title";
import { Skeleton } from "@/components/ui/skeleton";
import { kitsEnabled } from "@/lib/kits";
import { NZ_DEFAULTS } from "@/lib/quote-defaults";
import { createClient } from "@/lib/supabase/server";
import { loadAllMaterials } from "@/lib/materials/loadLibrary";
import { STARTER_MATERIALS } from "../quick-start/_data";
import type { TopBarData } from "../../_v2/lib/top-bar";
import { TabTopBar } from "../../_v2/shell/TabTopBar";
import { ScanBarcodeButton } from "../_components/ScanBarcodeButton";
import { PricesList } from "./PricesList";
import { toLibraryMaterial, toPriceRow, type MaterialRecord } from "./prices-model";

export const PRICES_EXPLAINER = "Materials on a new quote fill in from here. Add a price once and it's remembered.";

/** The old page's select and order: most used first, then by name. */
const MATERIAL_COLUMNS =
  "id, name, unit, default_unit_price, supplier, supplier_url, notes, usage_count, is_ai_estimated, last_used_at";

/**
 * /app/materials in the new look: "Your prices". The heading paints at
 * once; the list streams in behind a skeleton, as the old page's does.
 */
export function PricesScreen({
  userId,
  bar,
  captured = false,
  quickStart = null,
}: {
  userId: string;
  bar: TopBarData;
  /** An explicit, success-only signal from createMaterial's own redirect —
   *  never guessed from the referer (a Cancel and a save both leave from
   *  the same capture page, so the referer alone can't tell them apart). */
  captured?: boolean;
  /** Quick start just ran: what it added and what was already there. */
  quickStart?: { added: number; already: number } | null;
}) {
  return (
    <Screen data-testid="prices-screen">
      <div className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 pt-6 pb-10">
        <TabTopBar data={bar} title="Your prices" description={PRICES_EXPLAINER} />
        <Suspense fallback={<PricesSkeleton />}>
          <PricesBody userId={userId} captured={captured} quickStart={quickStart} />
        </Suspense>
      </div>
    </Screen>
  );
}

function PricesSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your prices" className="space-y-3">
      <Skeleton className="h-14 w-full" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** The data-driven part (exported for its node test). */
export async function PricesBody({
  userId,
  captured = false,
  quickStart = null,
}: {
  userId: string;
  captured?: boolean;
  quickStart?: { added: number; already: number } | null;
}) {
  const supabase = await createClient();
  const [materialsResult, profileResult] = await Promise.all([
    // The whole library, a page at a time (loadAllMaterials) — a plain
    // `.select()` here silently dropped everything past row 1,000.
    loadAllMaterials<MaterialRecord>(supabase, userId, {
      select: MATERIAL_COLUMNS,
      order: [
        { column: "usage_count", ascending: false },
        { column: "name", ascending: true },
      ],
    })
      .then((data) => ({ data, error: null }))
      .catch((error) => ({ data: null, error })),
    supabase.from("profiles").select("currency").eq("id", userId).maybeSingle(),
  ]);

  if (materialsResult.error) {
    return (
      <Callout
        tone="bad"
        title="Couldn't load your prices"
        action={
          <a href="/app/materials" className={buttonClasses({ variant: "secondary" })}>
            <ArrowClockwise aria-hidden="true" weight="bold" className="text-[1.15em]" />
            <span>Try again</span>
          </a>
        }
      >
        Nothing has been changed. Check your signal, then try again.
      </Callout>
    );
  }

  const currency = profileResult.data?.currency ?? NZ_DEFAULTS.currency;
  const materials = (materialsResult.data ?? []).map(toLibraryMaterial);
  const rows = materials.map(toPriceRow);
  const empty = rows.length === 0;
  const fromCapture = captured;

  return (
    <>
      {quickStart ? (
        <Callout tone="ok" title={quickStartTitle(quickStart.added)}>
          {quickStartBody(quickStart)}
        </Callout>
      ) : null}

      {fromCapture ? (
        <Callout
          tone="ok"
          title="Price saved"
          action={
            <ButtonLink href="/app/materials/capture" variant="secondary" icon={<Plus weight="bold" />}>
              Copy another
            </ButtonLink>
          }
        >
          Your list has one more item. Quotes use it instead of an estimate.
        </Callout>
      ) : null}

      {empty ? (
        <Card padding="none">
          <EmptyState
            icon={<Tag weight="duotone" />}
            title="No prices yet"
            action={
              <ButtonLink href="/app/materials/quick-start" fullWidth icon={<Lightning weight="bold" />}>
                Quick start
              </ButtonLink>
            }
          >
            Quick start lists {STARTER_MATERIALS.length} everyday building items. Put in what you pay and you&apos;re set.
          </EmptyState>
        </Card>
      ) : null}

      <section aria-label="Add prices" className="space-y-2">
        {empty ? null : (
          <ButtonLink href="/app/materials/new" fullWidth icon={<Plus weight="bold" />} data-testid="prices-add">
            Add a price
          </ButtonLink>
        )}
        <div className="grid grid-cols-2 gap-2">
          {/* Found: opens the item. New: saved to your prices with its code. */}
          <ScanBarcodeButton
            look="new"
            mode="library"
            currency={currency}
            library={materials}
            className={buttonClasses({ variant: "secondary", fullWidth: true })}
          />
          <ButtonLink href="/app/materials/import-quote" variant="secondary" icon={<Camera weight="bold" />}>
            Scan a supplier quote
          </ButtonLink>
          <ButtonLink href="/app/materials/import" variant="secondary" icon={<UploadSimple weight="bold" />}>
            Import a price list
          </ButtonLink>
          {empty ? (
            <ButtonLink href="/app/materials/new" variant="secondary" icon={<Plus weight="bold" />} data-testid="prices-add">
              Add a price
            </ButtonLink>
          ) : (
            <ButtonLink href="/app/materials/quick-start" variant="secondary" icon={<Lightning weight="bold" />}>
              Quick start
            </ButtonLink>
          )}
        </div>
      </section>

      {empty ? null : <PricesList rows={rows} currency={currency} />}

      <section aria-labelledby="prices-more-title" className="space-y-3">
        <SectionTitle id="prices-more-title">More ways to add prices</SectionTitle>
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-ui-line">
            <li>
              <ListRow
                href="/app/materials/capture"
                icon={<LinkSimple weight="duotone" />}
                iconTone="info"
                title="Copy from a supplier's website"
                subtitle="Paste a product link and type in the price you see."
              />
            </li>
            <li>
              <ListRow
                href="/app/suppliers"
                icon={<Storefront weight="duotone" />}
                iconTone="ok"
                title="Shop supplier websites"
                subtitle="Mitre 10, Bunnings, ITM and PlaceMakers, inside the app."
              />
            </li>
            {kitsEnabled() ? (
              <li>
                <ListRow
                  href="/app/materials/kits"
                  icon={<Stack weight="duotone" />}
                  iconTone="tools"
                  title="Kits"
                  subtitle="Save a standard job's lines once, then add them from the job page's Add a kit."
                />
              </li>
            ) : null}
          </ul>
        </Card>
      </section>
    </>
  );
}

/** "Added 9 prices" — or, when every item was already there, says so. */
export function quickStartTitle(added: number): string {
  if (added === 0) return "Nothing new to add";
  return `Added ${added} ${added === 1 ? "price" : "prices"}`;
}

/** What the quick start changed, plainly: never claims an item it skipped. */
export function quickStartBody({ added, already }: { added: number; already: number }): string {
  const had = already > 0 ? `${already} ${already === 1 ? "was" : "were"} already in your list.` : "";
  if (added === 0) return had || "Your list already had these items.";
  return had ? `${had} Quotes use the new prices instead of an estimate.` : "Quotes use them instead of an estimate.";
}
