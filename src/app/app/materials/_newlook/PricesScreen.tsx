import { Suspense } from "react";
import { headers } from "next/headers";
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
import type { TopBarData } from "../../_v2/lib/top-bar";
import { TabTopBar } from "../../_v2/shell/TabTopBar";
import { ScanBarcodeButton } from "../_components/ScanBarcodeButton";
import { PricesList } from "./PricesList";
import { cameFromCapture, toLibraryMaterial, toPriceRow, type MaterialRecord } from "./prices-model";

export const PRICES_EXPLAINER = "Materials on a new quote fill in from here. Add a price once and it's remembered.";

/** The old page's select and order: most used first, then by name. */
const MATERIAL_COLUMNS =
  "id, name, unit, default_unit_price, supplier, supplier_url, notes, usage_count, is_ai_estimated, last_used_at";

/**
 * /app/materials in the new look: "Your prices". The heading paints at
 * once; the list streams in behind a skeleton, as the old page's does.
 */
export function PricesScreen({ userId, bar }: { userId: string; bar: TopBarData }) {
  return (
    <Screen data-testid="prices-screen">
      <div className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 pt-6 pb-10">
        <TabTopBar data={bar} title="Your prices" description={PRICES_EXPLAINER} />
        <Suspense fallback={<PricesSkeleton />}>
          <PricesBody userId={userId} />
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
export async function PricesBody({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [materialsResult, profileResult, requestHeaders] = await Promise.all([
    supabase
      .from("materials")
      .select(MATERIAL_COLUMNS)
      .eq("user_id", userId)
      .order("usage_count", { ascending: false })
      .order("name", { ascending: true }),
    supabase.from("profiles").select("currency").eq("id", userId).maybeSingle(),
    headers(),
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
  const materials = ((materialsResult.data ?? []) as MaterialRecord[]).map(toLibraryMaterial);
  const rows = materials.map(toPriceRow);
  const empty = rows.length === 0;
  const fromCapture = cameFromCapture(requestHeaders.get("referer"));

  return (
    <>
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
            icon={<Tag weight="bold" />}
            title="No prices yet"
            action={
              <ButtonLink href="/app/materials/quick-start" fullWidth icon={<Lightning weight="bold" />}>
                Quick start
              </ButtonLink>
            }
          >
            Quick start lists the everyday items for your trade. Put in what you pay and you&apos;re set.
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
                icon={<LinkSimple weight="bold" />}
                title="Copy from a supplier's website"
                subtitle="Paste a product link and we save the price."
              />
            </li>
            <li>
              <ListRow
                href="/app/suppliers"
                icon={<Storefront weight="bold" />}
                title="Shop supplier websites"
                subtitle="Mitre 10, Bunnings, ITM and PlaceMakers, inside the app."
              />
            </li>
            {kitsEnabled() ? (
              <li>
                <ListRow
                  href="/app/materials/kits"
                  icon={<Stack weight="bold" />}
                  title="Kits"
                  subtitle="Save a standard job once, then add it to a quote in one tap."
                />
              </li>
            ) : null}
          </ul>
        </Card>
      </section>
    </>
  );
}
