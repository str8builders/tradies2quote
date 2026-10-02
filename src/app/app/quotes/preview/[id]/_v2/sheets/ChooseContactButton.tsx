"use client";

import { useState } from "react";
import { AddressBook } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { pickContact } from "@/lib/native/contacts";
import { useHasNativeModule } from "@/lib/native/use-native-module";
import { contactToClientPatch, type ClientForm } from "../contact";

/** The button as drawn. */
export function ChooseContactButtonView({ busy, onChoose }: { busy: boolean; onChoose: () => void }) {
  return (
    <Button
      variant="secondary"
      fullWidth
      icon={<AddressBook weight="bold" />}
      loading={busy}
      loadingLabel="Opening contacts…"
      onClick={onChoose}
      data-testid="job-client-from-contacts"
    >
      Choose from my contacts
    </Button>
  );
}

/**
 * "Choose from my contacts" in the client sheet. It opens the phone's own
 * contact picker, so it only exists in the iPhone app; in a browser the
 * button isn't there. A contact fills the boxes it has something for and
 * leaves the rest as they were, ready to check and save.
 */
export function ChooseContactButton({ onPick }: { onPick: (patch: Partial<ClientForm>) => void }) {
  const available = useHasNativeModule("T2QContacts");
  const [busy, setBusy] = useState(false);
  if (!available) return null;

  async function choose() {
    if (busy) return;
    setBusy(true);
    const contact = await pickContact();
    setBusy(false);
    if (contact) onPick(contactToClientPatch(contact));
  }

  return <ChooseContactButtonView busy={busy} onChoose={choose} />;
}
