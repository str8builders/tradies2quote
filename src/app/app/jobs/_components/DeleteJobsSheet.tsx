"use client";

import { Trash } from "@phosphor-icons/react/dist/ssr";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { deleteJobsCopy, type JobRow } from "../../_v2/lib/job-board";

/**
 * "Delete 3 jobs?" — asked in a sheet before anything goes. Says what
 * happens (gone from Jobs and the totals, back from Recently deleted) and,
 * when it matters, that some invoices already went to the client and that
 * clients' links stop working. The error, if the server says no, stays in
 * the sheet with the button to try again.
 */
export function DeleteJobsSheet({
  open,
  rows,
  busy = false,
  error = null,
  onConfirm,
  onClose,
}: {
  open: boolean;
  /** The jobs picked. */
  rows: ReadonlyArray<Pick<JobRow, "invoiceStatus" | "sentToClient">>;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const copy = deleteJobsCopy(rows);
  const warning = copy.billed ?? copy.links;
  return (
    <BottomSheet
      open={open}
      // Stay open while the delete is on its way; the answer lands here.
      onClose={busy ? () => {} : onClose}
      title={copy.title}
      footer={
        <div className="flex flex-col gap-2">
          <Button
            variant="danger"
            fullWidth
            icon={<Trash weight="bold" />}
            loading={busy}
            loadingLabel="Deleting…"
            onClick={onConfirm}
            data-testid="jobs-delete-confirm"
          >
            {copy.confirm}
          </Button>
          <Button variant="secondary" fullWidth disabled={busy} onClick={onClose}>
            {copy.keep}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-ui-base text-ui-text">{copy.body}</p>
        {warning ? (
          <Callout tone="warn" title={warning}>
            {copy.billed && copy.links ? copy.links : null}
          </Callout>
        ) : null}
        {error ? (
          <div role="alert">
            <Callout tone="bad" title={error} />
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}
