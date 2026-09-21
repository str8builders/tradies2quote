import SwiftUI

struct QuoteEditor: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    let ownerID: String
    let record: BusinessRecord?
    let localDraft: SavedDraft?
    @State private var id: String
    @State private var quote: JSONValue
    @State private var lines: [EditableLine]
    @State private var transcript: String
    @State private var busy = false
    @State private var message: String?
    @State private var savedLocally = false
    @State private var library: LibraryKind?
    @State private var consentSheet = false
    @State private var captureSheet = false
    @State private var serverExists: Bool
    @State private var revision: String?
    @State private var finished = false
    @State private var persistenceTask: Task<Void, Never>?
    // One-time editor snapshot: changes stay private until Save. Remote updates
    // are checked by revision on save, never injected into an in-progress form.
    init(ownerID: String, record: BusinessRecord? = nil, localDraft: SavedDraft? = nil) {
        self.ownerID = ownerID
        self.record = record; self.localDraft = localDraft
        let initial = localDraft?.quote ?? record?.quote ?? QuoteMath.blank(profile: .null)
        _quote = State(initialValue: initial)
        _lines = State(initialValue: initial["line_items"].array.map { EditableLine(raw: $0) })
        _id = State(initialValue: localDraft?.id ?? record?.id ?? UUID().uuidString.lowercased())
        _transcript = State(initialValue: localDraft?.transcript ?? record?.raw["voice_transcript"].string ?? "")
        _serverExists = State(initialValue: record != nil || localDraft?.serverRevision != nil)
        _revision = State(initialValue: localDraft?.serverRevision ?? record?.raw["revision"].string.nonempty)
    }
    private var snapshot: JSONValue { var value = quote; value["line_items"] = .array(lines.map(\.raw)); return QuoteMath.recalculate(value) }
    var body: some View {
        Form {
            Section("Job") {
                TextField("Job summary", text: stringBinding("job_summary"), axis: .vertical).accessibilityIdentifier("quote.summary")
                Button("Choose saved client") { library = .clients }
                TextField("Client name", text: clientBinding("name"))
                TextField("Client email", text: clientBinding("email")).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                TextField("Client phone", text: clientBinding("phone")).keyboardType(.phonePad)
                TextField("Site address", text: clientBinding("address"), axis: .vertical)
            }
            if !serverExists || lines.isEmpty {
                Section("Describe the work") {
                    TextEditor(text: $transcript).frame(minHeight: 100).accessibilityLabel("Job description").accessibilityIdentifier("quote.description")
                    Button("Record a voice note", systemImage: "mic") { if state.consented { captureSheet = true } else { consentSheet = true } }
                    Button("Generate draft quote", systemImage: "sparkles") {
                        if state.consented { Task { await generate() } } else { consentSheet = true }
                    }.disabled(busy || transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            Section("Quote lines") {
                Button("Add from materials") { library = .materials }
                if state.capabilities["kits"].bool { Button("Add a saved kit") { library = .kits } }
                ForEach($lines) { $line in LineEditor(line: $line) }
                    .onDelete { lines.remove(atOffsets: $0) }
                Button("Add line", systemImage: "plus") {
                    lines.append(EditableLine(raw: .object(["type": .string("material"), "description": .string(""), "unit": .string("each"), "quantity": .number(1), "unit_price": .number(0), "line_total": .number(0)])))
                }.accessibilityIdentifier("quote.addLine")
            }
            Section("Pricing") {
                TextField("Currency", text: stringBinding("currency")).textInputAutocapitalization(.characters)
                TextField("Material markup %", value: numberBinding("markup_pct"), format: .number).keyboardType(.decimalPad)
                TextField("Tax label", text: stringBinding("tax_label"))
                TextField("Tax %", value: numberBinding("tax_rate"), format: .number).keyboardType(.decimalPad)
                LabeledContent("Tax") { Text(snapshot["tax_amount"].number, format: .currency(code: quote["currency"].string)) }
                LabeledContent("Total") { Text(snapshot["total"].number, format: .currency(code: quote["currency"].string)).bold() }
            }
            Section("Terms") { Button("Choose saved terms") { library = .terms }; TextEditor(text: stringBinding("terms")).frame(minHeight: 90).accessibilityLabel("Quote terms") }
            Section {
                if busy { ProgressView("Saving your work…") }
                if let message { ErrorNotice(message: message) }
                Text(savedLocally ? "Draft saved on this device." : "Changes will be saved privately on this device.").font(.footnote).foregroundStyle(.secondary)
                Button("Save quote") { Task { await save() } }.disabled(busy).accessibilityIdentifier("quote.save")
            }
        } .disabled(busy).navigationTitle(serverExists ? "Edit quote" : "New quote").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { Task { await flushDraft(); dismiss() } } } }
            .onChange(of: quote) { queuePersist() }.onChange(of: lines) { queuePersist() }.onChange(of: transcript) { queuePersist() }
            .task {
                if record == nil && localDraft == nil { quote = QuoteMath.blank(profile: state.profile) }
            }
            .sheet(item: $library) { kind in LibraryPicker(kind: kind) { item in applyLibrary(item, kind: kind) } }
            .sheet(isPresented: $consentSheet) { AIConsentView() }
            .sheet(isPresented: $captureSheet) { VoiceCaptureView(transcript: $transcript) }
    }
    private func applyLibrary(_ item: JSONValue, kind: LibraryKind) {
        switch kind {
        case .clients:
            for key in ["name", "email", "phone", "address"] { quote["client"][key] = item[key].isNull ? .string("") : item[key] }
        case .materials:
            lines.append(EditableLine(raw: .object(["type": .string("material"), "description": item["name"], "quantity": .number(1), "unit": item["unit"], "unit_price": item["default_unit_price"], "library_id": item["id"], "price_source": .string("library"), "is_missing_price": .bool(false)])))
        case .kits:
            lines.append(contentsOf: item["kit_items"].array.sorted { $0["position"].number < $1["position"].number }.map { source in
                var line = source; line["unit"] = .string(source["unit"].string.nonempty ?? "each"); return EditableLine(raw: line)
            })
        case .terms: quote["terms"] = item["body"]
        }
    }
    private func stringBinding(_ key: String) -> Binding<String> { Binding(get: { quote[key].string }, set: { quote[key] = .string($0) }) }
    private func numberBinding(_ key: String) -> Binding<Double> { Binding(get: { quote[key].number }, set: { quote[key] = .number($0) }) }
    private func clientBinding(_ key: String) -> Binding<String> { Binding(get: { quote["client"][key].string }, set: { quote["client"][key] = .string($0) }) }
    private func queuePersist() {
        guard !finished else { return }
        persistenceTask?.cancel()
        persistenceTask = Task { try? await Task.sleep(for: .milliseconds(250)); if !Task.isCancelled { await persist() } }
    }
    private func flushDraft() async {
        persistenceTask?.cancel()
        await persistenceTask?.value
        await persist()
    }
    private func persist() async {
        guard !finished else { return }
        guard state.accountID == ownerID, let store = state.drafts else { return }; let accountID = ownerID
        do {
            try await store.save(SavedDraft(id: id, accountID: accountID, quote: snapshot, transcript: transcript, serverRevision: revision, updatedAt: Date()))
            savedLocally = true
        } catch { message = "Could not save this draft on your device: \(error.localizedDescription)" }
    }
    private func writeServer() async throws {
        guard state.accountID == ownerID else { throw ServiceError(status: 401, message: "Sign back into the account that owns this draft.") }
        if serverExists {
            let result = try await state.api.request("/api/mobile/v1/quotes/\(id)/save", method: "POST", body: .object(["quote_data": snapshot, "expectedRevision": .string(revision ?? ""), "transcript": .string(transcript)]))
            revision = result["revision"].string.nonempty
        } else {
            let result = try await state.api.request("/api/mobile/v1/quotes", method: "POST", body: .object(["operationID": .string(id), "transcript": .string(transcript), "quote_data": snapshot]))
            serverExists = true; revision = result["revision"].string.nonempty
        }
    }
    private func save() async {
        busy = true; defer { busy = false }; await flushDraft()
        do {
            try await writeServer()
            finished = true; persistenceTask?.cancel()
            await persistenceTask?.value
            try await state.drafts?.remove(id: id, accountID: ownerID)
            state.refreshID = UUID(); dismiss()
        } catch { finished = false; message = error.localizedDescription }
    }
    private func generate() async {
        busy = true; defer { busy = false }; await flushDraft()
        do {
            try await writeServer()
            _ = try await state.api.request("/api/quotes/generate", method: "POST", body: .object(["id": .string(id)]))
            let response = try await state.api.request("/api/mobile/v1/quotes/\(id)")
            revision = response["item"]["revision"].string.nonempty
            quote = response["item"]["quote_data"]; lines = quote["line_items"].array.map { EditableLine(raw: $0) }
            await persist(); message = "Draft ready. Check all quantities, prices and details before sending."
        } catch { message = error.localizedDescription }
    }
}

struct LineEditor: View {
    @Binding var line: EditableLine
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("Description", text: text("description"), axis: .vertical)
            Picker("Type", selection: text("type")) { Text("Material").tag("material"); Text("Labour").tag("labour"); Text("Other").tag("other") }
            HStack {
                TextField("Quantity", value: number("quantity"), format: .number).keyboardType(.decimalPad).accessibilityLabel("Quantity")
                TextField("Unit", text: text("unit")).accessibilityLabel("Unit")
                TextField("Unit price", value: number("unit_price"), format: .number).keyboardType(.decimalPad).accessibilityLabel("Unit price")
            }
            if !line.raw["t2qcal_source_key"].string.isEmpty { Text("Imported from your separate calculator app").font(.caption).foregroundStyle(.secondary) }
        }.padding(.vertical, 5)
    }
    private func text(_ key: String) -> Binding<String> { Binding(get: { line.raw[key].string }, set: { line.raw[key] = .string($0) }) }
    private func number(_ key: String) -> Binding<Double> { Binding(get: { line.raw[key].number }, set: { line.raw[key] = .number($0) }) }
}
