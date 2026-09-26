/**
 * Team wording for the iPhone app (App Store 3.1.3(f): a free companion app
 * shows no plan names, prices or subscription talk). The website keeps its
 * own words; the app's are only used when the request comes from the app.
 */

export const TEAM_SHARING_OFF = "Team sharing isn't switched on for this account.";
export const TEAM_OVER_LIMIT = "Your team has more people than it has room for. Remove someone to restore shared access.";
const CANT_JOIN_YET = "This account can't join a team yet. Email support@tradies2quote.com and we'll sort it out.";

export interface TeamWords {
  /** Under "Your team." */
  intro: string;
  /** On an invitation, before joining. */
  invite: string;
  /** The card's heading before a team is made. */
  noTeamHeading: string;
  /** The plan's name above the heading, and a "Manage plan" link (website only). */
  showPlan: boolean;
  /** When team sharing isn't on for the account. */
  sharingOff: string;
  /** For a member who isn't the owner. */
  ownerManages: string;
  /** When there are more members than seats. */
  overLimit: string;
}

const WEB: TeamWords = {
  intro: "One subscription. A shared address book. Each person signs in with their own account and manages their own quotes.",
  invite:
    "Join using the verified email address named on the invitation. If you already have a personal subscription, it must end before you join. Your existing quotes stay in your account; your team’s client address book becomes available while its subscription is active.",
  noTeamHeading: "Make room for your crew",
  showPlan: true,
  sharingOff: "Team sharing needs an active Crew or Builder subscription. Your personal quotes remain in your own account.",
  ownerManages: "Your team owner manages membership and billing.",
  overLimit: "Your team exceeds this plan’s seat limit. Remove members or upgrade to restore shared access.",
};

const IN_APP: TeamWords = {
  intro: "A shared address book. Each person signs in with their own account and manages their own quotes.",
  invite:
    "Join using the verified email address named on the invitation. Your existing quotes stay in your account, and your team’s client address book becomes available once you join.",
  noTeamHeading: "Your team",
  showPlan: false,
  sharingOff: `${TEAM_SHARING_OFF} Your personal quotes remain in your own account.`,
  ownerManages: "Your team owner manages membership.",
  overLimit: TEAM_OVER_LIMIT,
};

/** The Team page's words: the website's, or the iPhone app's plan-free ones. */
export function teamWords(inApp: boolean): TeamWords {
  return inApp ? IN_APP : WEB;
}

/**
 * A reply from the team rules (the manage_team database function), as the
 * iPhone app may show it. Some of those sentences name the paid plans ("An
 * active Crew or Builder plan is required.") or a subscription; those become
 * plain words. Everything else passes through unchanged.
 */
export function teamMessageForApp(message: string): string {
  if (/\b(crew|builder|solo)\b|\bplan\b/i.test(message)) return TEAM_SHARING_OFF;
  if (/subscri|checkout|billing|upgrade|price|payment/i.test(message)) return CANT_JOIN_YET;
  return message;
}
