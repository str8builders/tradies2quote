import SwiftUI
import StoreKit

struct SubscriptionView: View {
    @Environment(AppState.self) private var state
    @State private var products: [Product] = []
    @State private var message: String?
    @State private var busy = false
    private var hasAccess: Bool { state.account["entitlement"]["state"].string == "paid" }
    var body: some View {
        List {
            Section("Your plan") {
                Text(state.account["entitlement"]["plan"].string.capitalized.nonempty ?? state.account["entitlement"]["state"].string.capitalized)
                if hasAccess { Text("Your account already has active access. Manage the existing subscription to avoid paying twice.").foregroundStyle(.secondary) }
                if state.account["entitlement"]["managedByTeam"].bool { Text("Your team owner manages this plan.") }
            }
            if !hasAccess {
                Section("Monthly subscriptions") {
                    ForEach(products) { product in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(product.displayName).font(.headline)
                            Text(product.description)
                            Text("\(product.displayPrice) per month").font(.headline)
                            Button("Subscribe to \(product.displayName)") { Task { await purchase(product) } }.disabled(busy)
                        }.padding(.vertical, 6)
                    }
                    if products.isEmpty { Text("Subscriptions are currently unavailable. You can restore an existing purchase or try again later.").foregroundStyle(.secondary) }
                }
            }
            Section {
                Button("Restore purchases") { Task { await restore() } }.disabled(busy)
                Link("Manage Apple subscriptions", destination: URL(string: "https://apps.apple.com/account/subscriptions")!)
                Link("Privacy Policy", destination: URL(string: "https://tradies2quote.com/privacy")!)
                Link("Terms of Use", destination: URL(string: "https://tradies2quote.com/terms")!)
                Text("Payment is charged to your Apple Account. Subscriptions renew automatically unless cancelled at least 24 hours before the current period ends. Manage or cancel in your Apple Account settings.").font(.footnote).foregroundStyle(.secondary)
            }
            if busy { ProgressView() }
            if let message { ErrorNotice(message: message) }
        }.navigationTitle("Subscription").task { await load() }
    }
    private func load() async {
        await state.refreshAccount()
        do {
            let ids = state.capabilities["appleProductIDs"].array.map(\.string)
            products = try await Product.products(for: ids).filter { $0.type == .autoRenewable && $0.subscription?.subscriptionPeriod.unit == .month && $0.subscription?.subscriptionPeriod.value == 1 }.sorted { $0.price < $1.price }
        } catch { message = error.localizedDescription }
    }
    private func purchase(_ product: Product) async {
        guard let id = state.accountID.flatMap(UUID.init(uuidString:)) else { return }
        busy = true; defer { busy = false }
        do {
            switch try await product.purchase(options: [.appAccountToken(id)]) {
            case .success(let result): try await state.deliverPurchase(result); message = "Subscription activated."
            case .pending: message = "Apple is waiting for purchase approval. Access will update when it is approved."
            case .userCancelled: break
            @unknown default: message = "Apple could not complete the purchase. Please retry."
            }
        } catch { message = error.localizedDescription }
    }
    private func restore() async {
        busy = true; defer { busy = false }
        do { try await AppStore.sync(); var found = false
            for await result in StoreKit.Transaction.currentEntitlements { try await state.deliverPurchase(result); found = true }
            message = found ? "Purchases restored." : "No active Apple subscription was found for this Apple Account."
        } catch { message = error.localizedDescription }
    }
}

extension AppState {
    func deliverPurchase(_ result: VerificationResult<StoreKit.Transaction>) async throws {
        guard case .verified(let transaction) = result else { throw ServiceError(status: 0, message: "Apple could not verify this purchase.") }
        try await PurchaseDelivery.deliver(transaction, signedTransaction: result.jwsRepresentation, accountID: accountID, api: api)
        await refreshAccount()
    }
    func reconcilePurchases() async {
        guard accountID != nil, capabilities["appleSubscriptions"].bool else { return }
        for await result in StoreKit.Transaction.unfinished {
            guard case .verified(let transaction) = result, transaction.appAccountToken?.uuidString.lowercased() == accountID else { continue }
            do { try await deliverPurchase(result) } catch { sessionMessage = error.localizedDescription }
        }
        for await result in StoreKit.Transaction.currentEntitlements {
            guard case .verified(let transaction) = result, transaction.appAccountToken?.uuidString.lowercased() == accountID else { continue }
            do { try await deliverPurchase(result) } catch { sessionMessage = error.localizedDescription }
        }
    }
    func observePurchases() async {
        for await result in StoreKit.Transaction.updates {
            guard accountID != nil else { continue }
            do { try await deliverPurchase(result) } catch { sessionMessage = error.localizedDescription }
        }
    }
}

enum PurchaseDelivery {
    /// Finish only after the server accepts the verified transaction for its
    /// original app account. Errors deliberately leave it queued for retry.
    static func deliver(_ transaction: StoreKit.Transaction, signedTransaction: String, accountID: String?, api: MobileAPI) async throws {
        guard let accountID, transaction.appAccountToken?.uuidString.lowercased() == accountID.lowercased() else { throw ServiceError(status: 409, message: "This purchase belongs to another Tradies2Quote account. Sign into the account that bought it, or contact support.") }
        _ = try await api.request("/api/mobile/v1/billing/apple/verify", method: "POST", body: .object(["signedTransaction": .string(signedTransaction)]))
        await transaction.finish()
    }
}
