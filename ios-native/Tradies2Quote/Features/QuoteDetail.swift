import SwiftUI
import PhotosUI
import PDFKit

struct QuoteDetail: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    let id: String
    @State private var record: BusinessRecord?
    @State private var displayLines: [DisplayContent] = []
    @State private var chat: [DisplayContent] = []
    @State private var message: String?
    @State private var busy = false
    @State private var editing = false
    @State private var pdf: DocumentFile?
    @State private var confirmSend = false
    @State private var confirmDelete = false
    @State private var date = Date()
    @State private var photo: PhotosPickerItem?
    var body: some View {
        List {
            if let record {
                Section {
                    Text(record.title).font(.title2.bold())
                    Text(record.quote["client"]["name"].string)
                    LabeledContent("Status", value: record.status.replacingOccurrences(of: "_", with: " ").capitalized)
                    LabeledContent("Total") { Text(record.total, format: .currency(code: record.currency)).bold() }
                    if !record.raw["scheduled_for"].string.isEmpty { LabeledContent("Job date", value: record.raw["scheduled_for"].string) }
                }
                Section("Scope and pricing") {
                    ForEach(displayLines) { content in
                        let line = content.raw
                        VStack(alignment: .leading) {
                            Text(line["description"].string)
                            Text("\(line["quantity"].number.formatted()) \(line["unit"].string)").font(.caption).foregroundStyle(.secondary)
                            Text(line["line_total"].number, format: .currency(code: record.currency))
                        }
                    }
                }
                Section("Documents") {
                    Button("View and share PDF", systemImage: "doc.richtext") { Task { await openPDF() } }
                    if record.status == "draft" {
                        PhotosPicker(selection: $photo, matching: .images) { Label("Attach job photo", systemImage: "photo") }
                    }
                    if !record.raw["public_token"].string.isEmpty {
                        ShareLink("Share customer quote link", item: URL(string: "https://tradies2quote.com/quote/\(record.raw["public_token"].string)")!)
                    }
                    Button("Email quote", systemImage: "envelope") { confirmSend = true }
                        .disabled(record.quote["client"]["email"].string.isEmpty || busy)
                }
                Section("Next step") {
                    if ["draft", "sent", "viewed", "declined"].contains(record.status) { Button("Edit quote") { editing = true } }
                    if ["sent", "viewed"].contains(record.status) {
                        Button("Mark accepted") { Task { await action("accept") } }
                        Button("Mark declined") { Task { await action("decline") } }
                    }
                    if ["accepted", "scheduled"].contains(record.status) {
                        DatePicker("Job date", selection: $date, displayedComponents: .date)
                        Button("Schedule job") { Task { await action("schedule", body: .object(["date": .string(LocalDay.string(date))])) } }
                    }
                    if record.status == "scheduled" { Button("Start job") { Task { await action("start") } } }
                    if record.status == "in_progress" { Button("Complete job") { Task { await action("complete") } } }
                    if record.status == "completed" { Button("Create invoice") { Task { await action("invoice") } } }
                    Button(record.raw["archived_at"].isNull ? "Archive quote" : "Restore quote") { Task { await action(record.raw["archived_at"].isNull ? "archive" : "restore") } }
                    Button("Delete quote", role: .destructive) { confirmDelete = true }
                }.disabled(busy)
                if !record.quote["chat_history"].array.isEmpty {
                    Section("Customer conversation") {
                        ForEach(chat) { content in
                            let item = content.raw
                            VStack(alignment: .leading) { Text(item["role"].string.capitalized).font(.caption.bold()); Text(item["content"].string) }
                        }
                    }
                }
            } else if message == nil { ProgressView("Loading quote…") }
            if busy { ProgressView() }
            if let message { ErrorNotice(message: message) { Task { await load() } } }
        }.navigationTitle("Quote").navigationBarTitleDisplayMode(.inline)
            .task { await load() }.refreshable { await load() }
            .sheet(isPresented: $editing, onDismiss: { Task { await load() } }) { if let record { NavigationStack { QuoteEditor(ownerID: state.accountID ?? "", record: record) } } }
            .sheet(item: $pdf) { PDFPreview(file: $0) }
            .confirmationDialog("Email this quote?", isPresented: $confirmSend, titleVisibility: .visible) {
                Button("I checked the quote — send email") { Task { await send() } }
            } message: { Text("The quote will be sent to \(record?.quote["client"]["email"].string ?? "the client"). Check quantities, prices and any required dimensions first.") }
            .confirmationDialog("Delete this quote?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete quote", role: .destructive) { Task { await action("delete") } }
            }
            .onChange(of: photo) { Task { await uploadPhoto() } }
    }
    private func load() async {
        do { record = BusinessRecord(raw: try await state.api.request("/api/mobile/v1/quotes/\(id)")["item"]); displayLines = DisplayContent.update(record?.quote["line_items"].array ?? [], preserving: displayLines); chat = DisplayContent.update(record?.quote["chat_history"].array ?? [], preserving: chat); message = nil }
        catch { message = error.localizedDescription }
    }
    private func action(_ name: String, body: JSONValue = .object([:])) async {
        busy = true; defer { busy = false }
        do { _ = try await state.api.request("/api/mobile/v1/quotes/\(id)/\(name)", method: "POST", body: body); if name == "delete" { state.refreshID = UUID(); dismiss(); return }; await load(); state.refreshID = UUID(); if name == "invoice" { message = "Invoice created. Open Invoices to review it." } }
        catch { message = error.localizedDescription }
    }
    private func send() async {
        busy = true; defer { busy = false }
        do { _ = try await state.api.request("/api/quotes/\(id)/send", method: "POST", body: .object(["acknowledged": .bool(true)])); await load(); message = "Email sent." }
        catch { message = error.localizedDescription }
    }
    private func openPDF() async {
        busy = true; defer { busy = false }
        do { pdf = try DocumentFile(data: await state.api.data("/api/quotes/\(id)/pdf"), name: "Quote-\(id.prefix(8)).pdf") }
        catch { message = error.localizedDescription }
    }
    private func uploadPhoto() async {
        guard let photo else { return }; busy = true; defer { busy = false; self.photo = nil }
        do {
            guard let bytes = try await photo.loadTransferable(type: Data.self), bytes.count <= 20_000_000 else { throw ServiceError(status: 0, message: "Choose a photo smaller than 20 MB.") }
            _ = try await state.api.upload("/api/quotes/\(id)/photos", field: "photo", filename: "job-photo.jpg", contentType: "image/jpeg", bytes: PreparedImage.jpeg(bytes))
            message = "Photo attached."
        } catch { message = error.localizedDescription }
    }
}

struct DocumentFile: Identifiable {
    let id = UUID()
    let url: URL
    init(data: Data, name: String) throws {
        guard PDFDocument(data: data) != nil else { throw ServiceError(status: 0, message: "The document could not be opened. Please retry.") }
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
        url = directory.appending(path: name)
        try data.write(to: url, options: [.atomic, .completeFileProtection])
    }
}
struct PDFPreview: View {
    @Environment(\.dismiss) private var dismiss
    let file: DocumentFile
    var body: some View {
        NavigationStack {
            PDFCanvas(url: file.url).navigationTitle("Document").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }; ToolbarItem(placement: .primaryAction) { ShareLink(item: file.url) } }
        }.onDisappear { try? FileManager.default.removeItem(at: file.url.deletingLastPathComponent()) }
    }
}
struct PDFCanvas: UIViewRepresentable {
    let url: URL
    func makeUIView(context: Context) -> PDFView { let view = PDFView(); view.autoScales = true; view.document = PDFDocument(url: url); return view }
    func updateUIView(_ uiView: PDFView, context: Context) { if uiView.document?.documentURL != url { uiView.document = PDFDocument(url: url) } }
}

struct InvoiceDetail: View {
    @Environment(AppState.self) private var state
    @State private var record: BusinessRecord
    init(record: BusinessRecord) { _record = State(initialValue: record) }
    @State private var message: String?
    @State private var pdf: DocumentFile?
    @State private var confirmSend = false
    @State private var confirmPaid = false
    @State private var busy = false
    var body: some View {
        List {
            Section {
                Text(record.raw["invoice_number"].string).font(.title2.bold())
                Text(record.raw["invoice_data"]["client"]["name"].string)
                LabeledContent("Status", value: record.status.capitalized)
                LabeledContent("Total") { Text(record.total, format: .currency(code: record.currency)) }
                LabeledContent("Due", value: record.raw["due_date"].string)
            }
            Section {
                Button("View and share PDF") { Task { await perform("pdf") } }
                Button("Email invoice") { confirmSend = true }
                if !["paid", "cancelled"].contains(record.status) { Button("Mark paid") { confirmPaid = true } }
                NavigationLink("View original quote") { QuoteDetail(id: record.raw["quote_id"].string) }
            }.disabled(busy)
            if busy { ProgressView() }
            if let message { ErrorNotice(message: message) }
        }.navigationTitle("Invoice").sheet(item: $pdf) { PDFPreview(file: $0) }
            .confirmationDialog("Send invoice email?", isPresented: $confirmSend, titleVisibility: .visible) { Button("Send to \(record.raw["invoice_data"]["client"]["email"].string)") { Task { await perform("send") } } }
            .confirmationDialog("Have you received payment?", isPresented: $confirmPaid, titleVisibility: .visible) { Button("Yes, mark paid") { Task { await perform("paid") } } }
    }
    private func perform(_ action: String) async {
        busy = true; defer { busy = false }
        do {
            if action == "pdf" { pdf = try DocumentFile(data: await state.api.data("/api/invoices/\(record.id)/pdf"), name: "Invoice-\(record.id.prefix(8)).pdf") }
            else {
                let path = action == "paid" ? "/api/mobile/v1/invoices/\(record.id)/paid" : "/api/invoices/\(record.id)/send"
                _ = try await state.api.request(path, method: "POST", body: .object([:])); message = action == "paid" ? "Invoice marked paid." : "Invoice email sent."; state.refreshID = UUID(); record = BusinessRecord(raw: try await state.api.request("/api/mobile/v1/invoices/\(record.id)")["item"])
            }
        } catch { message = error.localizedDescription }
    }
}
