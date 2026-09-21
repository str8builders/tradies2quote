import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import ImageIO
import VisionKit

struct SupplierScanView: View {
    @Environment(AppState.self) private var state
    @State private var photo: PhotosPickerItem?
    @State private var filePicker = false
    @State private var camera = false
    @State private var consentSheet = false
    @State private var extraction: JSONValue = .null
    @State private var rows: [EditableLine] = []
    @State private var taxMode = "unknown"
    @State private var reviewed = false
    @State private var busy = false
    @State private var message: String?
    @State private var createdID: String?
    @State private var operationID = UUID().uuidString.lowercased()
    var body: some View {
        Form {
            Section("Read a supplier quote") {
                Text("Choose one supplier document with up to eight pages. Review the extracted quantities, units, tax treatment and prices before saving anything.")
                if state.consented {
                    PhotosPicker(selection: $photo, matching: .images) { Label("Choose photo", systemImage: "photo") }.disabled(busy)
                    if VNDocumentCameraViewController.isSupported { Button("Scan document", systemImage: "camera") { camera = true }.disabled(busy) }
                    Button("Choose image or PDF", systemImage: "folder") { filePicker = true }.disabled(busy)
                } else { Button("Review AI permission") { consentSheet = true } }
            }
            if !extraction.isNull {
                Section("Review extraction") {
                    TextField("Supplier", text: Binding(get: { extraction["supplier"].string }, set: { extraction["supplier"] = .string($0) }))
                    Text("Result: \(extraction["extraction_status"].string.replacingOccurrences(of: "_", with: " "))")
                    Text(extraction["extraction_reasons"].array.map(\.string).joined(separator: "\n")).font(.footnote)
                    Picker("Printed prices", selection: $taxMode) { Text("Choose tax treatment").tag("unknown"); Text("Exclude GST").tag("exclusive"); Text("Include 15% GST").tag("inclusive") }
                    ForEach($rows) { $row in
                        VStack(alignment: .leading) {
                            TextField("Product name", text: Binding(get: { row.raw["name"].string }, set: { row.raw["name"] = .string($0) }))
                            TextField("Unit", text: Binding(get: { row.raw["unit"].string }, set: { row.raw["unit"] = .string($0) }))
                            TextField("Printed quantity", value: Binding(get: { row.raw["quantity"].number }, set: { row.raw["quantity"] = .number($0) }), format: .number).keyboardType(.decimalPad)
                            TextField("Printed unit price", value: Binding(get: { row.raw["price"].number }, set: { row.raw["price"] = .number($0) }), format: .number).keyboardType(.decimalPad)
                            if row.raw["price"].isNull { Text("Price missing — enter it from the document.").foregroundStyle(.red) }
                        }
                    }
                    Toggle("I checked every line and the tax treatment", isOn: $reviewed)
                    Button("Save to material library") { Task { await saveLibrary() } }.disabled(!ready)
                    Button("Create draft quote") { Task { await createQuote() } }.disabled(!ready || extraction["extraction_status"].string == "blocked")
                }
            }
            if busy { ProgressView("Reading document…") }
            if let message { ErrorNotice(message: message) }
        }.navigationTitle("Supplier scan").sheet(isPresented: $consentSheet) { AIConsentView() }
            .onChange(of: photo) { Task { if let data = try? await photo?.loadTransferable(type: Data.self) { await scan(data) } } }
            .sheet(isPresented: $camera) { DocumentCapture(completed: { pages in Task { await scan(pages) } }, failed: { message = $0 }) }
            .fileImporter(isPresented: $filePicker, allowedContentTypes: [.image, .pdf]) { result in
                Task { do { let url = try result.get(); let granted = url.startAccessingSecurityScopedResource(); defer { if granted { url.stopAccessingSecurityScopedResource() } }; let data = try Data(contentsOf: url); if url.pathExtension.lowercased() == "pdf" { await scan(try PreparedDocument.pdfPages(data)) } else { await scan(data) } } catch { message = error.localizedDescription } }
            }
            .navigationDestination(item: $createdID) { id in QuoteDetail(id: id) }
    }
    private var ready: Bool { reviewed && !busy && taxMode != "unknown" && !rows.isEmpty && rows.allSatisfy { !$0.raw["price"].isNull && !$0.raw["name"].string.isEmpty && $0.raw["price"].number >= 0 } }
    private func scan(_ data: Data) async {
        do { await scan([try PreparedImage.jpeg(data)]) } catch { message = error.localizedDescription }
    }
    private func scan(_ pages: [Data]) async {
        busy = true; defer { busy = false }; reviewed = false; message = nil
        do {
            guard !pages.isEmpty, pages.count <= 8, pages.reduce(0, { $0 + $1.count }) <= 20_000_000 else { throw ServiceError(status: 0, message: "Choose up to eight pages totalling less than 20 MB.") }
            extraction = try await state.api.upload("/api/materials/extract-quote", parts: pages.enumerated().map { (field: "image", filename: "page-\($0.offset + 1).jpg", contentType: "image/jpeg", bytes: $0.element) })
            rows = extraction["items"].array.map { EditableLine(raw: $0) }
            taxMode = extraction["gst_inclusive"].isNull ? "unknown" : extraction["gst_inclusive"].bool ? "inclusive" : "exclusive"
            operationID = UUID().uuidString.lowercased()
        } catch { message = error.localizedDescription }
    }
    private func saveLibrary() async {
        busy = true; defer { busy = false }
        let values = rows.map { row -> JSONValue in
            .object(["name": row.raw["name"], "unit": row.raw["unit"], "default_unit_price": .number(QuoteMath.cents(row.raw["price"].number / (taxMode == "inclusive" ? 1.15 : 1))), "sku": row.raw["sku"], "notes": row.raw["raw_text"]])
        }
        do { let result = try await state.api.request("/api/mobile/v1/materials/import-supplier", method: "POST", body: .object(["rows": .array(values), "meta": extraction["supplier"]])); message = "Saved \(Int(result["inserted"].number)) new and updated \(Int(result["updated"].number)) materials. \(Int(result["failed"].number)) failed."; state.refreshID = UUID() }
        catch { message = error.localizedDescription }
    }
    private func createQuote() async {
        busy = true; defer { busy = false }
        let meta: JSONValue = .object(["supplier": extraction["supplier"], "gstInclusive": .bool(taxMode == "inclusive"), "subtotal": extraction["subtotal"], "gst": extraction["gst"], "total": extraction["total"], "extractionStatus": extraction["extraction_status"], "extractionReasons": extraction["extraction_reasons"], "rowFailures": extraction["row_failures"], "extractionAttempts": extraction["attempts"], "idempotencyKey": .string(operationID)])
        do { let result = try await state.api.request("/api/mobile/v1/materials/scan-quote", method: "POST", body: .object(["lines": .array(rows.map(\.raw)), "meta": meta])); createdID = result["id"].string.nonempty; state.refreshID = UUID() }
        catch { message = error.localizedDescription }
    }
}

enum PreparedImage {
    static func jpeg(_ data: Data) throws -> Data {
        guard data.count <= 25_000_000, let source = CGImageSourceCreateWithData(data as CFData, nil), let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 2600, kCGImageSourceCreateThumbnailWithTransform: true] as CFDictionary), let bytes = UIImage(cgImage: image).jpegData(compressionQuality: 0.9) else { throw ServiceError(status: 0, message: "Choose a readable image smaller than 25 MB.") }
        return bytes
    }
}
