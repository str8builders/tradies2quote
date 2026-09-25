"use client";

import { useState } from "react";
import Link from "next/link";
import { SignOut } from "@phosphor-icons/react/dist/ssr";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { ListRow } from "@/components/ui/list-row";
import { OutdoorModeToggle } from "@/components/ui/outdoor-mode-toggle";
import { PRESS, TAP } from "@/components/ui/styles";
import { MORE_ICON } from "../../more/_components/more-icons";
import { MORE_TONE, accountSheetItems } from "../../more/_lib/menu";
import type { TopBarData } from "../lib/top-bar";
import { Avatar } from "./Avatar";

type AccountData = Pick<TopBarData, "name" | "letter" | "avatarUrl" | "email" | "businessName" | "outdoor">;

/** Who's signed in, big, with a way to change it. */
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

/**
 * Your photo, top left on every tab. A tap slides your settings up from the
 * bottom: your profile, the business's details, rates, getting paid, team,
 * help, outdoor mode and sign out. The same rows as More, so nothing is
 * only here. No plans or prices, so it's the same in the iOS app.
 */
export function AccountButton({ data }: { data: AccountData }) {
  const [open, setOpen] = useState(false);
  const items = accountSheetItems();
  const close = () => setOpen(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Your account and settings"
        data-testid="top-bar-account"
        className={cx("ui-focus-ring inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full", TAP, PRESS)}
      >
        <Avatar avatarUrl={data.avatarUrl} letter={data.letter} />
      </button>
      <BottomSheet open={open} onClose={close} title="Your account">
        <SheetHeader data={data} />
        <Card padding="none">
          <ul className="divide-y divide-ui-line">
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
          </ul>
        </Card>
        <Card className="mt-3">
          <OutdoorModeToggle initialOn={data.outdoor} compact />
          <p className="text-ui-sm text-ui-muted">High contrast for bright sun</p>
        </Card>
        <form action="/auth/signout" method="POST" className="mt-3">
          <Button type="submit" variant="danger" fullWidth icon={<SignOut weight="bold" />} data-testid="account-sheet-sign-out">
            Sign out
          </Button>
        </form>
        <p className="mt-3 text-center text-ui-sm text-ui-muted">
          <Link href="/app/more" onClick={close} className="ui-focus-ring rounded-ui-sm text-ui-brand-text underline-offset-4 hover:underline">
            Everything else is in More
          </Link>
        </p>
      </BottomSheet>
    </>
  );
}
