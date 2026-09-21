# Native build and release operations

Open `ios-native/Tradies2Quote.xcodeproj`. The app is SwiftUI, iOS 17+, with iPhone and iPad layouts. The website/Capacitor source is retained for existing customers; it is not the native app target. Bundle identifier: `com.str8builders.tradies2quote`.

## Reproducible sources

`ios-native/project.yml` is the XcodeGen specification. Run `xcodegen generate --spec ios-native/project.yml` after adding source/resource files. Keep the generated project and shared schemes committed. Package.resolved pins Supabase Swift 2.55.2 and GRDB 7.11.1; licences are included in the app. Runtime library versions must be reviewed before changing them.

Simulator tests require ad-hoc signing for Keychain access:

```sh
xcodebuild -project ios-native/Tradies2Quote.xcodeproj -scheme Tradies2Quote \
  -configuration Debug -destination 'platform=iOS Simulator,id=YOUR_SIMULATOR_UUID' \
  -parallel-testing-enabled NO -collect-test-diagnostics never \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual test
```

Use a unique `-resultBundlePath` outside the repository for durable evidence. Read `scripts/mobile-integration/README.md` before running authenticated UI tests. Without synthetic credentials those integration tests skip; a skip is not release acceptance.

The local StoreKit configuration contains synthetic product identifiers and prices, not proposed production prices. It is a test-bundle resource and selected only for the Debug launch scheme. The schema 5 fixture passes on the installed iOS 27 simulator. The installed iOS 26.5 runtime reports SKInternalErrorDomain Code 3 and empty products, so run purchase tests on a working StoreKitTest runtime; do not count exclusions as purchase acceptance. The production server deliberately does not trust Xcode-signed transactions. Native purchase-delivery tests use a test URL protocol; actual signed sandbox/TestFlight delivery must be tested separately.

## Production preparation

1. Confirm paid Apple Developer membership, the intended seller/team, bundle identifier, App Store Connect record and distribution rights. Set the signing team in Xcode. Do not use a Personal Team for App Store distribution.
2. Configure the production Supabase callback `tradies2quote://auth`, associated-domain app IDs with the actual Apple Team ID, and APNs keys/environment. Test password recovery and quote links on a physical device.
3. Back up production and rehearse the seven new `20260921_*` migrations against a schema clone. Apply them in dependency order: native quote transactions, Apple subscriptions, AI consent, native support transactions, Apple reconciliation, deletion guard, atomic supplier quotes. Do not replay unrelated historical migrations.
4. Deploy the matching backend before exposing the new app. Configure and verify providers. Install deletion/Apple reconciliation timers only after their dry runs pass. Retain web and separate T2QCAL compatibility.
5. Configure Apple products/notifications as described in `BILLING.md`; verify every purchase lifecycle. Product setup, secrets, agreements, banking and tax details are not completed by the source code.
6. Create a signed Release archive for a generic iOS device. Validate distribution signing, entitlements, required-reason APIs, app privacy labels and every SDK manifest using the actual archive. An unsigned compile is not an uploadable build.
7. Upload to TestFlight, complete real-device/provider acceptance, capture screenshots from the exact release candidate, and complete the listing and review notes. Keep backend services and review accounts available throughout review.

No approval guarantee is possible. The acceptance matrix is the release gate: unresolved required tests, missing credentials, incorrect privacy statements or unsupported service paths block submission.

## Weather service

Set `OPEN_METEO_API_KEY` only on the backend after arranging the provider's commercial licence. Production forecast/geocoding requests refuse an absent key; do not deploy this weather migration before that configuration exists. Development/test may use the free evaluation endpoint. Browser forecasts now pass through an authenticated, rate-limited backend endpoint; keys are never shipped to the app or browser. Provider requests have a ten-second timeout and do not follow redirects. Forecasts and geocoding use the reserved customer endpoints, and visible weather screens credit Open-Meteo/GeoNames and CC BY 4.0 with derived trade assessments identified.

References checked 21 September 2026: [commercial terms](https://open-meteo.com/en/pricing), [attribution](https://open-meteo.com/en/licence), [geocoding key/endpoint](https://open-meteo.com/en/docs/geocoding-api). A configured key is not proof of a valid commercial account or a successful live forecast; verify both before release.
