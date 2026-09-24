import type { ReactNode } from "react";
import { Briefcase, CreditCard, Receipt, UserCircle } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { HashRedirect } from "./HashRedirect";
import type { HubItem } from "./hub";
import type { SettingsPage } from "./model";
import { SettingsScreen } from "./SettingsScreen";

const ICONS: Record<SettingsPage, ReactNode> = {
  business: <Briefcase weight="bold" />,
  rates: <Receipt weight="bold" />,
  payments: <CreditCard weight="bold" />,
  account: <UserCircle weight="bold" />,
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
                iconTone="brand"
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
