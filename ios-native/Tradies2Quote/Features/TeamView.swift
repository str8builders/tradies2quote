import SwiftUI

struct TeamView: View {
    @Environment(AppState.self) private var state
    @State private var team: JSONValue = .null
    @State private var name = ""
    @State private var email = ""
    @State private var invitation = ""
    @State private var code = ""
    @State private var shareURL: URL?
    @State private var message: String?
    @State private var busy = false
    @State private var confirmLeave = false
    var body: some View {
        List {
            Section("Your team") {
                if team["team"].isNull {
                    TextField("Team name", text: $name)
                    Button("Create team") { Task { await action("create", fields: ["name": .string(name)]) } }.disabled(name.isEmpty || busy)
                } else {
                    Text(team["team"]["name"].string).font(.headline)
                    LabeledContent("Plan", value: team["plan"].string.capitalized)
                    LabeledContent("Seats", value: String(Int(team["seats"].number)))
                }
                ForEach(team["roster"]["members"].array.map(BusinessRecord.init(raw:))) { member in
                    VStack(alignment: .leading) { Text(member.raw["email"].string); Text(member.raw["role"].string).font(.caption) }
                }
            }
            if team["isOwner"].bool {
                Section("Invite a team member") {
                    TextField("Email", text: $email).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                    Button("Create invitation") { Task { await action("invite", fields: ["email": .string(email)]) } }.disabled(email.isEmpty || busy)
                    if let shareURL { ShareLink("Share invitation", item: shareURL) }
                }
            }
            Section("Join an existing team") {
                TextField("Paste invitation link", text: $invitation).keyboardType(.URL).textInputAutocapitalization(.never)
                Button("Email me a verification code") { Task { await action("verify", fields: ["token": .string(invitationToken)]) } }.disabled(invitationToken.isEmpty || busy)
                TextField("8-digit email code", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode)
                Button("Join team") { Task { await action("accept", fields: ["token": .string(invitationToken), "code": .string(code)]) } }.disabled(code.count != 8 || busy)
            }
            if !team["team"].isNull && !team["isOwner"].bool { Button("Leave team", role: .destructive) { confirmLeave = true } }
            if busy { ProgressView() }
            if let message { ErrorNotice(message: message) }
        }.navigationTitle("Team").task { await load() }.refreshable { await load() }
            .confirmationDialog("Leave this team?", isPresented: $confirmLeave, titleVisibility: .visible) { Button("Leave team", role: .destructive) { Task { await action("leave") } } }
    }
    private var invitationToken: String { URLComponents(string: invitation)?.queryItems?.first(where: { $0.name == "invite" })?.value ?? invitation.trimmingCharacters(in: .whitespacesAndNewlines) }
    private func load() async { do { team = try await state.api.request("/api/team"); message = nil } catch { message = error.localizedDescription } }
    private func action(_ name: String, fields: [String: JSONValue] = [:]) async {
        busy = true; defer { busy = false }; var payload = fields; payload["action"] = .string(name)
        do { let result = try await state.api.request("/api/team", method: "POST", body: .object(payload)); if let link = result["link"].string.nonempty { shareURL = URL(string: link) }; await load(); if result["codeSent"].bool { message = "Check your email for the verification code." }; await state.refreshAccount() }
        catch { message = error.localizedDescription }
    }
}
