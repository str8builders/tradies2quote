-- ===========================================================================
-- Explicit consent for third-party AI processing (App Store Guideline 5.1.2(i)).
--
-- Before the iOS app sends a tradie's voice/photos/text to OpenAI or Anthropic,
-- it must obtain affirmative, informed consent. We record that consent on the
-- profile (timestamp + the version of the disclosure agreed to) so it persists
-- across devices and can be withdrawn. Enforcement is scoped to the iOS shell
-- (see src/lib/ai-consent.ts) so the existing web product is unchanged.
--
-- Idempotent.
-- ===========================================================================
alter table public.profiles
  add column if not exists ai_consent_at timestamptz;

alter table public.profiles
  add column if not exists ai_consent_version text;
