import type { ReactNode } from "react";
import { Briefcase, CreditCard, Receipt, UserCircle } from "@phosphor-icons/react/dist/ssr";
import type { IconTone } from "@/components/ui/styles";
import { Card } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { HashRedirect } from "./HashRedirect";
import type { HubItem } from "./hub";
import type { SettingsPage } from "./model";
import { SettingsScreen } from "./SettingsScreen";

const ICONS: Record<SettingsPage, ReactNode> = {
  business: <Briefcase weight="duotone" />,
  rates: <Receipt weight="duotone" />,
  payments: <CreditCard weight="duotone" />,
  account: <UserCircle weight="duotone" />,
};

/** The same colours as these rows in More and the account sheet. */
const TONES: Record<SettingsPage, IconTone> = {
  business: "info",
  rates: "warn",
  payments: "ok",
  account: "brand",
};

/** /app/settings in the new look: four short pages instead of one long one. */
export function SettingsHub({ items }: { items: HubItem[] }) {
  return (
    <SettingsScreen title="Settings" testId="settings-hub">
      <HashRedirect />
      <Card padding="none" className="overflow-hidden">
        <ul className="divide-y divide-ui-line" aria-label="Settings">
          {items.map((item) => (
            <li key={item.page}>
              <ListRow
                href={item.href}
                icon={ICONS[item.page]}
                iconTone={TONES[item.page]}
                title={item.title}
                subtitle={item.subtitle}
              />
            </li>
          ))}
        </ul>
      </Card>
    </SettingsScreen>
  );
}
