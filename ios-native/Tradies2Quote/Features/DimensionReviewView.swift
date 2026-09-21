import SwiftUI

struct DimensionReviewView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    let record: BusinessRecord
    @State private var dimensions: [EditableDimension]
    @State private var acknowledged = false
    @State private var busy = false
    @State private var message: String?

    private struct EditableDimension: Identifiable {
        let id: String
        let label: String
        let unit: String
        var value: Double
    }
    init(record: BusinessRecord) {
        self.record = record
        _dimensions = State(initialValue: record.quote["dimension_confirmation"]["dimensions"].array.map {
            EditableDimension(id: $0["key"].string, label: $0["label"].string, unit: $0["unit"].string, value: $0["value"].number)
        })
    }
    var body: some View {
        Form {
            Section {
                Text("Check these measurements against the site or verified drawing. Changing a measurement updates the calculated quantities. Review the resulting quote before sending it.")
            }
            Section("Measurements") {
                ForEach($dimensions) { $dimension in
                    VStack(alignment: .leading) {
                        Text("\(dimension.label) (\(dimension.unit))")
                        TextField(dimension.label, value: $dimension.value, format: .number)
                            .keyboardType(.decimalPad).accessibilityIdentifier("dimension.\(dimension.id)")
                    }
                }
            }
            Section {
                Toggle("I checked every measurement", isOn: $acknowledged)
                Button("Confirm measurements") { Task { await save() } }
                    .disabled(!acknowledged || dimensions.isEmpty || dimensions.contains { !$0.value.isFinite || $0.value <= 0 || $0.value > 1e6 })
            }
            if busy { ProgressView("Saving measurements…") }
            if let message { ErrorNotice(message: message) }
        }.disabled(busy).navigationTitle("Check dimensions").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) } }
            .interactiveDismissDisabled(busy)
    }
    private func save() async {
        busy = true; defer { busy = false }
        do {
            _ = try await state.api.request("/api/mobile/v1/quotes/\(record.id)/dimensions", method: "POST", body: .object([
                "expectedRevision": record.raw["revision"],
                "edits": .array(dimensions.map { .object(["key": .string($0.id), "value": .number($0.value)]) })
            ]))
            state.refreshID = UUID(); dismiss()
        } catch { message = error.localizedDescription }
    }
}
