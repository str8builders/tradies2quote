# App Store preparation pack — 24 September 2026

Prepared before Apple Developer membership payment. No app record, product or review submission has been created by this pack. Use only features verified in the shipping candidate. Apple decides the review outcome.

## App record draft

| Field | Prepared value |
|---|---|
| Name | Tradies2Quote |
| Subtitle | Quotes & invoices for tradies |
| Category | Business; optional secondary Productivity |
| Bundle ID | `com.str8builders.tradies2quote` |
| SKU proposal | `tradies2quote-ios` — confirm uniqueness when creating record |
| Language | English; regional spelling/localizations to confirm |
| Download price | Free; paid features through Apple subscriptions |
| Platforms | iPhone and iPad, minimum iOS 17 in source |
| Version | 1.0.0; assign a fresh build number for upload |
| URLs | `https://tradies2quote.com/support`, `/privacy`, `/terms` |
| Keywords | quotes,invoices,tradie,contractor,builder,estimates,job,materials,clients,schedule |
| Seller/copyright/review contact | Enter the verified Apple account entity and owner's current contact details |
| Release setting proposal | Manual release after approval and final service checks |

The description draft and longer review copy are in the delivered `tradies2quote-app-store-submission-draft.md`. Publish the corrected policy/support pages with the accepted backend release before submission. Do not claim untested AI, weather, delivery, offline syncing or platform features in the listing.

## Subscription product worksheet

One group, proposed display name **Tradies2Quote plans**, one-month auto-renewing products. Proposed rank 1 Builder, rank 2 Crew, rank 3 Solo; check upgrade/downgrade behavior with actual Apple transactions. IDs below match the planned namespace, but still need creation/verification in App Store Connect.

| Product ID | Display name | Description draft | Backend plan | Price / storefronts |
|---|---|---|---|---|
| `com.str8builders.tradies2quote.solo.monthly` | Solo Monthly | Quoting and invoicing for one user. | `solo` | Owner confirmation pending |
| `com.str8builders.tradies2quote.crew.monthly` | Crew Monthly | Quoting and invoicing for up to five users. | `crew` | Owner confirmation pending |
| `com.str8builders.tradies2quote.builder.monthly` | Builder Monthly | Quoting and invoicing for up to twenty users. | `builder` | Owner confirmation pending |

The website catalogue currently lists NZ$49 / NZ$79 / NZ$199 including GST. These are context, **not approved Apple product prices**. The native app reads localized prices from StoreKit. Do not hardcode those numbers, create a promotional offer, enable Family Sharing, or promise extra support service levels without a decision. Verify seat entitlements and role boundaries before including the seat claims in product metadata.

For each product: select territories and tax category, confirm price schedule, add localization and a real purchase-screen review screenshot, add review instructions, and attach the first subscriptions to the app submission as required by App Store Connect. Configure the exact ID-to-plan mapping on the server. See `BILLING.md` for keys, V2 notification URL, allowed sandbox accounts, reconciliation and recovery tests. Private keys remain server-only.

## Review notes, ready to adapt

Tradies2Quote is a native SwiftUI quoting and invoicing app for trade businesses. It shares its account service with the website and the separate T2QCAL calculator app. Embedded calculators are excluded; calculations sent from the separate app can still arrive in the account.

Sign in with the dedicated account provided in App Store Connect's private review fields. From Home choose New quote, enter a client/job, add a material or manual line, save, then open it from Quotes and choose the PDF action. AI use is optional and requires processing consent. Manual quoting remains available when consent is declined.

Subscriptions, restore and Apple's subscription management link are under More → Subscription. Account deletion is under More → Settings → Delete account; it uses the same flow as ordinary accounts. Deleting this shared account does not cancel an Apple subscription. An account with existing paid/team access may hide new purchase offers to avoid double charging.

Before using these notes, provide working ordinary review credentials, a purchase-eligible test account if needed, approved review contact details, and a synthetic sample job/request. Keep credentials in the private App Store Connect fields or secure credential store, never in source control. Ensure review access will not expire during review and supports ordinary deletion; do not create an App Review bypass. Keep the live backend and providers available during review.

## Age-rating questionnaire draft

Apple's questionnaire includes capabilities as well as content frequency. The final result must come from the current questionnaire; **no numeric age rating is asserted here**. Source: [age rating definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions).

| Topic | Draft answer / basis |
|---|---|
| Intended audience | Trade-business users; not a Kids Category app |
| Parental controls / age assurance | No native parental controls or verified age-check capability in reviewed code |
| Advertising | No advertising experience in the reviewed native target |
| Unrestricted web access | No general-purpose embedded browser; specific policy/support/payment links open their destinations |
| Messaging and chat | Declare the customer conversation capability. Customers' messages are visible to the business even where AI generates responses; explain this in review notes |
| Broadly distributed user-generated content | Draft no public feed/social network. Private quotes, customer-token links, attachments and conversations still need accurate disclosure; reassess if public discovery or broad distribution is added |
| Social media | No public profiles/feed/following capability found in the native target |
| Gambling, contests, loot boxes | None provided by the business workflow |
| Sexual, violent, drug, horror or medical themes | None intentionally supplied. Validate content handling and AI scope against representative submitted text/images before final answers |
| AI functionality | Disclose optional business drafting/transcription/document processing and customer AI conversation wherever requested; do not represent it as unrestricted AI chat |

Blocking/reporting exists for customer conversations. Actual report triage, objectionable-content handling and response ownership still need an operational acceptance check. A presence-only code check is insufficient to claim moderation compliance.

## Screenshots and accessibility

Prepare real captures on an accepted large iPhone and iPad size: Home, itemised quote, saved quote/PDF, clients/materials, schedule and optional supplier review. Use synthetic contacts, plausible totals and the final supported feature set. Never show secrets, debug errors, an expired trial or placeholder purchase pricing. Record device dimensions and build identity. Existing technical test captures are evidence and draft assets, not a finished submission gallery.

Verify the current [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) at upload. Do not resize a smaller device capture to claim a larger device. Submit accessibility labels only after evaluating the full applicable workflows, including VoiceOver, large text, contrast, motion and control reachability. An automated audit of one screen is limited evidence.

## Still dependent on membership or owner input

Enrollment payment and activation; confirmed team/seller; bundle registration; distribution signing and profiles; App Store Connect app and products; paid-app agreements/tax/banking supplied by the owner; actual signed purchase events; TestFlight; archive validation; final privacy/export/age answers and regional trader declarations. Export encryption declarations must match the signed app and its libraries; do not infer exemption solely from HTTPS or a plist flag.

All uploads/submission wait for acceptance evidence and working deployed services. Relevant Apple requirements: [review guidelines](https://developer.apple.com/app-store/review/guidelines/), [submission workflow](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app).
