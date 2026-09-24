import type { ReactNode } from "react";
import { Screen } from "@/components/ui/screen";
import { ToastProvider } from "@/components/ui/toast";
import { TopBar } from "@/components/ui/top-bar";
import { MORE_PATH } from "./hub";

/**
 * The frame of every new-look settings page: title with "‹ More", one
 * column of grouped cards, and toasts. `saveBar` leaves room at the bottom
 * so the fixed Save bar never covers the last field.
 *
 * The /app shell already pads for the notch, so the top bar does not.
 */
export function SettingsScreen({
  title,
  saveBar = false,
  testId,
  children,
}: {
  title: string;
  saveBar?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <Screen data-testid={testId}>
      <ToastProvider bottomOffset={saveBar ? "11rem" : "6rem"}>
        <TopBar title={title} back={{ href: MORE_PATH, label: "More" }} safeArea={false} />
        <div className={saveBar ? "mx-auto w-full max-w-xl flex-1 space-y-6 px-4 pt-5 pb-32" : "mx-auto w-full max-w-xl flex-1 space-y-6 px-4 pt-5 pb-10"}>
          {children}
        </div>
      </ToastProvider>
    </Screen>
  );
}
