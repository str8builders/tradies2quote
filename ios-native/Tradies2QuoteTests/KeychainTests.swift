import XCTest
import Supabase
import Security

final class KeychainTests: XCTestCase {
    func testSessionStorageRoundTrip() throws {
        let store = KeychainLocalStorage(service: "com.str8builders.tradies2quote.storage-test")
        let key = UUID().uuidString
        defer { try? store.remove(key: key) }
        let value = Data("synthetic test data".utf8)
        try store.store(key: key, value: value)
        XCTAssertEqual(try store.retrieve(key: key), value)
        try store.remove(key: key)
        // The pinned SDK throws for a missing item despite its optional return.
        // Verify deletion against Keychain directly, without matching error text.
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                   kSecAttrService as String: "com.str8builders.tradies2quote.storage-test",
                                   kSecAttrAccount as String: key]
        XCTAssertEqual(SecItemCopyMatching(query as CFDictionary, nil), errSecItemNotFound)
    }
}
