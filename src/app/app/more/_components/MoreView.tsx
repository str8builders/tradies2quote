import type { Icon } from "@phosphor-icons/react";
import {
  AddressBook,
  Bug,
  Calculator,
  ChatCircleDots,
  CreditCard,
  Gauge,
  Lifebuoy,
  Pulse,
  Robot,
  SignOut,
  SlidersHorizontal,
  Storefront,
  Tag,
  UserCircle,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { OutdoorModeToggle } from "@/components/ui/outdoor-mode-toggle";
import { Screen } from "@/components/ui/screen";
import { SectionTitle } from "@/components/ui/section-title";
import { moreMenu, type MoreGroup, type MoreItemId } from "../_lib/menu";
import { NewLookRow } from "./NewLookRow";

const ICON: Readonly<Record<MoreItemId, Icon>> = {
  clients: AddressBook,
  prices: Tag,
  business: Storefront,
  rates: SlidersHorizontal,
  payments: CreditCard,
  account: UserCircle,
  team: UsersThree,
  calculators: Calculator,
  help: Lifebuoy,
  feedback: ChatCircleDots,
  agents: Robot,
  debug: Bug,
  monitor: Pulse,
  ops: Gauge,
};

function LinkGroup({ group }: { group: MoreGroup }) {
  const headingId = `more-${group.id}`;
  return (
    <section aria-labelledby={headingId} data-group={group.id}>
      <SectionTitle id={headingId}>{group.title}</SectionTitle>
      <Card padding="none" className="mt-2">
        <ul className="divide-y divide-ui-line">
          {group.items.map((item) => {
            const ItemIcon = ICON[item.id];
            return (
              <li key={item.id}>
                <ListRow
                  href={item.href}
                  title={item.label}
                  subtitle={item.caption}
                  icon={<ItemIcon weight="bold" />}
                  iconTone={group.id === "owner" ? "brand" : "neutral"}
                />
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

export interface MoreViewProps {
  email: string | null;
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
export function MoreView({ email, isOwner, outdoor, canChooseLook }: MoreViewProps) {
  const { groups, owner } = moreMenu({ isOwner });
  return (
    <Screen height="fill" data-testid="more-screen">
      <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-10 sm:px-6 sm:pt-10">
        <SectionTitle size="page" description={email ? `Signed in as ${email}` : undefined}>
          More
        </SectionTitle>
        <div className="mt-6 space-y-6">
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
