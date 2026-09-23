import SwiftUI
import Supabase
import PhotosUI

struct SettingsView: View {
    @Environment(AppState.self) private var state
    @State private var profile: JSONValue = .null
    @State private var logo: PhotosPickerItem?
    @State private var loaded = false
    @State private var busy = false
    @State private var message: String?
    @State private var consentSheet = false
    @State private var deleting = false
    @State private var passwordSheet = false
    @State private var confirmSignOut = false
    var body: some View {
        Form {
            if state.account["deletionPending"].bool {
                Section { Text("Deletion is incomplete and account changes are paused. Use Delete account below to retry, or contact support.") }
            }
            Section("Business details") {
                TextField("Business name", text: text("business_name"))
                TextField("Business email", text: text("email")).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                TextField("Phone", text: text("phone")).keyboardType(.phonePad)
                TextField("Address", text: text("address"), axis: .vertical)
                TextField("GST or tax number", text: text("gst_number"))
                TextField("Payment instructions", text: text("payment_instructions"), axis: .vertical)
            }
            Section("Business logo") {
                PhotosPicker(selection: $logo, matching: .images) { Label("Choose logo", systemImage: "photo") }.disabled(busy)
                if !profile["logo_url"].string.isEmpty { Button("Remove logo", role: .destructive) { Task { await changeLogo(remove: true) } }.disabled(busy) }
                Text("Your logo appears on customer quotes and invoice PDFs.").font(.footnote)
            }
            Section("Quote defaults") {
                Picker("Country", selection: text("country")) { Text("New Zealand").tag("NZ"); Text("Australia").tag("AU"); Text("United Kingdom").tag("UK"); Text("United States").tag("US"); Text("Canada").tag("CA") }
                Picker("Currency", selection: text("currency")) { ForEach(["NZD", "AUD", "GBP", "USD", "CAD"], id: \.self) { Text($0).tag($0) } }
                TextField("Tax %", value: number("tax_rate"), format: .number).keyboardType(.decimalPad)
                TextField("Hourly labour rate", value: number("default_labour_rate"), format: .number).keyboardType(.decimalPad)
                TextField("Material markup %", value: number("default_markup_pct"), format: .number).keyboardType(.decimalPad)
                Button("Save business settings") { Task { await save() } }.disabled(busy || !loaded)
            }
            Section("Privacy") {
                LabeledContent("AI processing", value: state.consented ? "Allowed" : "Off")
                if state.consented { Button("Turn off future AI processing") { Task { do { try await state.consent(false) } catch { message = error.localizedDescription } } } }
                else { Button("Review AI permission") { consentSheet = true } }
                Link("Privacy Policy", destination: URL(string: "https://tradies2quote.com/privacy")!)
                Link("Terms of Use", destination: URL(string: "https://tradies2quote.com/terms")!)
                NavigationLink("Open-source licences") { LicenceView() }
            }
            Section("Notifications") {
                Button("Enable notifications") { Task { do { try await state.enablePush(); message = "Notification permission updated." } catch { message = error.localizedDescription } } }.disabled(!state.capabilities["push"].bool)
                Button("Turn off notifications on this device") { Task { do { try await state.disablePush(); message = "Notifications turned off." } catch { message = error.localizedDescription } } }
                if !state.capabilities["push"].bool { Text("Notifications are not available yet.").font(.footnote).foregroundStyle(.secondary) }
            }
            Section("Your account") {
                Text(state.account["email"].string)
                NavigationLink("Subscription") { SubscriptionView() }
                Button("Change password") { passwordSheet = true }
                Button("Sign out") { confirmSignOut = true }
                Button("Delete account", role: .destructive) { deleting = true }
            }
            if busy { ProgressView() }
            if let message { ErrorNotice(message: message) }
        }.accessibilityIdentifier("settings.form").scrollDismissesKeyboard(.immediately).navigationTitle("Settings")
            .task { if !loaded { await state.refreshAccount(); profile = state.profile; loaded = !state.account.isNull } }
            .onChange(of: logo) { Task { await changeLogo() } }
            .sheet(isPresented: $consentSheet) { AIConsentView() }
            .sheet(isPresented: $deleting) { DeleteAccountView() }
            .sheet(isPresented: $passwordSheet) { PasswordView() }
            .confirmationDialog("Sign out?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Sign out") { Task { do { try await state.signOut() } catch { message = error.localizedDescription } } }
            } message: { Text("Device drafts stay private to this account. Sign back in to recover them.") }
    }
    private func changeLogo(remove: Bool = false) async {
        busy = true; defer { busy = false; logo = nil }
        do {
            if remove { _ = try await state.api.request("/api/mobile/v1/business-logo", method: "DELETE", body: .object([:])) }
            else if let bytes = try await logo?.loadTransferable(type: Data.self) { _ = try await state.api.upload("/api/mobile/v1/business-logo", field: "logo", filename: "logo.jpg", contentType: "image/jpeg", bytes: PreparedImage.jpeg(bytes)) }
            else { return }
            await state.refreshAccount(); profile["logo_url"] = state.profile["logo_url"]; message = "Business logo updated."
        } catch { message = error.localizedDescription }
    }
    private func text(_ key: String) -> Binding<String> { Binding(get: { profile[key].string }, set: { profile[key] = .string($0) }) }
    private func number(_ key: String) -> Binding<Double> { Binding(get: { profile[key].number }, set: { profile[key] = .number($0) }) }
    private func save() async {
        busy = true; defer { busy = false }
        do { _ = try await state.api.request("/api/mobile/v1/profile", method: "POST", body: profile); await state.refreshAccount(); message = "Business settings saved." }
        catch { message = error.localizedDescription }
    }
}

struct DeleteAccountView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @State private var confirmation = ""
    @State private var busy = false
    @State private var message: String?
    var body: some View {
        NavigationStack {
            Form {
                Section("Permanently delete your account") {
                    Text("This removes your shared Tradies2Quote and T2QCAL account, quotes, clients, invoices, saved calculations and uploaded files. It cannot be undone. Export any documents you need first.")
                    Text("If you own a team, its shared records and access may also be affected. Other members keep their own accounts.")
                    Text("Deleting the account does not cancel an Apple subscription. You can manage it below. You can still delete your account without cancelling first.")
                    Link("Manage Apple subscriptions", destination: URL(string: "https://apps.apple.com/account/subscriptions")!)
                    TextField("Type DELETE to confirm", text: $confirmation).autocorrectionDisabled().textInputAutocapitalization(.characters).accessibilityIdentifier("account.deleteConfirmation")
                    Button("Permanently delete account", role: .destructive) { Task { await delete() } }.disabled(busy || confirmation != "DELETE")
                    if busy { ProgressView("Deleting your account…") }
                    if let message { ErrorNotice(message: message) }
                }
            }.accessibilityIdentifier("delete.form").scrollDismissesKeyboard(.immediately).navigationTitle("Delete account").navigationBarTitleDisplayMode(.inline).toolbar { Button("Cancel") { dismiss() }.disabled(busy) }
        }.interactiveDismissDisabled(busy)
    }
    private func delete() async { busy = true; defer { busy = false }; do { try await state.deleteAccount(); dismiss() } catch { message = error.localizedDescription } }
}

struct PasswordView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var repeatPassword = ""
    @State private var message: String?
    @State private var busy = false
    var body: some View {
        NavigationStack {
            Form {
                SecureField("New password", text: $password).textContentType(.newPassword)
                SecureField("Repeat password", text: $repeatPassword).textContentType(.newPassword)
                Text("Use at least eight characters. A longer unique password is better.").font(.footnote)
                Button("Save password") { Task {
                    busy = true; defer { busy = false }
                    do { _ = try await state.auth.auth.update(user: UserAttributes(password: password)); password = ""; repeatPassword = ""; state.needsPasswordChange = false; dismiss() }
                    catch { message = error.localizedDescription }
                } }.disabled(busy || password.count < 8 || password != repeatPassword)
                if let message { ErrorNotice(message: message) }
            }.navigationTitle("Change password").toolbar { Button("Cancel") { dismiss() } }
        }
    }
}

struct LicenceView: View {
    private var licences: String { guard let url = Bundle.main.url(forResource: "OpenSourceLicences", withExtension: "txt") else { return "Open-source notices are unavailable." }; return (try? String(contentsOf: url, encoding: .utf8)) ?? "Open-source notices are unavailable." }
    var body: some View {
        ScrollView {
            Text(licences)
                .font(.footnote).textSelection(.enabled).padding()
        }.navigationTitle("Open-source licences")
    }
}
