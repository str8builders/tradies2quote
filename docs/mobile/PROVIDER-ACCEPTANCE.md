# Provider and device acceptance handover — 24 September 2026

This is a prepared execution sheet, not passing delivery evidence. Use synthetic jobs and only owner-designated inboxes/phones. Never send acceptance messages to saved customer contacts. Record build/backend revision, device/OS, expected/actual result, sanitized provider reference and actual recipient receipt. Do not record passwords, tokens or card details.

## Configuration inventory

Read-only presence check of `/srv/t2q/app.env` on 24 September:

| Service | Setting presence | What this proves |
|---|---|---|
| Anthropic / OpenAI | Keys present | Configuration strings only; account balance, models and results unverified |
| Resend | Key present | Quote-email key present; receiving inbox and separate auth SMTP unverified |
| Stripe | Key present | Mode, account readiness and connected-account state unverified |
| Twilio | Account SID, token, sender absent | Server SMS cannot be accepted for release |
| Commercial Open-Meteo | Key absent | Commercial weather setup remains a blocker if advertised |
| APNs | Key ID and private key absent | Production push cannot be accepted for release |
| Apple subscriptions | Private key, numeric app ID and product mapping absent | Actual Apple billing setup waits for account/products |
| Hosted monitoring | Both Sentry DSN settings absent | Recheck effective runtime and build overrides before declaring no external diagnostics |

The native app must visibly explain unavailable features and preserve manual workflows. Configuration presence never counts as a provider pass. The isolated rehearsal intentionally excludes external provider keys and cannot prove delivery.

## Ready-to-run journeys

| Journey | Procedure and acceptance evidence | Current dependency |
|---|---|---|
| Sign-up / reset | New designated email → verification receipt → native link opens intended account; reset receipt → password change; expired/reused links fail safely | Owner-designated inbox; actual SMTP; device link setup |
| Quote email | Synthetic job → review totals → explicit send → designated inbox receipt → public quote/PDF opens → repeat/retry does not duplicate unintended sends | Designated inbox and enabled delivery |
| Invoice email | Complete synthetic job → convert once → invoice PDF/totals → send → receipt and usable links | Same designated inbox |
| SMS | Test device composer cancellation separately from sending; for server SMS require configured sender, designated receiving phone and observed receipt; record failure/retry | Designated phone; provider configuration for server SMS |
| Voice | Real phone microphone grant/deny, silent recording, interruption and limit; transcribe synthetic job; inspect text and resulting quantities; retry failed upload | Connected physical phone and enabled provider |
| Camera / documents | Real camera and selected library/file images, rotation, HEIC/JPEG/PDF limits, poor/unreadable documents; reject unsupported input clearly; review extracted values | Physical phone and representative safe files/provider |
| AI consent / quality | Decline/grant/withdraw/version change; verify direct API cannot bypass; inspect representative trade outputs and manual fallback | Local consent checks plus provider-enabled acceptance |
| Weather | Search a synthetic/public job-site location; optional location grant/deny; forecast, attribution and stale/error handling; no invented data | Commercial plan/key and device permission check |
| Deposit payment | Test-mode trade-service deposit → cancel/fail/succeed; signed webhook replay/out-of-order; amount tied to server quote; refund event | Confirmed Stripe test environment and account configuration |
| Notifications | Register device → explicit permission → actual APNs test → correct private route; deny/revoke/sign-out/deletion removes access/token | Apple provisioning/APNs and physical device |
| T2QCAL handoff | Separate calculator app → send selected synthetic calculation → Tradies2Quote receives correct lines, units, totals and provenance; wrong-account denial; retry idempotency | Both installed signed apps and connected device |
| Apple lifecycle | Product loading, buy/cancel/pending/restore, second device, account mismatch, renewal, expiry, grace, retry, refund/revoke, upgrade/downgrade, notifications and outage recovery | Membership, real products, sandbox, signed build |

Do not charge a real card, buy a provider plan or send to unapproved recipients as part of these steps. Test-mode transactions must use the provider's sandbox; payment of the developer membership remains the owner's action.

## Physical-device and accessibility pass

Run the accepted iPhone/iPad candidate with VoiceOver and the largest text setting through sign-in, quote editing, amounts, PDF/share, libraries, consent, subscriptions and deletion. Check portrait/landscape, keyboard dismissal, focus order, control names, contrast, reduced motion, dark appearance and meaningful 44-point targets. Check offline reopen and reconnection, expired session and multiple accounts. Preserve unsaved work on interruptions and failures.

The physical iPhone was unavailable to the command-line device inventory during preparation. Simulator screenshots and selected automated accessibility audits are limited evidence; do not publish full accessibility-support claims from them alone.

## Release sequence after prerequisites

1. Confirm prices/storefronts, entity/contact details and designated test recipients. Complete payment/activation and the owner's agreements/tax/banking inputs.
2. Register the app and products, signing/profile/capabilities, associated domains and APNs. Configure server-only Apple credentials and sandbox eligibility. Validate return links against the signed app.
3. Stage the reviewed backend with corrected policies and required migrations. Take and verify a restricted backup first; rehearse recovery and check all retention promises. Follow `deploy/README.md`; do not run the historical migration directory blindly against production.
4. Run this acceptance sheet and `ACCEPTANCE.md`, correcting failures. Preserve both failures and passing reruns. Confirm service/provider readiness and review-account access.
5. Generate and validate the distribution archive; run TestFlight on real devices. Build the screenshot gallery from that candidate and enter the checked privacy/age/export/accessibility answers.
6. Submit the app and required first subscription products with working review credentials and notes. Keep the backend available during review; use manual release after acceptance.

If a feature remains disabled, remove unsupported store claims and make the in-app fallback clear. A disabled dependency is not an end-to-end pass for that feature.
