import Foundation
import Observation
import Supabase

@Observable @MainActor
final class AppState {
    let auth: SupabaseClient
    private let apiBaseURL: URL
    private let apiSession: URLSession
    var api: MobileAPI {
        let auth = auth; let expected = accountID
        return MobileAPI(baseURL: apiBaseURL, token: {
            let session = try await auth.auth.session
            guard session.user.id.uuidString.lowercased() == expected else { throw ServiceError(status: 401, message: "The signed-in account changed. Reopen this screen before continuing.") }
            return session.accessToken
        }, session: apiSession)
    }
    let drafts: DraftStore?
    var accountID: String?
    var account: JSONValue = .null
    private var didStart = false
    var isStarting = true
    var sessionMessage: String?
    var pendingQuoteID: String?
    var needsPasswordChange = false
    var refreshID = UUID()

    init() {
        let bundle = Bundle.main
        var authURL = bundle.object(forInfoDictionaryKey: "T2QSupabaseURL") as? String ?? "https://api.tradies2quote.com"
        var key = bundle.object(forInfoDictionaryKey: "T2QSupabasePublicKey") as? String ?? ""
        var serviceURL = bundle.object(forInfoDictionaryKey: "T2QAPIURL") as? String ?? "https://tradies2quote.com"
        var keychainService = "com.str8builders.tradies2quote.auth"
        #if DEBUG && targetEnvironment(simulator)
        // Simulator-only integration configuration. Never present in a shipping build.
        let test = ProcessInfo.processInfo.environment
        if let authAddress = test["T2Q_TEST_AUTH_URL"], let apiAddress = test["T2Q_TEST_API_URL"],
           [authAddress, apiAddress].allSatisfy({ URL(string: $0)?.host == "127.0.0.1" && URL(string: $0)?.scheme == "http" }),
           let testKey = test["T2Q_TEST_ANON_KEY"] {
            authURL = authAddress; serviceURL = apiAddress; key = testKey; keychainService += ".integration"
        }
        #endif
        let auth = SupabaseClient(supabaseURL: URL(string: authURL)!, supabaseKey: key, options: .init(auth: .init(storage: KeychainLocalStorage(service: keychainService), flowType: .pkce)))
        self.auth = auth
        let apiURL = URL(string: serviceURL)!
        apiBaseURL = apiURL
        apiSession = MobileAPI(baseURL: apiURL, token: { try await auth.auth.session.accessToken }).session
        do { drafts = try DraftStore() } catch { drafts = nil; sessionMessage = "Local drafts are unavailable: \(error.localizedDescription)" }
    }
    var profile: JSONValue { account["profile"] }
    var consented: Bool { account["consented"].bool }
    var capabilities: JSONValue { account["capabilities"] }

    func start() async {
        guard !didStart else { return }; didStart = true
        #if DEBUG && targetEnvironment(simulator)
        if apiBaseURL.host == "127.0.0.1", ProcessInfo.processInfo.environment["T2Q_TEST_RESET"] == "1" { try? await auth.auth.signOut(scope: .local) }
        #endif
        do {
            let session = try await auth.auth.session
            accountID = session.user.id.uuidString.lowercased()
            await refreshAccount()
            await reconcilePurchases()
            await resumeDeviceNotifications()
        } catch {
            // No stored session is the normal first-launch state. Network errors
            // while reading an existing session remain visible on the login form.
            if let stored = auth.auth.currentSession { accountID = stored.user.id.uuidString.lowercased(); sessionMessage = "You are offline. Device drafts are available; connect to refresh your account." }
        }
        isStarting = false
    }
    func refreshAccount() async {
        do { account = try await api.request("/api/mobile/v1/account"); sessionMessage = nil }
        catch { sessionMessage = error.localizedDescription }
    }
    func observeAuth() async {
        for await (event, session) in auth.auth.authStateChanges {
            if event == .signedOut { accountID = nil; account = .null; pendingQuoteID = nil }
            if event == .passwordRecovery, let session {
                accountID = session.user.id.uuidString.lowercased(); needsPasswordChange = true
            }
        }
    }
    func signedIn() async throws {
        let session = try await auth.auth.session
        accountID = session.user.id.uuidString.lowercased()
        await refreshAccount()
        await reconcilePurchases()
        await resumeDeviceNotifications()
    }
    func signOut() async throws {
        // Preserve local drafts while signed out, partitioned by account. The
        // user can recover them only after signing back into the same account.
        do { try await disablePush() } catch { suspendDeviceNotifications() }
        try await auth.auth.signOut(scope: .local)
        accountID = nil; account = .null; pendingQuoteID = nil; needsPasswordChange = false
    }
    func deleteAccount() async throws {
        do { _ = try await api.request("/api/account/delete", method: "POST", body: .object(["confirm": .string("DELETE")])) }
        catch { await refreshAccount(); throw error }
        let deletedID = accountID
        var cleanupError: (any Error)?
        if let deletedID { do { try await drafts?.clear(accountID: deletedID) } catch { cleanupError = error } }
        try await signOut()
        if cleanupError != nil { sessionMessage = "Your account was deleted. Remove this app to clear any device drafts that could not be erased." }
    }
    func consent(_ granted: Bool) async throws {
        _ = try await api.request("/api/mobile/v1/consent", method: "POST", body: .object(["granted": .bool(granted), "version": capabilities["aiDisclosure"]["version"]]))
        await refreshAccount()
    }
    func open(_ url: URL) async {
        if url.scheme == "tradies2quote" && url.host == "auth" {
            do { _ = try await auth.auth.session(from: url); try await signedIn(); if URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.contains(where: { $0.name == "recovery" && $0.value == "1" }) == true { needsPasswordChange = true } }
            catch { sessionMessage = "The sign-in link could not be verified. Request a new one." }
            return
        }
        guard url.scheme == "https", url.host == "tradies2quote.com" else { return }
        let components = url.pathComponents.filter { $0 != "/" }
        guard components.count == 4, Array(components.prefix(3)) == ["app", "quotes", "preview"], UUID(uuidString: components[3]) != nil else { return }
        pendingQuoteID = components[3]
    }
}
