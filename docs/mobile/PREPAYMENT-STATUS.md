# Tradies2Quote prepayment preparation — 24 September 2026

**The updated native candidate builds, and this preparation pass is saved. It is not ready for App Review yet.** Apple Developer payment remains deferred until Friday, 25 September. Payment is not the only remaining requirement. No charge, agreement acceptance, App Store upload or production deployment was performed during this pass.

## Completed in this pass

- Corrected support, terms and privacy copy: Apple cancellation/refunds, shared Tradies2Quote/T2QCAL account deletion, saved bank instructions, and account-linked quote-edit/correction data. The updated pages are in the candidate branch and still need deployment with the accepted backend.
- Expanded the native privacy manifest to 17 data categories and checked its category/purpose identifiers against Apple's documentation. Prepared source-backed privacy answers and a provider/retention worksheet.
- Added native explanations and manual alternatives when voice, AI drafting or supplier reading is unavailable. Improved quantity/unit/unit-price labels and their layout at accessibility text sizes.
- Prepared draft app metadata, subscription product IDs/descriptions, age-rating considerations, review steps and the remaining delivery/device runbook. Apple prices and launch countries remain unconfirmed.
- Expanded native acceptance coverage for clients/materials, AI consent, account controls, offline draft recovery and large text. Corrected test navigation through offscreen controls.
- Built a fresh unsigned Release archive from native source commit `d75824505c263107460e130c223f189edea1c63c`, with iPhoneOS 26.5 SDK and minimum iOS 17. All 12 static bundle checks passed. The archive contains the expanded privacy manifest, production origins and no test credentials or simulator endpoint overrides. It has no distribution signature and cannot be submitted in this state.

Embedded T2QCAL remains excluded from the native target. The separate app connection is preserved in the implementation; its real-device handoff still needs acceptance.

## What the tests establish

| Check | Result | Limit |
|---|---|---|
| Synthetic backend HTTP journeys | 108 passed again | No real external delivery, production customer records or Apple sandbox purchase |
| Web production build, TypeScript and targeted policy lint | Passed | Candidate branch only |
| Release-checker tests | 13 passed | Does not prove providers are configured or delivering |
| Completed iPhone SE / iOS 26.5 run | 10 unit + 3 UI passed; 3 UI failed | Passed launch, client/material server persistence and offline draft recovery. Failures involved offscreen settings, login and saved-client controls |
| Corrected native sources | Compiled; unsigned archive passed | Corrected UI rerun blocked by simulator install/startup failure; large-text audit and final interactive acceptance remain pending |
| Local StoreKit on iOS 27 | Both local transaction cases passed | The later combined UI run was interrupted. iOS 26.5 local configuration failure remains unresolved. Real signed sandbox/TestFlight is untested |

The full backend result of 3,224 passed / 25 skipped is retained as **21 September historical evidence**, not a new full-suite result. Earlier successful quote/conflict flows do not prove the latest changes. Screenshots from passing synthetic tests are technical evidence, not the final App Store gallery.

## Still possible before paying Apple

1. Resume the corrected UI/accessibility runs on a working simulator or connected device. Finish small-screen, VoiceOver, large-text, interruption and recovery coverage.
2. Test actual signup/reset and quote/invoice delivery once an authorized email address and mobile number are supplied. Test live AI output, camera/microphone, support inbox, weather and sandbox deposits with the appropriate provider configuration. No customer messages have been sent.
3. Verify all backup archives and deletion handling after restores. Daily rotation exists, but a separate archive directory and its retention were not fully verified. No backups were deleted.
4. Complete physical-device camera/microphone and separate T2QCAL handoff checks. The known iPhone was unavailable during this pass.
5. Confirm Apple plan prices and launch countries, then finalize product copy. Capture the final screenshot gallery only after the shipping candidate is accepted.

The environment-file inventory found no Twilio, commercial-weather, APNs or complete Apple subscription configuration. Other providers' key presence does not prove successful service. Effective runtime/build overrides, processor settings and the stated retention periods still need verification.

## Requires activated membership or final release acceptance

Verify seller/team and agreements; register the app and exact subscription products; configure signing, server credentials and notifications; validate signed sandbox purchase/restore/renewal/refund/recovery and TestFlight; deploy the accepted backend/policies with migration and rollback checks; finish actual privacy/export/age answers, screenshots and review access; validate and submit the signed archive. Apple determines the review outcome.

## Review pack

- [Privacy worksheet](PRIVACY-WORKSHEET.md)
- [Store and subscription preparation](STORE-PREPARATION.md)
- [Provider/device acceptance runbook](PROVIDER-ACCEPTANCE.md)
- [Detailed acceptance history](ACCEPTANCE.md)
- [Structured evidence](prepayment-evidence-2026-09-24.json)

Candidate branch: [feat/native-ios-appstore-20260921](https://github.com/str8builders/tradies2quote/tree/feat/native-ios-appstore-20260921). The temporary synthetic test containers, local backend, gateway and tunnel have been stopped. The disposable simulator has been deleted; existing devices and fixture data are retained.

Apple references: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [App Privacy details](https://developer.apple.com/app-store/app-privacy-details/), [submission workflow](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app).
