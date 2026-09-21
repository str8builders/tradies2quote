import SwiftUI
import PhotosUI

struct QuoteAttachmentsView: View {
    @Environment(AppState.self) private var state
    let quoteID: String
    @State private var photos: [BusinessRecord] = []
    @State private var canEdit = false
    @State private var enabled = false
    @State private var loaded = false
    @State private var selected: PhotosPickerItem?
    @State private var removing: BusinessRecord?
    @State private var message: String?
    @State private var busy = false
    var body: some View {
        List {
            if !loaded { ProgressView("Loading photos…") }
            ForEach(photos) { photo in
                VStack(alignment: .leading) {
                    PrivateQuotePhoto(path: "/api/quotes/\(quoteID)/photos?photo=\(photo.id)")
                    Text(photo.raw["name"].string).font(.caption)
                    if canEdit { Button("Remove photo", role: .destructive) { removing = photo }.disabled(busy) }
                }
            }
            if loaded && photos.isEmpty { Text("No job photos attached.").foregroundStyle(.secondary) }
            if canEdit {
                PhotosPicker(selection: $selected, matching: .images) { Label("Attach job photo", systemImage: "photo.badge.plus") }.disabled(busy || photos.count >= 8)
                Text("Up to 8 photos per quote.").font(.footnote).foregroundStyle(.secondary)
            } else if loaded && !enabled {
                Text("An active Crew or Builder plan lets you attach photos to draft quotes.").font(.footnote)
            }
            if busy { ProgressView() }
            if let message { ErrorNotice(message: message) { Task { await load() } } }
        }.navigationTitle("Job photos").task { await load() }.refreshable { await load() }
            .onChange(of: selected) { Task { await upload() } }
            .confirmationDialog("Remove this photo from the quote?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), presenting: removing) { photo in
                Button("Remove photo", role: .destructive) { Task { await remove(photo) } }
            }
    }
    private func load() async {
        do {
            let result = try await state.api.request("/api/quotes/\(quoteID)/photos")
            photos = result["photos"].array.map(BusinessRecord.init(raw:)); canEdit = result["canEdit"].bool; enabled = result["enabled"].bool; loaded = true; message = nil
        } catch { loaded = true; message = error.localizedDescription }
    }
    private func upload() async {
        guard let selected else { return }; busy = true; defer { busy = false; self.selected = nil }
        do {
            guard let bytes = try await selected.loadTransferable(type: Data.self), bytes.count <= 20_000_000 else { throw ServiceError(status: 0, message: "Choose a photo smaller than 20 MB.") }
            _ = try await state.api.upload("/api/quotes/\(quoteID)/photos", field: "photo", filename: "job-photo.jpg", contentType: "image/jpeg", bytes: PreparedImage.jpeg(bytes))
            await load()
        } catch { message = error.localizedDescription }
    }
    private func remove(_ photo: BusinessRecord) async {
        busy = true; defer { busy = false; removing = nil }
        do { _ = try await state.api.request("/api/quotes/\(quoteID)/photos", method: "DELETE", body: .object(["id": .string(photo.id)])); await load() }
        catch { message = error.localizedDescription }
    }
}

private struct PrivateQuotePhoto: View {
    @Environment(AppState.self) private var state
    let path: String
    @State private var image: UIImage?
    @State private var message: String?
    var body: some View {
        Group {
            if let image { Image(uiImage: image).resizable().scaledToFit().accessibilityLabel("Attached job photo") }
            else if let message { ErrorNotice(message: message) { Task { await load() } } }
            else { ProgressView("Loading photo…") }
        }.task(id: path) { await load() }
    }
    private func load() async {
        do {
            let bytes = try await state.api.data(path)
            try Task.checkCancellation()
            guard let decoded = UIImage(data: bytes) else { throw ServiceError(status: 0, message: "This photo could not be opened.") }
            image = decoded; message = nil
        } catch is CancellationError { }
        catch { message = error.localizedDescription }
    }
}
