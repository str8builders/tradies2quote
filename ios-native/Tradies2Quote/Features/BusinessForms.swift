import SwiftUI

struct ContactsView: View {
    @Environment(AppState.self) private var state
    @State private var clients: [BusinessRecord] = []
    @State private var query = ""
    @State private var message: String?
    @State private var creating = false
    @State private var shared = false
    var body: some View {
        List {
            if shared { Text("Shared with your team").font(.caption).foregroundStyle(.secondary) }
            if let message { ErrorNotice(message: message) { Task { await load() } } }
            ForEach(clients.filter { query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) }) { client in
                NavigationLink { ContactEditor(record: client) } label: {
                    VStack(alignment: .leading) { Text(client.title).font(.headline); Text(client.raw["email"].string).font(.subheadline).foregroundStyle(.secondary) }
                }
            }
            if clients.isEmpty && message == nil { ContentUnavailableView("Your clients", systemImage: "person.2", description: Text("Add contact details to reuse across quotes.")) }
        }.navigationTitle("Clients").searchable(text: $query).task { await load() }.refreshable { await load() }
            .toolbar { Button("Add client", systemImage: "plus") { creating = true } }
            .sheet(isPresented: $creating, onDismiss: { Task { await load() } }) { NavigationStack { ContactEditor() } }
    }
    private func load() async { do { let data = try await state.api.request("/api/clients"); clients = try await state.api.collection("clients"); shared = data["shared"].bool; message = nil } catch { message = error.localizedDescription } }
}

struct ContactEditor: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @State private var data: JSONValue
    @State private var message: String?
    @State private var busy = false
    init(record: BusinessRecord? = nil) { _data = State(initialValue: record?.raw ?? .object([:])) }
    var body: some View {
        Form {
            TextField("Name", text: text("name")).textContentType(.name)
            TextField("Email", text: text("email")).keyboardType(.emailAddress).textInputAutocapitalization(.never)
            TextField("Phone", text: text("phone")).keyboardType(.phonePad)
            TextField("Address", text: text("address"), axis: .vertical)
            if let message { ErrorNotice(message: message) }
            Button("Save client") { Task { await save() } }.disabled(busy || data["name"].string.trimmingCharacters(in: .whitespaces).isEmpty)
            if busy { ProgressView() }
        }.navigationTitle(data["id"].isNull ? "New client" : "Client")
    }
    private func text(_ key: String) -> Binding<String> { Binding(get: { data[key].string }, set: { data[key] = .string($0) }) }
    private func save() async { busy = true; defer { busy = false }; do { _ = try await state.api.request("/api/clients", method: "POST", body: data); state.refreshID = UUID(); dismiss() } catch { message = error.localizedDescription } }
}

struct MaterialEditor: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @State private var data: JSONValue
    @State private var message: String?
    @State private var busy = false
    @State private var deleting = false
    init(record: BusinessRecord? = nil) { _data = State(initialValue: record?.raw ?? .object(["unit": .string("each"), "default_unit_price": .number(0)])) }
    var body: some View {
        Form {
            Section("Material") {
                TextField("Name", text: text("name"))
                TextField("Unit", text: text("unit"))
                TextField("Unit price excluding tax", value: Binding(get: { data["default_unit_price"].number }, set: { data["default_unit_price"] = .number($0) }), format: .number).keyboardType(.decimalPad)
                TextField("Supplier", text: text("supplier"))
                TextField("Product URL", text: text("supplier_url")).keyboardType(.URL).textInputAutocapitalization(.never)
                TextField("Notes", text: text("notes"), axis: .vertical)
            }
            Section {
                if let message { ErrorNotice(message: message) }
                Button("Save material") { Task { await save() } }.disabled(busy)
                if !data["id"].isNull { Button("Delete material", role: .destructive) { deleting = true } }
                if busy { ProgressView() }
            }
        }.navigationTitle("Material")
            .confirmationDialog("Delete this material?", isPresented: $deleting, titleVisibility: .visible) { Button("Delete", role: .destructive) { Task { await save(deleting: true) } } }
    }
    private func text(_ key: String) -> Binding<String> { Binding(get: { data[key].string }, set: { data[key] = .string($0) }) }
    private func save(deleting: Bool = false) async {
        busy = true; defer { busy = false }
        do { let suffix = data["id"].isNull ? "" : "/\(data["id"].string)"; _ = try await state.api.request("/api/mobile/v1/materials\(suffix)", method: deleting ? "DELETE" : "POST", body: data); state.refreshID = UUID(); dismiss() }
        catch { message = error.localizedDescription }
    }
}

struct KitEditor: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @State private var data: JSONValue
    @State private var lines: [EditableLine]
    @State private var message: String?
    @State private var busy = false
    init(record: BusinessRecord? = nil) { _data = State(initialValue: record?.raw ?? .object([:])); _lines = State(initialValue: (record?.raw["kit_items"].array ?? []).map { EditableLine(raw: $0) }) }
    var body: some View {
        Form {
            TextField("Kit name", text: text("name"))
            TextField("Trade", text: text("trade"))
            TextField("Notes", text: text("notes"), axis: .vertical)
            Section("Reusable lines") {
                ForEach($lines) { $line in LineEditor(line: $line) }.onDelete { lines.remove(atOffsets: $0) }
                Button("Add line") { lines.append(EditableLine(raw: .object(["type": .string("material"), "unit": .string("each"), "quantity": .number(1), "unit_price": .number(0)]))) }
            }
            if let message { ErrorNotice(message: message) }
            Button("Save kit") { Task { await save() } }.disabled(busy)
            if busy { ProgressView() }
        }.navigationTitle("Material kit")
    }
    private func text(_ key: String) -> Binding<String> { Binding(get: { data[key].string }, set: { data[key] = .string($0) }) }
    private func save() async {
        busy = true; defer { busy = false }; var payload = data; payload["items"] = .array(lines.map(\.raw))
        do { _ = try await state.api.request("/api/mobile/v1/kits", method: "POST", body: payload); state.refreshID = UUID(); dismiss() } catch { message = error.localizedDescription }
    }
}

struct TemplatesView: View {
    @Environment(AppState.self) private var state
    @State private var templates: [BusinessRecord] = []
    @State private var message: String?
    @State private var canEdit = false
    @State private var adding = false
    var body: some View {
        List {
            if let message { ErrorNotice(message: message) }
            if !canEdit { Text("Reusable terms are available to the owner of a Builder plan.").foregroundStyle(.secondary) }
            ForEach(templates) { item in NavigationLink { TemplateEditor(initial: item.raw, canEdit: canEdit) } label: { Text(item.raw["title"].string) } }
        }.navigationTitle("Terms templates").task { await load() }.refreshable { await load() }
            .toolbar { if canEdit { Button("Add", systemImage: "plus") { adding = true } } }
            .sheet(isPresented: $adding, onDismiss: { Task { await load() } }) { NavigationStack { TemplateEditor(initial: .object([:]), canEdit: true) } }
    }
    private func load() async { do { let result = try await state.api.request("/api/terms-templates"); templates = result["templates"].array.map(BusinessRecord.init(raw:)); canEdit = result["canEdit"].bool; message = nil } catch { message = error.localizedDescription } }
}
struct TemplateEditor: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    let canEdit: Bool
    @State private var data: JSONValue
    @State private var message: String?
    @State private var busy = false
    init(initial: JSONValue, canEdit: Bool) { self.canEdit = canEdit; _data = State(initialValue: initial) }
    var body: some View {
        Form {
            TextField("Title", text: Binding(get: { data["title"].string }, set: { data["title"] = .string($0) })).disabled(!canEdit)
            TextEditor(text: Binding(get: { data["body"].string }, set: { data["body"] = .string($0) })).frame(minHeight: 220).accessibilityLabel("Terms").disabled(!canEdit)
            if let message { ErrorNotice(message: message) }
            if canEdit { Button("Save template") { Task { busy = true; defer { busy = false }; do { _ = try await state.api.request("/api/terms-templates", method: "POST", body: data); dismiss() } catch { message = error.localizedDescription } } }.disabled(busy) }
        }.navigationTitle("Terms")
    }
}
