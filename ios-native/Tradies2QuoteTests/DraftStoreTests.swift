import XCTest
@testable import Tradies2Quote

final class DraftStoreTests: XCTestCase {
    func testConflictCopySurvivesOriginalReplacementAndRetainsProvenance() async throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try DraftStore(directory: directory)
        let quote: JSONValue = .object(["job_summary": .string("Deck"), "takeoff_inputs": .object(["width": .number(3)]), "line_items": .array([.object(["t2qcal_source_key": .string("original-calculation")])])])
        let draft = SavedDraft(id: "existing-quote", accountID: "alice", quote: quote, transcript: "My unsynced edits", serverRevision: "old-revision", updatedAt: Date())
        try await store.save(draft)
        let copy = try await store.preserveCopy(of: draft)
        XCTAssertNotEqual(copy.id, draft.id); XCTAssertNil(copy.serverRevision)
        try await store.remove(id: draft.id, accountID: "alice")
        let recovered = try await store.list(accountID: "alice")
        XCTAssertEqual(recovered.count, 1)
        XCTAssertEqual(recovered[0].quote["takeoff_inputs"], quote["takeoff_inputs"])
        XCTAssertEqual(recovered[0].quote["line_items"], quote["line_items"])
        XCTAssertEqual(recovered[0].transcript, "My unsynced edits")
        let otherAccount = try await store.list(accountID: "bob"); XCTAssertTrue(otherAccount.isEmpty)
    }
    func testDraftRecoveryAndAccountIsolation() async throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let first = try DraftStore(directory: directory)
        let draft = SavedDraft(id: "operation-1", accountID: "alice", quote: .object(["future": .bool(true)]), transcript: "Build a deck", serverRevision: nil, updatedAt: Date())
        try await first.save(draft)
        let reopened = try DraftStore(directory: directory)
        let bob = try await reopened.list(accountID: "bob")
        XCTAssertTrue(bob.isEmpty)
        let alice = try await reopened.list(accountID: "alice")
        XCTAssertEqual(alice.first?.transcript, "Build a deck")
        try await reopened.clear(accountID: "bob")
        let preserved = try await reopened.list(accountID: "alice")
        XCTAssertEqual(preserved.count, 1)
        try await reopened.remove(id: "operation-1", accountID: "alice")
        let removed = try await reopened.list(accountID: "alice")
        XCTAssertTrue(removed.isEmpty)
    }
}
