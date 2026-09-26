"use client";

import { AddressBook, ArrowClockwise, Copy, EnvelopeSimple, FileText, SignOut, UserPlus } from "@phosphor-icons/react/dist/ssr";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { TextField } from "@/components/ui/text-field";
import { formatNZNumericDate } from "@/lib/format-date";
import { PLANS } from "@/lib/plans";
import { teamWords, type TeamWords } from "@/lib/team-copy";
import { useTeam, type TeamData, type TeamState } from "../_lib/useTeam";

/** "3 members · 1 pending · 5 seats, including you" (the old page's words). */
export function rosterSummary(data: TeamData): string {
  return `${data.roster.members.length} members · ${data.roster.invitations.length} pending · ${data.seats} seats, including you`;
}

function InvitationCard({ team, words }: { team: TeamState; words: TeamWords }) {
  const { invite, busy, codeSent, code, setCode, act } = team;
  return (
    <Card as="section" padding="lg" className="space-y-4" aria-labelledby="team-invite-title" data-testid="team-invitation">
      <SectionTitle id="team-invite-title" description={words.invite}>
        You have a team invitation
      </SectionTitle>
      <Button
        variant="secondary"
        fullWidth
        disabled={busy}
        icon={<EnvelopeSimple weight="bold" />}
        onClick={() => void act("verify", { token: invite })}
      >
        {codeSent ? "Resend email code" : "Email me a verification code"}
      </Button>
      {codeSent ? (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void act("accept", { token: invite, code });
          }}
        >
          <TextField
            label="Email verification code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            minLength={8}
            required
            hint="The code expires in 10 minutes."
          />
          <Button type="submit" fullWidth disabled={busy}>
            Verify and join team
          </Button>
        </form>
      ) : null}
    </Card>
  );
}

function TeamHeading({ data, words }: { data: TeamData; words: TeamWords }) {
  const heading = (
    <h2 id="team-name-title" className="ui-title text-ui-xl break-words text-ui-text">
      {data.team?.name ?? words.noTeamHeading}
    </h2>
  );
  // The plan's name and "Manage plan" are for the website only (3.1.3(f)).
  if (!words.showPlan) return heading;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-2">
        <StatusPill tone="info">{PLANS[data.plan].name} plan</StatusPill>
        {heading}
      </div>
      <ButtonLink href="/app/upgrade" variant="secondary" size="sm">
        Manage plan
      </ButtonLink>
    </div>
  );
}

function TeamCard({ team, data, words }: { team: TeamState; data: TeamData; words: TeamWords }) {
  const { busy, act } = team;
  return (
    <Card as="section" padding="lg" className="space-y-4" aria-labelledby="team-name-title" data-testid="team-card">
      <TeamHeading data={data} words={words} />
      {!data.active ? <p className="text-ui-muted">{words.sharingOff}</p> : null}
      {!data.team && data.active ? (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            void act("create", { name: String(f.get("name")) });
          }}
        >
          <TextField
            label="Team name"
            name="name"
            maxLength={100}
            required
            autoComplete="organization"
            placeholder="Your business name"
            hint="Joining members will be able to read and update your existing client list. Their quotes remain private to their own accounts."
          />
          <Button type="submit" fullWidth disabled={busy}>
            Create team
          </Button>
        </form>
      ) : null}
      {data.team && !data.isOwner ? (
        <>
          <p className="text-ui-muted">{words.ownerManages}</p>
          <Button variant="danger" fullWidth disabled={busy} icon={<SignOut weight="bold" />} onClick={() => void act("leave")}>
            Leave team
          </Button>
        </>
      ) : null}
    </Card>
  );
}

function PeopleCard({ team, data, words }: { team: TeamState; data: TeamData; words: TeamWords }) {
  const { busy, act, link, copyLink } = team;
  return (
    <Card as="section" padding="none" className="overflow-hidden" aria-labelledby="team-people-title" data-testid="team-people">
      <div className="space-y-4 p-5 sm:p-6">
        <SectionTitle id="team-people-title" description={rosterSummary(data)}>
          People and invitations
        </SectionTitle>
        {data.roster.members.length > data.seats ? (
          <div role="alert">
            <Callout tone="warn" title={words.overLimit} />
          </div>
        ) : null}
      </div>
      <ul className="divide-y divide-ui-line border-t border-ui-line">
        {data.roster.members.map((m) => (
          <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
            <div className="min-w-0">
              <p className="font-semibold break-all text-ui-text">{m.email}</p>
              {m.owner ? <p className="text-ui-sm text-ui-muted">Owner</p> : null}
            </div>
            {!m.owner ? (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void act("remove", { user_id: m.user_id })}>
                Remove member
              </Button>
            ) : null}
          </li>
        ))}
        {data.roster.invitations.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
            <div className="min-w-0">
              <p className="font-semibold break-all text-ui-text">{i.email}</p>
              <p className="text-ui-sm text-ui-muted">Invitation expires {formatNZNumericDate(i.expires_at)}</p>
            </div>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => void act("revoke", { id: i.id })}>
              Revoke invitation
            </Button>
          </li>
        ))}
      </ul>
      {data.active ? (
        <form
          className="space-y-4 border-t border-ui-line p-5 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void act("invite", { email: String(new FormData(event.currentTarget).get("email")) });
          }}
        >
          <TextField
            label="Invite a teammate"
            name="email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            required
            autoComplete="off"
            placeholder="name@business.co.nz"
            hint="Create a private link for this email address. Share it with that person yourself. Links expire after 7 days and reserve a seat."
          />
          <Button type="submit" fullWidth disabled={busy} icon={<UserPlus weight="bold" />}>
            Create invitation link
          </Button>
        </form>
      ) : null}
      {link ? (
        <div className="space-y-3 border-t border-ui-line p-5 sm:p-6" data-testid="team-invite-link">
          <TextField label="Invitation link" readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
          <Button variant="secondary" fullWidth icon={<Copy weight="bold" />} onClick={() => void copyLink()}>
            Copy link
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * /app/team in the new look: settings-style cards with every action the old
 * page has, and its words (the iPhone app's plan-free ones come from
 * teamWords(inApp); the page decides `inApp` on the server).
 */
export function TeamView({ team, words }: { team: TeamState; words: TeamWords }) {
  const { error, notice, invite, data } = team;
  return (
    <div className="space-y-6" data-testid="team-view">
      {error ? (
        <div role="alert">
          <Callout tone="bad" title={error} />
        </div>
      ) : null}
      {notice ? (
        <div role="status">
          <Callout tone="ok" title={notice} />
        </div>
      ) : null}
      {invite ? <InvitationCard team={team} words={words} /> : null}
      {!data ? (
        error ? (
          <Button variant="secondary" fullWidth icon={<ArrowClockwise weight="bold" />} onClick={() => void team.load()}>
            Retry loading team
          </Button>
        ) : (
          <div role="status" aria-busy="true" className="space-y-3">
            <p className="text-ui-muted">Loading your team…</p>
            <Skeleton className="h-40 w-full" />
          </div>
        )
      ) : (
        <>
          <TeamCard team={team} data={data} words={words} />
          {data.team && data.isOwner ? <PeopleCard team={team} data={data} words={words} /> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <ButtonLink href="/app/clients" variant="secondary" icon={<AddressBook weight="bold" />}>
              Open client list
            </ButtonLink>
            {data.plan === "builder" ? (
              <ButtonLink href="/app/templates" variant="secondary" icon={<FileText weight="bold" />}>
                Terms templates
              </ButtonLink>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

/** The live page part: the team hook plus the view. */
export function TeamCards({ initialInvite = "", inApp = false }: { initialInvite?: string; inApp?: boolean }) {
  return <TeamView team={useTeam(initialInvite)} words={teamWords(inApp)} />;
}
