"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GearSix, SignOut } from "@phosphor-icons/react/dist/ssr";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { ListRow } from "@/components/ui/list-row";
import { OutdoorModeToggle } from "@/components/ui/outdoor-mode-toggle";
import { PRESS, TAP } from "@/components/ui/styles";
import { MORE_ICON } from "../../more/_components/more-icons";
import { NewLookRow } from "../../more/_components/NewLookRow";
import { MORE_TONE, accountMenuSections, ownerMenu, type MoreItem } from "../../more/_lib/menu";
import type { TopBarData } from "../lib/top-bar";
import { Avatar } from "./Avatar";
import { OPEN_ACCOUNT_EVENT, markSettingsTipSeen } from "./SettingsTip";
import { T2QCALRow } from "./T2QCALLauncher";

type AccountData = Pick<
  TopBarData,
  "name" | "letter" | "avatarUrl" | "email" | "businessName" | "outdoor" | "t2qcal" | "isOwner" | "canChooseLook"
>;

/** Who's signed in, big. */
function SheetHeader({ data }: { data: AccountData }) {
  const detail = [data.businessName && data.businessName !== data.name ? data.businessName : null, data.email]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex items-center gap-4 px-1 pb-4" data-testid="account-sheet-me">
      <Avatar avatarUrl={data.avatarUrl} letter={data.letter} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="ui-heading text-ui-xl break-words text-ui-text">{data.name ?? "Your account"}</p>
        {detail ? <p className="text-ui-sm break-all text-ui-muted">{detail}</p> : null}
      </div>
    </div>
  );
}

function Rows({ items, close }: { items: MoreItem[]; close: () => void }) {
  return (
    <>
      {items.map((item) => {
        const ItemIcon = MORE_ICON[item.id];
        return (
          <li key={item.id} onClickCapture={close}>
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
    </>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`account-${id}`} data-group={id} className="mt-4 first:mt-0">
      <h3 id={`account-${id}`} className="px-1 pb-2 text-ui-sm font-semibold text-ui-muted">
        {title}
      </h3>
      <Card padding="none">
        <ul className="divide-y divide-ui-line">{children}</ul>
      </Card>
    </section>
  );
}

/**
 * Your photo, top left on every tab. A tap slides up everything that isn't
 * a tab (the More tab's replacement): your profile and the business's
 * settings, clients, calendar and team, T2QCAL (opens its own app), help,
 * the privacy policy and terms, outdoor mode, the owner's tools and sign
 * out. No plans or prices, so it's the same in the iOS app.
 */
export function AccountButton({ data }: { data: AccountData }) {
  const [open, setOpen] = useState(false);
  const sections = accountMenuSections();
  const owner = ownerMenu(data.isOwner);
  const close = () => setOpen(false);
  const show = () => {
    setOpen(true);
    markSettingsTipSeen();
  };

  // The Home tip's "Show me" opens this menu.
  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      markSettingsTipSeen();
    };
    window.addEventListener(OPEN_ACCOUNT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ACCOUNT_EVENT, onOpen);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Your account and settings"
        data-testid="top-bar-account"
        className={cx("ui-focus-ring relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full", TAP, PRESS)}
      >
        <Avatar avatarUrl={data.avatarUrl} letter={data.letter} />
        {/* Says "settings are in here" without words. */}
        <span
          aria-hidden="true"
          data-testid="account-settings-badge"
          className="absolute -right-0.5 -bottom-0.5 grid h-5 w-5 place-items-center rounded-full bg-ui-surface text-ui-text ring-2 ring-ui-bg"
        >
          <GearSix weight="fill" className="text-[0.75rem]" />
        </span>
      </button>
      <BottomSheet open={open} onClose={close} title="Your account">
        <SheetHeader data={data} />
        {sections.map((section) => (
          <Section key={section.id} id={section.id} title={section.title}>
            <Rows items={section.items} close={close} />
            {section.id === "work" && data.t2qcal ? (
              <li>
                <T2QCALRow />
              </li>
            ) : null}
          </Section>
        ))}
        <Section id="device" title="On this device">
          <li className="px-4 py-3">
            <OutdoorModeToggle initialOn={data.outdoor} compact />
            <p className="text-ui-sm text-ui-muted">High contrast for bright sun</p>
          </li>
          {data.canChooseLook ? (
            <li>
              <NewLookRow />
            </li>
          ) : null}
        </Section>
        <form action="/auth/signout" method="POST" className="mt-4">
          <Button type="submit" variant="danger" fullWidth icon={<SignOut weight="bold" />} data-testid="account-sheet-sign-out">
            Sign out
          </Button>
        </form>
        {owner ? (
          <Section id="owner" title={owner.title}>
            <Rows items={owner.items} close={close} />
          </Section>
        ) : null}
        <p className="mt-4 text-center text-ui-sm text-ui-muted">
          <Link href="/app/more" onClick={close} className="ui-focus-ring rounded-ui-sm text-ui-brand-text underline-offset-4 hover:underline">
            See it all on one page
          </Link>
        </p>
      </BottomSheet>
    </>
  );
}
