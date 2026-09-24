import type { ReactNode } from "react";
import { TopBar } from "@/components/ui/top-bar";

/** Where the job page's Back goes (the jobs list, redesign phase 2). */
export const JOBS_HREF = "/app/jobs";

/**
 * The job page's top bar: Back to the jobs, the job in plain words, the
 * client under it. It sticks while the page scrolls and pads for the notch
 * itself, so on phones it cancels the app shell's own notch padding when the
 * job page is the first thing in the shell (no banner above it); otherwise
 * the gap above it would be doubled.
 */
export function JobTopBar({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <TopBar
      title={title}
      subtitle={subtitle}
      back={{ href: JOBS_HREF }}
      action={action}
      className="max-sm:[.t2q-app-scroll>:first-child_&]:-mt-[env(safe-area-inset-top)]"
    />
  );
}
