"use client";

import { useState, type FormEvent } from "react";
import { AddressBook, ArrowClockwise, MagnifyingGlass, Plus } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { Skeleton } from "@/components/ui/skeleton";
import { TextField } from "@/components/ui/text-field";
import { clientInitials } from "../../_v2/lib/job-board";
import {
  CLIENTS_LIMIT,
  EMPTY_CLIENT_FORM,
  clientFormFor,
  useClientsBook,
  type ClientsBook as ClientsBookState,
  type SavedClient,
} from "../_lib/useClientsBook";
import { ClientEditSheet } from "./ClientEditSheet";

export const CLIENTS_INTRO = "Keep contact details ready for your next quote.";

/** Who can see the list, in the old page's words. */
export function sharingLine(shared: boolean): string {
  return shared
    ? "Shared with your active team. Team members can add and update these contacts."
    : "Your private address book. Save clients here or when you send a quote.";
}

/** "sam@example.nz · 021 555 0101" (address on its own line in the row). */
export function clientContactLine(client: SavedClient): string {
  return [client.email, client.phone].filter(Boolean).join(" · ");
}

function ClientRow({ client, onOpen }: { client: SavedClient; onOpen: () => void }) {
  const contact = clientContactLine(client);
  return (
    <ListRow
      onClick={onOpen}
      icon={<span className="text-ui-sm font-bold">{clientInitials(client.name)}</span>}
      iconTone="violet"
      title={client.name}
      subtitle={
        <>
          {contact ? <span className="block break-all">{contact}</span> : null}
          {client.address ? <span className="block">{client.address}</span> : null}
          {!contact && !client.address ? <span className="block">No contact details yet</span> : null}
        </>
      }
    />
  );
}

/**
 * /app/clients in the new look: search, the list as big rows, and one sheet
 * to add a client or change one. Everything goes through the page's hook
 * (useClientsBook), exactly as in the old look.
 */
export function ClientsBookView({ book }: { book: ClientsBookState }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { clients, visible, loaded, error, notice, busy, form, setForm, setError } = book;
  const noClients = loaded && clients.length === 0;

  const openSheet = (next: typeof form) => {
    setError("");
    setForm(next);
    setSheetOpen(true);
  };
  const closeSheet = () => {
    setSheetOpen(false);
    setError("");
    setForm(EMPTY_CLIENT_FORM);
  };
  const retry = () => {
    setError("");
    void book.load();
  };
  const save = async (event: FormEvent) => {
    if (await book.save(event)) setSheetOpen(false);
  };

  return (
    <div className="space-y-6" data-testid="clients-book">
      <div className="space-y-1">
        <p className="text-ui-base text-ui-muted">{CLIENTS_INTRO}</p>
        {loaded ? <p className="text-ui-sm text-ui-muted">{sharingLine(book.shared)}</p> : null}
      </div>

      {error && !sheetOpen ? (
        <div role="alert">
          <Callout
            tone="bad"
            title={error}
            action={
              loaded ? undefined : (
                <Button variant="secondary" icon={<ArrowClockwise weight="bold" />} onClick={retry}>
                  Try again
                </Button>
              )
            }
          />
        </div>
      ) : null}
      {notice ? (
        <div role="status">
          <Callout tone="ok" title={notice} />
        </div>
      ) : null}

      {noClients ? null : (
        <Button fullWidth icon={<Plus weight="bold" />} onClick={() => openSheet(EMPTY_CLIENT_FORM)} data-testid="clients-add">
          Add a client
        </Button>
      )}

      {loaded && clients.length > 0 ? (
        <TextField
          label="Search clients"
          labelHidden
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Search name, email, phone or address"
          prefix={<MagnifyingGlass aria-hidden="true" weight="bold" />}
          value={book.search}
          onChange={(event) => book.setSearch(event.target.value)}
          data-testid="clients-search"
        />
      ) : null}

      {!loaded && !error ? (
        <div role="status" aria-busy="true" className="space-y-3">
          <p className="text-ui-muted">Loading clients…</p>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {noClients ? (
        <Card padding="none">
          <EmptyState
            icon={<AddressBook weight="duotone" />}
            title="No clients yet"
            action={
              <Button fullWidth icon={<Plus weight="bold" />} onClick={() => openSheet(EMPTY_CLIENT_FORM)} data-testid="clients-add">
                Add a client
              </Button>
            }
          >
            Add your first contact, or save one when you send a quote.
          </EmptyState>
        </Card>
      ) : null}

      {loaded && clients.length > 0 && visible.length === 0 ? (
        <EmptyState as="h3" icon={<MagnifyingGlass weight="bold" />} title="No matching clients">
          Try fewer letters, or search by phone or email.
        </EmptyState>
      ) : null}

      {visible.length > 0 ? (
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-ui-line" aria-label="Your clients" data-testid="clients-list">
            {visible.map((client) => (
              <li key={client.id}>
                <ClientRow client={client} onOpen={() => openSheet(clientFormFor(client))} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {clients.length === CLIENTS_LIMIT ? (
        <p className="text-ui-sm text-ui-muted">Showing the first 1,000 clients.</p>
      ) : null}

      <ClientEditSheet
        open={sheetOpen}
        form={form}
        onChange={setForm}
        onSave={save}
        onClose={closeSheet}
        busy={busy}
        error={sheetOpen ? error : ""}
      />
    </div>
  );
}

/** The live page part: the address book hook plus the view. */
export function ClientsBook() {
  return <ClientsBookView book={useClientsBook()} />;
}
