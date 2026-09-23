import SwiftUI

enum LibraryKind: String, Identifiable { case clients, materials, kits, terms
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
}
struct LibraryPicker: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    let kind: LibraryKind
    let select: (JSONValue) -> Void
    @State private var records: [BusinessRecord] = []
    @State private var query = ""
    @State private var loading = true
    @State private var message: String?
    var body: some View {
        NavigationStack {
            List {
                if loading { ProgressView("Loading…") }
                ForEach(records.filter { query.isEmpty || ($0.title + $0.raw["title"].string).localizedCaseInsensitiveContains(query) }) { record in
                    Button { select(record.raw); dismiss() } label: {
                        VStack(alignment: .leading) {
                            Text(record.raw["title"].string.nonempty ?? record.title)
                            if kind == .materials { Text(record.raw["default_unit_price"].number, format: .currency(code: state.profile["currency"].string.nonempty ?? "NZD")).font(.caption) }
                        }
                    }
                }
                if !loading && records.isEmpty && message == nil { ContentUnavailableView("Nothing saved yet", systemImage: "tray", description: Text("Add reusable details from Clients or More.")) }
                if let message { ErrorNotice(message: message) }
            }.accessibilityIdentifier("library.picker").navigationTitle(kind.title).searchable(text: $query)
                .toolbar { Button("Cancel") { dismiss() } }.task { await load() }
        }
    }
    private func load() async {
        defer { loading = false }
        do {
            switch kind {
            case .clients: records = try await state.api.collection("clients")
            case .terms: records = try await state.api.request("/api/terms-templates")["templates"].array.map(BusinessRecord.init(raw:))
            case .materials, .kits: records = try await state.api.collection(kind.rawValue)
            }
        } catch { message = error.localizedDescription }
    }
}
