# App Privacy preparation — 24 September 2026

Draft for the native Tradies2Quote candidate, not answers already submitted to Apple. Recheck against the signed binary and enabled production services before completing App Store Connect. Source inspection and configuration presence do not establish provider retention or contractual compliance.

## Proposed declarations and source evidence

All categories below are conservatively marked linked to the account and not used for tracking. “Functionality” means delivering the account, business workflow, security or support. Analytics and personalization are additional purposes where recorded below. The app has no advertising SDK or advertising-identifier request in the reviewed native target.

| Apple data category | Actual flow in this project | Proposed purposes |
|---|---|---|
| Name, email, phone, physical address | Authentication, business settings, saved clients and client details copied into quotes/invoices | Functionality; analytics for client fields retained in quote-edit snapshots |
| User ID | Authenticated records, ownership, AI-consent history, subscriptions and account-specific correction history | Functionality, analytics, personalization |
| Payment info | Optional bank/payment instructions saved in Settings and printed on invoices. Apple/Stripe card entry remains external | Functionality |
| Other financial info | Quote/invoice values, paid state, business pricing and markup preferences | Functionality, analytics, personalization |
| Purchase history | Apple transaction lineage, status and plan; existing website subscription entitlement | Functionality |
| Audio data | User-selected voice recording sent for transcription after consent | Functionality |
| Photos or videos | Selected photos, logos, drawings and supplier-document images; no general photo-library upload | Functionality |
| Emails or text messages | Customer quote conversations and delivery content/recipient information | Functionality |
| Other user content | Job descriptions, documents, calendar notes, quotes, calculations received from T2QCAL, generated drafts and subsequent edits | Functionality, analytics, personalization |
| Customer support | Submitted conversation reports and support requests | Functionality |
| Precise location | Optional device/site coordinates for weather; site addresses can also be geocoded | Functionality |
| Device ID | Account-bound APNs token when push is configured and the user enables notifications | Functionality |
| Product interaction | Account-linked quote-edit events and correction/preference records | Functionality, analytics, personalization |
| Other diagnostic data | Sanitized server error records, request failures and technical troubleshooting | Functionality |

The corresponding 17 manifest entries are in `ios-native/Tradies2Quote/Resources/PrivacyInfo.xcprivacy`. The name/email/phone/address rows are separate entries. The manifest is not a substitute for App Store Connect privacy answers.

Evidence: `Features/SettingsView.swift`, `Features/AIConsentView.swift`, `Features/QuoteDetail.swift`, `Features/WorkOrganisation.swift`, `src/lib/mobile/router.ts`, `src/app/app/quotes/preview/[id]/actions.ts`, `src/lib/tradieBrain/`, `src/lib/account-deletion.ts`, and the Apple billing and push routes. Saving an edited quote can retain its full content in `quote_edit_events.edited_data`; describing all improvement data as anonymous aggregate statistics would be inaccurate. The policy now describes this account-linked use and account-specific material corrections.

Apple category and purpose definitions: [App Privacy details](https://developer.apple.com/app-store/app-privacy-details/), [manifest data categories](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype), [manifest purposes](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatypepurposes). Category assignments above are our application-specific interpretation of those definitions.

## Data destinations and remaining verification

| Destination | What the implementation sends | Before release |
|---|---|---|
| Operated Sydney backend / Supabase software | Auth, business records, consent, attachments, quote edits, preferences and diagnostics | Verify release host, storage permissions, backups and restoration procedure |
| Anthropic | Consented job text, transcripts, selected drawings/supplier images and enabled customer AI conversation | Confirm account terms, retention setting, production feature configuration and representative response quality |
| OpenAI | Consented voice audio and selected photos for enabled features | Confirm account terms, retention setting and actual transcription/photo results |
| Resend / authentication SMTP | Transactional recipients, email content and links | Verify both delivery paths in a designated inbox; API key presence is insufficient |
| Apple | StoreKit purchases and, when configured, APNs delivery | Actual sandbox/TestFlight validation after membership activation |
| Stripe | Website-plan and trade-service deposit payment workflow | Verify applicable test-mode deposit flows; do not offer web checkout for iOS digital subscriptions |
| Open-Meteo / geocoding | Site query or coordinates | Commercial weather key absent in the 24 September configuration inventory; validate plan and delivery before availability |
| Twilio, if server SMS enabled | Destination number and message | Configuration absent; receiving phone and delivery authorization still required |

Both Sentry DSN settings were absent in `/srv/t2q/app.env` when inspected on 24 September. This is an environment-file observation, not proof that every running/build-time override is absent. Before deployment inspect the effective release configuration and outgoing diagnostics. If hosted monitoring is enabled, update the provider disclosure and relevant crash/performance categories before release.

## Consent, deletion and retention checks

- AI permission is versioned (`2026-09-external-ai-v2`); declining leaves manual quoting available. Server routes enforce consent. Withdrawal stops future AI requests; it does not retract completed processing.
- Account deletion is available in native Settings with typed confirmation. It deletes the shared Tradies2Quote/T2QCAL account and associated active content, with resumable cleanup and late-write guards. Export needed documents first. A separate Apple subscription remains managed through Apple.
- Deletion code includes quote-edit events and account-specific preference records. Confirm all storage buckets and any externally held copies against the actual deployed release.
- The current policy promises active-account cleanup within 30 days and routine-backup expiry within a further 30 days. **Do not mark this verified:** establish all backup locations/rotation, retained archives and restore-time deletion handling. A past observation of six daily files does not prove the complete retention inventory.
- Billing lineage retention and legally required records need a documented retention schedule. Confirm the published policy with the operator before deployment; this worksheet does not make a legal determination.
- Required-reason API declarations currently cover app-owned UserDefaults (`CA92.1`) and app-owned file timestamps (`C617.1`). Recheck the signed archive's aggregated SDK manifests and Apple's validation result.
- No ATT prompt is planned because the reviewed target does not perform cross-company tracking. Reassess this if analytics, advertising or SDK configuration changes.

Open owner decisions: final provider configuration/retention, support/privacy inbox receipt, launch regions, any additional operational data uses, and the final App Store Connect answers. Keep credentials and customer examples out of this worksheet.
