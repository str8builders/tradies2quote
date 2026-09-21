import Foundation
import GRDB

struct SavedDraft: Codable, Sendable, Identifiable {
    let id: String
    let accountID: String
    var quote: JSONValue
    var transcript: String
    var serverRevision: String?
    var updatedAt: Date
}

actor DraftStore {
    private let database: DatabaseQueue
    init(directory: URL? = nil) throws {
        var root = try directory ?? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appending(path: "PrivateDrafts")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
        var values = URLResourceValues(); values.isExcludedFromBackup = true; try root.setResourceValues(values)
        database = try DatabaseQueue(path: root.appending(path: "drafts.sqlite").path)
        var migrator = DatabaseMigrator()
        migrator.registerMigration("drafts-v1") { db in
            try db.create(table: "drafts") { t in
                t.column("id", .text).notNull(); t.column("account_id", .text).notNull(); t.column("payload", .blob).notNull(); t.column("updated_at", .double).notNull()
                t.primaryKey(["account_id", "id"])
            }
        }
        try migrator.migrate(database)
    }
    func save(_ draft: SavedDraft) throws {
        let data = try JSONEncoder().encode(draft)
        try database.write { db in
            try db.execute(sql: "INSERT INTO drafts (id, account_id, payload, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(account_id, id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at", arguments: [draft.id, draft.accountID, data, draft.updatedAt.timeIntervalSince1970])
        }
    }
    func list(accountID: String) throws -> [SavedDraft] {
        try database.read { db in
            try Row.fetchAll(db, sql: "SELECT payload FROM drafts WHERE account_id=? ORDER BY updated_at DESC", arguments: [accountID]).map { row in
                let data: Data = row["payload"]; return try JSONDecoder().decode(SavedDraft.self, from: data)
            }
        }
    }
    /// Save a separate, unsynced copy before replacing an editor snapshot.
    /// Failure must leave the original draft intact and stop the UI change.
    func preserveCopy(of draft: SavedDraft) throws -> SavedDraft {
        var quote = draft.quote
        quote["job_summary"] = .string((quote["job_summary"].string.nonempty ?? "Quote") + " (recovered copy)")
        let copy = SavedDraft(id: UUID().uuidString.lowercased(), accountID: draft.accountID, quote: quote, transcript: draft.transcript, serverRevision: nil, updatedAt: Date())
        try save(copy)
        return copy
    }
    func remove(id: String, accountID: String) throws {
        try database.write { db in try db.execute(sql: "DELETE FROM drafts WHERE id=? AND account_id=?", arguments: [id, accountID]) }
    }
    func clear(accountID: String) throws {
        try database.write { db in try db.execute(sql: "DELETE FROM drafts WHERE account_id=?", arguments: [accountID]) }
    }
}
