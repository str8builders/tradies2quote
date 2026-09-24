import { EnvelopeSimple, MapPin, Phone, User } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { SectionTitle } from "@/components/ui/section-title";
import type { QuoteClient } from "@/lib/quote-types";
import { realClientName } from "../job-title";

/**
 * Who the job is for. Phone and email are one tap to call or write; Edit
 * opens the client sheet (hidden once the quote is locked).
 */
export function ClientCard({ client, onEdit }: { client: QuoteClient; onEdit?: () => void }) {
  const name = realClientName(client.name);
  const phone = client.phone?.trim() || null;
  const email = client.email?.trim() || null;
  const address = client.address?.trim() || null;
  const empty = !name && !phone && !email && !address;
  return (
    <section aria-labelledby="job-client" className="space-y-3">
      <SectionTitle
        id="job-client"
        action={
          onEdit && !empty ? (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
          ) : null
        }
      >
        Client
      </SectionTitle>
      {empty ? (
        <Card>
          <p className="text-ui-muted">No client details yet.</p>
          {onEdit ? (
            <Button variant="secondary" fullWidth className="mt-3" onClick={onEdit}>
              Add the client
            </Button>
          ) : null}
        </Card>
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-ui-line">
            <li>
              <ListRow icon={<User weight="bold" />} title={name ?? "No name yet"} subtitle={name ? undefined : "Add a name before you send"} />
            </li>
            {phone ? (
              <li>
                <ListRow icon={<Phone weight="bold" />} title={phone} subtitle="Call" href={`tel:${phone.replace(/[^\d+]/g, "")}`} />
              </li>
            ) : null}
            {email ? (
              <li>
                <ListRow icon={<EnvelopeSimple weight="bold" />} title={email} subtitle="Email" href={`mailto:${email}`} />
              </li>
            ) : null}
            {address ? (
              <li>
                <ListRow icon={<MapPin weight="bold" />} title={address} />
              </li>
            ) : null}
          </ul>
        </Card>
      )}
    </section>
  );
}
