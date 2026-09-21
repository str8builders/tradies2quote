import SwiftUI
import CoreLocation
import Observation

struct RequestDetail: View {
    @Environment(AppState.self) private var state
    @State private var record: BusinessRecord
    init(record: BusinessRecord) { _record = State(initialValue: record) }
    @State private var message: String?
    @State private var busy = false
    var body: some View {
        List {
            Section("Customer request") {
                Text(record.raw["client_name"].string).font(.headline)
                Text(record.raw["description"].string)
                Text(record.raw["site_address"].string)
                Text(record.raw["client_email"].string).textSelection(.enabled)
                Text(record.raw["client_phone"].string).textSelection(.enabled)
                LabeledContent("Status", value: record.status.replacingOccurrences(of: "_", with: " "))
                if !record.raw["error_message"].string.isEmpty { Text(record.raw["error_message"].string).foregroundStyle(.secondary) }
            }
            if !record.raw["quote_id"].string.isEmpty { NavigationLink("Open quote") { QuoteDetail(id: record.raw["quote_id"].string) } }
            Button(record.status == "dismissed" ? "Restore request" : "Dismiss request") { Task {
                busy = true; defer { busy = false }
                do { _ = try await state.api.request("/api/mobile/v1/requests/\(record.id)", method: "PATCH", body: .object(["dismissed": .bool(record.status != "dismissed")])); record = BusinessRecord(raw: try await state.api.request("/api/mobile/v1/requests/\(record.id)")["item"]); message = "Request updated."; state.refreshID = UUID() } catch { message = error.localizedDescription }
            } }.disabled(busy)
            if let message { ErrorNotice(message: message) }
        }.navigationTitle("Request")
    }
}

struct RequestLinkView: View {
    @Environment(AppState.self) private var state
    @State private var image: UIImage?
    @State private var message: String?
    @State private var busy = false
    @State private var rotate = false
    var body: some View {
        List {
            Section {
                Text("Let customers describe their job using your own request link. Requests appear in your account for review.")
                if let image { Image(uiImage: image).resizable().interpolation(.none).scaledToFit().frame(maxWidth: 300).accessibilityLabel("QR code for your quote request form") }
                if let slug = state.profile["request_slug"].string.nonempty, let url = URL(string: "https://tradies2quote.com/r/\(slug)") {
                    ShareLink("Share request link", item: url)
                    Link("Preview customer form", destination: url)
                    Button("Replace link") { rotate = true }
                    Button("Turn off request link") { Task { await update("disable") } }
                } else { Button("Enable request link") { Task { await update("enable") } } }
            }.disabled(busy)
            if busy { ProgressView() }
            if let message { ErrorNotice(message: message) }
        }.navigationTitle("Request link").task { await load() }
            .confirmationDialog("Replace your link?", isPresented: $rotate, titleVisibility: .visible) { Button("Replace link") { Task { await update("rotate") } } } message: { Text("Your old link and printed QR codes will stop working.") }
    }
    private func load() async {
        await state.refreshAccount(); image = nil
        guard !state.profile["request_slug"].string.isEmpty else { return }
        do { image = UIImage(data: try await state.api.data("/api/account/request-qr?format=png&size=1024")); message = nil } catch { message = error.localizedDescription }
    }
    private func update(_ action: String) async { busy = true; defer { busy = false }; do { _ = try await state.api.request("/api/mobile/v1/request-link", method: "POST", body: .object(["action": .string(action)])); await load() } catch { message = error.localizedDescription } }
}

struct ScheduleView: View {
    @Environment(AppState.self) private var state
    @State private var date = Date()
    @State private var jobs: [BusinessRecord] = []
    @State private var notes: [BusinessRecord] = []
    @State private var note = ""
    @State private var message: String?
    @State private var busy = false
    private var day: String { LocalDay.string(date) }
    var body: some View {
        List {
            DatePicker("Select date", selection: $date, displayedComponents: .date).datePickerStyle(.graphical)
            Section("Scheduled work") {
                ForEach(jobs.filter { $0.raw["scheduled_for"].string.prefix(10) == day }) { job in NavigationLink { QuoteDetail(id: job.id) } label: { RecordRow(record: job, kind: .quotes) } }
            }
            Section("Day notes") {
                ForEach(notes.filter { $0.raw["note_date"].string == day }) { item in
                    Text(item.raw["body"].string).swipeActions { Button("Delete", role: .destructive) { Task { await remove(item.id) } } }
                }
                TextField("Add a note", text: $note, axis: .vertical)
                Button("Save note") { Task { await saveNote() } }.disabled(busy || note.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            NavigationLink { WeatherView() } label: { Label("Check local weather", systemImage: "cloud.sun") }
            if let message { ErrorNotice(message: message) { Task { await load() } } }
        }.navigationTitle("Schedule").task { await load() }.refreshable { await load() }
    }
    private func load() async { do { async let jobRows = state.api.collection("quotes"); async let noteRows = state.api.collection("notes"); jobs = try await jobRows; notes = try await noteRows; message = nil } catch { message = error.localizedDescription } }
    private func saveNote() async { busy = true; defer { busy = false }; do { _ = try await state.api.request("/api/mobile/v1/notes", method: "POST", body: .object(["date": .string(day), "body": .string(note)])); note = ""; await load() } catch { message = error.localizedDescription } }
    private func remove(_ id: String) async { do { _ = try await state.api.request("/api/mobile/v1/notes/\(id)", method: "DELETE", body: .object([:])); await load() } catch { message = error.localizedDescription } }
}

@MainActor final class LocationReader: NSObject, @preconcurrency CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var timeout: Task<Void, Never>?
    private var pending: CheckedContinuation<CLLocationCoordinate2D, any Error>?
    override init() { super.init(); manager.delegate = self; manager.desiredAccuracy = kCLLocationAccuracyKilometer }
    func coordinate() async throws -> CLLocationCoordinate2D {
        guard pending == nil else { throw ServiceError(status: 0, message: "Location is already being requested.") }
        return try await withCheckedThrowingContinuation { continuation in
            pending = continuation
            timeout = Task { try? await Task.sleep(for: .seconds(30)); if !Task.isCancelled { finish(.failure(ServiceError(status: 0, message: "Location timed out. Please try again outside."))) } }
            switch manager.authorizationStatus {
            case .notDetermined: manager.requestWhenInUseAuthorization()
            case .authorizedWhenInUse, .authorizedAlways: manager.requestLocation()
            default: finish(.failure(ServiceError(status: 0, message: "Location access is off. Enable it in iPhone Settings to check local weather.")))
            }
        }
    }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard pending != nil else { return }
        if manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways { manager.requestLocation() }
        else if manager.authorizationStatus != .notDetermined { finish(.failure(ServiceError(status: 0, message: "Location permission was not granted."))) }
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) { if let location = locations.last { finish(.success(location.coordinate)) } }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: any Error) { finish(.failure(error)) }
    private func finish(_ result: Result<CLLocationCoordinate2D, any Error>) { timeout?.cancel(); timeout = nil; let continuation = pending; pending = nil; continuation?.resume(with: result) }
}

struct WeatherView: View {
    @Environment(AppState.self) private var state
    @State private var reader = LocationReader()
    @State private var weather: JSONValue = .null
    @State private var message: String?
    @State private var busy = false
    var body: some View {
        List {
            Section {
                Text("Use your location to check nearby conditions. Coordinates are rounded before fetching a forecast.")
                Button("Use my location", systemImage: "location") { Task { await load() } }.disabled(busy)
                if busy { ProgressView("Checking conditions…") }
            }
            if !weather.isNull {
                Section("Current conditions") {
                    Text(weather["current"]["summary"].string)
                    LabeledContent("Temperature", value: measurement("temperatureC", unit: "°C"))
                    LabeledContent("Wind gusts", value: measurement("windGustKph", unit: " km/h"))
                    LabeledContent("Rain probability", value: measurement("rainProbabilityPct", unit: "%"))
                }
                Section("Trade outlook") {
                    ForEach(weather["trades"].array.map(BusinessRecord.init(raw:))) { trade in
                        VStack(alignment: .leading) { Text(trade.raw["label"].string).bold(); Text(trade.raw["status"].string.capitalized); Text(trade.raw["reason"].string).font(.footnote) }
                    }
                }
                Text("Forecast guidance is not a site safety assessment. Check conditions before starting work.").font(.footnote).foregroundStyle(.secondary)
            }
            if let message { ErrorNotice(message: message) }
        }.navigationTitle("Weather")
    }
    private func measurement(_ key: String, unit: String) -> String { let value = weather["current"][key]; return value.isNull ? "Unavailable" : value.number.formatted() + unit }
    private func load() async {
        busy = true; defer { busy = false }
        do { let coordinate = try await reader.coordinate(); weather = try await state.api.request("/api/weather/here?lat=\(coordinate.latitude)&lng=\(coordinate.longitude)"); message = nil }
        catch { message = error.localizedDescription }
    }
}

enum LocalDay {
    static func string(_ date: Date) -> String { let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"; return formatter.string(from: date) }
}
