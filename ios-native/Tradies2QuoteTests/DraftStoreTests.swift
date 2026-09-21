import XCTest
@testable import Tradies2Quote

final class DraftStoreTests: XCTestCase {
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
