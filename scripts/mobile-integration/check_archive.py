"""Inspect a locally built archive. This does not replace Apple validation/signing."""
import argparse
import hashlib
import json
import plistlib
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--archive", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
app = args.archive / "Products/Applications/Tradies2Quote.app"
info = plistlib.loads((app / "Info.plist").read_bytes())
binary = app / info["CFBundleExecutable"]
checks = []
def check(name, okay):
    checks.append({"check": name, "passed": bool(okay)})

check("native_bundle_identifier", info["CFBundleIdentifier"] == "com.str8builders.tradies2quote")
check("production_api_origin", info.get("T2QAPIURL") == "https://tradies2quote.com")
check("production_auth_origin", info.get("T2QSupabaseURL") == "https://api.tradies2quote.com")
check("production_push_configuration", info.get("T2QPushEnvironment") == "production")
check("iphone_and_ipad", set(info.get("UIDeviceFamily", [])) == {1, 2})
check("ipad_multitasking_orientations", len(info.get("UISupportedInterfaceOrientations~ipad", [])) == 4)
check("camera_microphone_location_descriptions", all(info.get(k) for k in ["NSCameraUsageDescription", "NSMicrophoneUsageDescription", "NSLocationWhenInUseUsageDescription"]))
files = [p for p in app.rglob("*") if p.is_file()]
check("no_test_credentials_or_storekit_fixture", not any(p.name == "IntegrationCredentials.json" or p.suffix in {".storekit", ".xctest"} or "Tests.xctest" in str(p) for p in files))
check("no_web_wrapper_assets", not any(p.name in {"capacitor.config.json", "index.html"} for p in files))
image = binary.read_bytes()
check("no_debug_endpoint_override", not any(marker in image for marker in [b"T2Q_TEST_AUTH_URL", b"T2Q_TEST_API_URL", b"T2Q_TEST_ANON_KEY", b"T2Q_TEST_RESET"]))
manifests = []
for path in files:
    if path.name == "PrivacyInfo.xcprivacy":
        data = plistlib.loads(path.read_bytes())
        manifests.append({"path": str(path.relative_to(app)), "tracking": data.get("NSPrivacyTracking", False), "requiredReasonAPIs": data.get("NSPrivacyAccessedAPITypes", [])})
check("app_privacy_manifest", any(m["path"] == "PrivacyInfo.xcprivacy" for m in manifests))
check("no_tracking_declared", all(m["tracking"] is False for m in manifests))
signature = subprocess.run(["codesign", "--verify", "--deep", "--strict", str(app)], capture_output=True)
report = {
    "buildChecksPassed": all(item["passed"] for item in checks),
    "signatureVerificationPassed": signature.returncode == 0,
    "submissionReady": False,
    "version": info.get("CFBundleShortVersionString"), "build": info.get("CFBundleVersion"),
    "minimumOS": info.get("MinimumOSVersion"), "sdk": info.get("DTSDKName"),
    "executableSHA256": hashlib.sha256(image).hexdigest(),
    "checks": checks, "privacyManifests": manifests,
    "remaining": ["Distribution identity/profile and entitlements", "App Store archive validation", "Final privacy-label and required-reason API review", "StoreKit sandbox/TestFlight and provider acceptance", "Physical-device acceptance and App Store submission"],
}
args.output.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({k: report[k] for k in ["buildChecksPassed", "signatureVerificationPassed", "submissionReady", "sdk"]}))
raise SystemExit(0 if report["buildChecksPassed"] else 1)
