import SwiftUI

struct MainTabs: View {
    @Environment(AppState.self) private var state
    @State private var selected = 0
    @State private var incoming: QuoteLink?
    struct QuoteLink: Identifiable { let id: String }
    var body: some View {
        TabView(selection: $selected) {
            NavigationStack { HomeView() }.tabItem { Label("Home", systemImage: "house") }.tag(0)
            NavigationStack { RecordList(kind: .quotes) }.tabItem { Label("Quotes", systemImage: "doc.text") }.tag(1)
            NavigationStack { RecordList(kind: .invoices) }.tabItem { Label("Invoices", systemImage: "receipt") }.tag(2)
            NavigationStack { ContactsView() }.tabItem { Label("Clients", systemImage: "person.2") }.tag(3)
            NavigationStack { MoreView() }.tabItem { Label("More", systemImage: "ellipsis.circle") }.tag(4)
        }
        .onChange(of: state.pendingQuoteID, initial: true) {
            if let id = state.pendingQuoteID { incoming = QuoteLink(id: id); state.pendingQuoteID = nil }
        }
        .sheet(item: $incoming) { link in NavigationStack { QuoteDetail(id: link.id) } }
        .sheet(isPresented: Binding(get: { state.needsPasswordChange }, set: { state.needsPasswordChange = $0 })) { PasswordView() }
    }
}

struct HomeView: View {
    @Environment(AppState.self) private var state
    @State private var counts: JSONValue = .null
    @State private var message: String?
    @State private var creating = false
    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text(state.profile["business_name"].string.nonempty ?? "Your work, organised").font(.title2.bold())
                    Text("Build a quote. Get the job moving.").foregroundStyle(.secondary)
                    Button("New quote", systemImage: "plus") { creating = true }.buttonStyle(.borderedProminent).padding(.top, 6).accessibilityIdentifier("home.newQuote")
                }.padding(.vertical, 8)
            }
            Section("Your business") {
                NavigationLink { RecordList(kind: .quotes) } label: { LabeledContent("Quotes", value: counts["quotes"].isNull ? "—" : String(Int(counts["quotes"].number))) }
                NavigationLink { RecordList(kind: .invoices) } label: { LabeledContent("Invoices", value: counts["invoices"].isNull ? "—" : String(Int(counts["invoices"].number))) }
                NavigationLink { RecordList(kind: .requests) } label: { LabeledContent("New requests", value: counts["requests"].isNull ? "—" : String(Int(counts["requests"].number))) }
                NavigationLink { ScheduleView() } label: { Label("Schedule", systemImage: "calendar") }
            }
            if let message = message ?? state.sessionMessage { Section { ErrorNotice(message: message) { Task { await load() } } } }
            Section {
                Text("Review every price, quantity and job detail before sending a quote.").font(.footnote).foregroundStyle(.secondary)
            }
        }.navigationTitle("Tradies2Quote")
            .task(id: state.refreshID) { await load() }.refreshable { await load() }
            .sheet(isPresented: $creating) { NavigationStack { QuoteEditor(ownerID: state.accountID ?? "") } }
    }
    private func load() async {
        do { counts = try await state.api.request("/api/mobile/v1/dashboard"); message = nil }
        catch { message = error.localizedDescription }
    }
}

struct MoreView: View {
    @Environment(AppState.self) private var state
    var body: some View {
        List {
            Section("Prepare work") {
                NavigationLink { RecordList(kind: .materials) } label: { Label("Materials", systemImage: "shippingbox") }
                NavigationLink { SupplierScanView() } label: { Label("Supplier documents", systemImage: "doc.viewfinder") }
                if state.capabilities["kits"].bool { NavigationLink { RecordList(kind: .kits) } label: { Label("Material kits", systemImage: "square.stack.3d.up") } }
                NavigationLink { TemplatesView() } label: { Label("Terms templates", systemImage: "text.document") }
            }
            Section("Manage work") {
                NavigationLink { RecordList(kind: .requests) } label: { Label("Quote requests", systemImage: "tray") }
                NavigationLink { RequestLinkView() } label: { Label("Request link and QR code", systemImage: "qrcode") }
                NavigationLink { ScheduleView() } label: { Label("Schedule and weather", systemImage: "calendar") }
                NavigationLink { TeamView() } label: { Label("Team", systemImage: "person.3") }
            }
            Section("Account") {
                NavigationLink { SettingsView() } label: { Label("Settings", systemImage: "gearshape") }
                NavigationLink { SubscriptionView() } label: { Label("Subscription", systemImage: "creditcard") }
                Link("Help and support", destination: URL(string: "https://tradies2quote.com/support")!)
            }
        }.navigationTitle("More")
    }
}

struct ErrorNotice: View {
    let message: String
    var retry: (() -> Void)?
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(message, systemImage: "exclamationmark.circle").foregroundStyle(.secondary).accessibilityIdentifier("service.error")
            if let retry { Button("Try again", action: retry) }
        }.padding(.vertical, 6)
    }
}
