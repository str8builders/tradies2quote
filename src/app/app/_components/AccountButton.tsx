"use client";

import type { ComponentPropsWithRef } from "react";
import { CaretDown, GearSix } from "@phosphor-icons/react";

type Props = ComponentPropsWithRef<"button"> & {
  userEmail: string | null;
  avatarUrl: string | null;
};

/** One recognisable Settings entry on desktop and mobile. */
export function AccountButton({ userEmail, avatarUrl, className = "", ...props }: Props) {
  const initial = (userEmail ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <button {...props} type="button" aria-label="Settings and account" title="Settings and account"
      aria-haspopup="dialog" className={`t2q-profile-trigger t2q-settings-trigger ${className}`}>
      <span className="t2q-settings-portrait" aria-hidden="true">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" width={36} height={36} className="t2q-profile-photo" />
        ) : <span className="t2q-profile-initial">{initial}</span>}
        <span className="t2q-settings-gear"><GearSix size={12} weight="fill" /></span>
      </span>
      <span className="t2q-settings-label">Settings</span>
      <CaretDown className="t2q-settings-caret" size={12} weight="bold" aria-hidden="true" />
    </button>
  );
}
