import SwiftUI

enum RecordKind: String { case quotes, invoices, materials, requests, kits
    var title: String { self == .requests ? "Quote requests" : rawValue.capitalized }
}

struct RecordList: View {
    @Environment(AppState.self) private var state
    let kind: RecordKind
    @State private var rows: [BusinessRecord] = []
    @State private var local: [SavedDraft] = []
    @State private var query = ""
    @State private var loading = true
    @State private var message: String?
    @State private var creating = false
    @State private var archived = false
    private var visible: [BusinessRecord] {
        rows.filter { row in
            let archiveMatches = kind != .quotes || row.raw["archived_at"].isNull != archived
            return archiveMatches && (query.isEmpty || (row.title + " " + row.quote["client"]["name"].string).localizedCaseInsensitiveContains(query))
        }
    }
    var body: some View {
        List {
            if kind == .quotes {
                Toggle("Show archived", isOn: $archived)
                if !local.isEmpty {
                    Section("Drafts on this device") {
                        ForEach(local) { draft in
                            NavigationLink { QuoteEditor(ownerID: draft.accountID, localDraft: draft) } label: {
                                Label(draft.quote["job_summary"].string.nonempty ?? "Unsaved quote", systemImage: "iphone")
                            }
                        }
                    }
                }
            }
            if loading && rows.isEmpty { ProgressView("Loading \(kind.title.lowercased())…") }
            if let message { ErrorNotice(message: message) { Task { await load() } } }
            if !loading && visible.isEmpty && message == nil {
                ContentUnavailableView(query.isEmpty ? "No \(kind.title.lowercased()) yet" : "No matching results", systemImage: "doc.text.magnifyingglass", description: Text(query.isEmpty ? "Your saved work will appear here." : "Try another search."))
            }
            ForEach(visible) { row in
                NavigationLink {
                    switch kind {
                    case .quotes: QuoteDetail(id: row.id)
                    case .invoices: InvoiceDetail(record: row)
                    case .materials: MaterialEditor(record: row)
                    case .requests: RequestDetail(record: row)
                    case .kits: KitEditor(record: row)
                    }
                } label: { RecordRow(record: row, kind: kind) }
            }
        }.navigationTitle(kind.title).searchable(text: $query)
            .task(id: state.refreshID) { await load() }.refreshable { await load() }
            .toolbar {
                if [.quotes, .materials, .kits].contains(kind) { Button("Add", systemImage: "plus") { creating = true }.accessibilityIdentifier("records.add") }
            }
            .sheet(isPresented: $creating, onDismiss: { Task { await load() } }) {
                NavigationStack {
                    switch kind {
                    case .quotes: QuoteEditor(ownerID: state.accountID ?? "")
                    case .materials: MaterialEditor()
                    case .kits: KitEditor()
                    default: EmptyView()
                    }
                }
            }
    }
    private func load() async {
        loading = true; defer { loading = false }
        do {
            if kind == .quotes, let account = state.accountID { local = try await state.drafts?.list(accountID: account) ?? [] }
            rows = try await state.api.collection(kind.rawValue); message = nil
        } catch { message = error.localizedDescription }
    }
}

struct RecordRow: View {
    @Environment(AppState.self) private var state
    let record: BusinessRecord
    let kind: RecordKind
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(record.title).font(.headline).lineLimit(2)
            if !record.quote["client"]["name"].string.isEmpty { Text(record.quote["client"]["name"].string).foregroundStyle(.secondary) }
            if kind == .quotes || kind == .invoices {
                HStack {
                    Text(record.status.replacingOccurrences(of: "_", with: " ").capitalized).font(.caption).foregroundStyle(.secondary)
                    Spacer(); Text(record.total, format: .currency(code: record.currency)).monospacedDigit()
                }
            }
            if kind == .materials { Text(record.raw["default_unit_price"].number, format: .currency(code: state.profile["currency"].string.nonempty ?? "NZD")) + Text(" / \(record.raw["unit"].string)") }
        }.padding(.vertical, 4).accessibilityElement(children: .combine)
    }
}
