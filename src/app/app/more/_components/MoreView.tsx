import Image from "next/image";
import Link from "next/link";
import { Calculator, Ruler, SignOut, Stack } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { OutdoorModeToggle } from "@/components/ui/outdoor-mode-toggle";
import { Screen } from "@/components/ui/screen";
import { SectionTitle } from "@/components/ui/section-title";
import { cx } from "@/components/ui/cx";
import { PRESS, TAP } from "@/components/ui/styles";
import type { TopBarData } from "../../_v2/lib/top-bar";
import { TabTopBar } from "../../_v2/shell/TabTopBar";
import { MORE_TONE, moreMenu, type MoreGroup } from "../_lib/menu";
import { MORE_ICON } from "./more-icons";
import { NewLookRow } from "./NewLookRow";

function LinkGroup({ group }: { group: MoreGroup }) {
  const headingId = `more-${group.id}`;
  return (
    <section aria-labelledby={headingId} data-group={group.id}>
      <SectionTitle id={headingId}>{group.title}</SectionTitle>
      <Card padding="none" className="mt-2">
        <ul className="divide-y divide-ui-line">
          {group.items.map((item) => {
            const ItemIcon = MORE_ICON[item.id];
            return (
              <li key={item.id}>
                <ListRow
                  href={item.href}
                  title={item.label}
                  subtitle={item.caption}
                  icon={<ItemIcon weight="duotone" />}
                  iconTone={MORE_TONE[item.id]}
                />
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

const T2QCAL_SHORTCUTS = [
  { href: "/t2qcal/calculators", label: "Calculators", icon: Calculator },
  { href: "/t2qcal/measure", label: "Measure", icon: Ruler },
  { href: "/t2qcal/takeoff", label: "Takeoff", icon: Stack },
] as const;

/**
 * T2QCAL, first thing on More: its icon, what it is, and one tap to its
 * calculators, measuring or takeoff. Same site, same login.
 */
export function T2QCALCard() {
  return (
    <section
      aria-labelledby="more-t2qcal"
      data-testid="more-t2qcal"
      className="space-y-3 rounded-ui-lg border border-ui-line bg-ui-mark p-4 shadow-ui-card"
    >
      <div className="flex items-center gap-3">
        <Image
          src="/t2qcal/native-icon.png"
          alt=""
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-ui-md"
        />
        <div className="min-w-0">
          <h2 id="more-t2qcal" className="ui-heading text-ui-lg text-ui-on-mark">
            T2QCAL
          </h2>
          <p className="text-ui-sm text-ui-on-mark">Calculators, measuring and takeoffs from drawings. Same login.</p>
        </div>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {T2QCAL_SHORTCUTS.map(({ href, label, icon: ShortcutIcon }) => (
          <li key={href}>
            <Link
              href={href}
              className={cx(
                "ui-focus-ring flex min-h-12 flex-col items-center justify-center gap-1 rounded-ui-md bg-ui-bg px-1 py-2 text-ui-sm font-semibold text-ui-text no-underline",
                TAP,
                PRESS,
              )}
            >
              <ShortcutIcon aria-hidden="true" weight="duotone" className="text-[1.375rem] text-ui-hivis" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface MoreViewProps {
  /** The top bar: your photo, the page name and T2QCAL. */
  bar: TopBarData;
  isOwner: boolean;
  /** The t2q-outdoor cookie, so the switch paints right first time. */
  outdoor: boolean;
  /** Show the new-look preview switch (people allowed to choose). */
  canChooseLook: boolean;
}

/**
 * /app/more in the new look: everything that isn't a daily job, as big
 * rows. Outdoor mode and sign-out sit at the end of the list; the owner's
 * tools after them, for the owner only.
 */
export function MoreView({ bar, isOwner, outdoor, canChooseLook }: MoreViewProps) {
  const { groups, owner } = moreMenu({ isOwner });
  return (
    <Screen height="fill" data-testid="more-screen">
      <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-10 sm:px-6 sm:pt-10">
        <TabTopBar data={bar} title="More" />
        <div className="mt-6 space-y-6">
          <T2QCALCard />
          {groups.map((group) => (
            <LinkGroup key={group.id} group={group} />
          ))}

          <section aria-labelledby="more-device" data-group="device">
            <SectionTitle id="more-device">On this device</SectionTitle>
            <Card className="mt-2">
              <OutdoorModeToggle initialOn={outdoor} compact />
              <p className="text-ui-sm text-ui-muted">High contrast for bright sun</p>
            </Card>
          </section>

          {canChooseLook ? (
            <section aria-labelledby="more-preview" data-group="preview">
              <SectionTitle id="more-preview">Preview</SectionTitle>
              <Card padding="none" className="mt-2">
                <NewLookRow />
              </Card>
            </section>
          ) : null}

          <form action="/auth/signout" method="POST">
            <Button type="submit" variant="danger" fullWidth icon={<SignOut weight="bold" />} data-testid="more-sign-out">
              Sign out
            </Button>
          </form>

          {owner ? <LinkGroup group={owner} /> : null}
        </div>
      </main>
    </Screen>
  );
}
