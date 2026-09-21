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
    @State private var removing: BusinessRecord?
    @State private var revoking: BusinessRecord?
    var body: some View {
        List {
            Section("Your team") {
                if team["team"].isNull {
                    TextField("Team name", text: $name)
                    Button("Create team") { Task { await action("create", fields: ["name": .string(name)]) } }.disabled(name.isEmpty || busy)
                } else {
                    if team["isOwner"].bool {
                        TextField("Team name", text: $name)
                        Button("Save team name") { Task { await action("rename", fields: ["name": .string(name)]) } }.disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
                    } else { Text(team["team"]["name"].string).font(.headline) }
                    LabeledContent("Plan", value: team["plan"].string.capitalized)
                    LabeledContent("Seats", value: String(Int(team["seats"].number)))
                }
                ForEach(team["roster"]["members"].array.map(BusinessRecord.init(raw:))) { member in
                    VStack(alignment: .leading) {
                        Text(member.raw["email"].string)
                        Text(member.raw["owner"].bool ? "Owner" : "Member").font(.caption)
                        if team["isOwner"].bool && !member.raw["owner"].bool { Button("Remove member", role: .destructive) { removing = member }.disabled(busy) }
                    }
                }
            }
            if team["isOwner"].bool {
                Section("Invite a team member") {
                    TextField("Email", text: $email).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                    Button("Create invitation") { Task { await action("invite", fields: ["email": .string(email)]) } }.disabled(email.isEmpty || busy)
                    if let shareURL { ShareLink("Share invitation", item: shareURL) }
                }
                Section("Pending invitations") {
                    ForEach(team["roster"]["invitations"].array.map(BusinessRecord.init(raw:))) { invite in
                        VStack(alignment: .leading) {
                            Text(invite.raw["email"].string)
                            Button("Revoke invitation", role: .destructive) { revoking = invite }.disabled(busy)
                        }
                    }
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
            .confirmationDialog("Remove this member?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), presenting: removing) { member in
                Button("Remove \(member.raw["email"].string)", role: .destructive) { Task { await action("remove", fields: ["user_id": member.raw["user_id"]]) } }
            } message: { _ in Text("They will lose access to the team's shared client list and plan.") }
            .confirmationDialog("Revoke this invitation?", isPresented: Binding(get: { revoking != nil }, set: { if !$0 { revoking = nil } }), presenting: revoking) { invite in
                Button("Revoke invitation", role: .destructive) { Task { await action("revoke", fields: ["id": invite.raw["id"]]); shareURL = nil } }
            }
    }
    private var invitationToken: String { URLComponents(string: invitation)?.queryItems?.first(where: { $0.name == "invite" })?.value ?? invitation.trimmingCharacters(in: .whitespacesAndNewlines) }
    private func load() async { do { team = try await state.api.request("/api/team"); name = team["team"]["name"].string; message = nil } catch { message = error.localizedDescription } }
    private func action(_ name: String, fields: [String: JSONValue] = [:]) async {
        busy = true; defer { busy = false }; var payload = fields; payload["action"] = .string(name)
        do { let result = try await state.api.request("/api/team", method: "POST", body: .object(payload)); if let link = result["link"].string.nonempty { shareURL = URL(string: link) }; await load(); if result["codeSent"].bool { message = "Check your email for the verification code." }; await state.refreshAccount() }
        catch { message = error.localizedDescription }
    }
}
