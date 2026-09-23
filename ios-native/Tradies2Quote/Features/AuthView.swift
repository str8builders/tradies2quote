import SwiftUI
import Supabase

struct AuthView: View {
    @Environment(AppState.self) private var state
    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @State private var mode: Mode = .login
    @State private var busy = false
    @State private var message: String?
    @State private var acceptedTerms = false
    enum Mode: String, CaseIterable { case login = "Sign in", signup = "Create account", recover = "Reset password", verify = "Verify email" }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Image(systemName: "doc.text").font(.largeTitle).foregroundStyle(.tint).accessibilityHidden(true)
                        Text("Tradies2Quote").font(.largeTitle.bold())
                        Text("From the job site to a clear quote.").foregroundStyle(.secondary)
                    }.padding(.vertical)
                }
                Section(mode.rawValue) {
                    TextField("Email", text: $email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("auth.email")
                    if mode == .login || mode == .signup {
                        SecureField("Password", text: $password).textContentType(mode == .signup ? .newPassword : .password).accessibilityIdentifier("auth.password")
                    }
                    if mode == .verify { TextField("Email verification code", text: $code).textContentType(.oneTimeCode).keyboardType(.numberPad) }
                    if mode == .signup { Toggle("I agree to the Terms and Privacy Policy", isOn: $acceptedTerms) }
                    Button(mode.rawValue) { Task { await submit() } }
                        .disabled(busy || email.trimmingCharacters(in: .whitespaces).isEmpty || (mode == .signup && !acceptedTerms))
                        .accessibilityIdentifier("auth.submit")
                    if busy { ProgressView() }
                    if let message { Text(message).foregroundStyle(.secondary).accessibilityIdentifier("auth.message") }
                    if let message = state.sessionMessage { Text(message).foregroundStyle(.secondary) }
                }
                Section {
                    if mode != .login { Button("Back to sign in") { mode = .login; message = nil } }
                    if mode == .login {
                        Button("Create an account") { mode = .signup; message = nil }
                        Button("Forgot password?") { mode = .recover; message = nil }
                        Button("Enter email verification code") { mode = .verify; message = nil }
                    }
                    Link("Privacy Policy", destination: URL(string: "https://tradies2quote.com/privacy")!)
                    Link("Terms of Use", destination: URL(string: "https://tradies2quote.com/terms")!)
                    Link("Support", destination: URL(string: "https://tradies2quote.com/support")!)
                }
            }.accessibilityIdentifier("auth.form").scrollDismissesKeyboard(.immediately)
                .navigationTitle(mode.rawValue).navigationBarTitleDisplayMode(.inline)
        }
    }
    private func submit() async {
        busy = true; message = nil; defer { busy = false }
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            switch mode {
            case .login:
                _ = try await state.auth.auth.signIn(email: address, password: password)
                password = ""; try await state.signedIn()
            case .signup:
                let response = try await state.auth.auth.signUp(email: address, password: password, redirectTo: URL(string: "tradies2quote://auth"))
                password = ""
                if response.session != nil { try await state.signedIn() }
                else { mode = .verify; message = "Check your email to confirm your account. You can open the link or enter the code here." }
            case .verify:
                _ = try await state.auth.auth.verifyOTP(email: address, token: code, type: .signup)
                code = ""; try await state.signedIn()
            case .recover:
                try await state.auth.auth.resetPasswordForEmail(address, redirectTo: URL(string: "tradies2quote://auth?recovery=1"))
                message = "If an account exists, a reset link has been sent. Open it on this device to choose a new password."
            }
        } catch { message = error.localizedDescription }
    }
}
