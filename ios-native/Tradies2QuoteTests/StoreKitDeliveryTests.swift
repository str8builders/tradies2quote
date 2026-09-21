import XCTest
import StoreKit
import StoreKitTest
@testable import Tradies2Quote

final class StoreKitDeliveryTests: XCTestCase {
    private func session() throws -> SKTestSession {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "LocalSubscriptions", withExtension: "storekit"))
        let session = try SKTestSession(contentsOf: url)
        session.resetToDefaultState(); session.clearTransactions(); session.disableDialogs = true
        return session
    }
    private func api(status: Int) -> MobileAPI {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [PurchaseFixtureProtocol.self]
        configuration.httpAdditionalHeaders = ["X-Test-Response": String(status)]
        return MobileAPI(baseURL: URL(string: "https://purchase-test.invalid")!, token: { "synthetic-test-token" }, session: URLSession(configuration: configuration))
    }
    func testLocalPurchaseIsRetriedUntilBackendAcceptanceAndCannotMoveAccounts() async throws {
        let session = try session(); defer { session.clearTransactions(); session.resetToDefaultState() }
        let owner = UUID()
        let products = try await Product.products(for: ["test.tradies2quote.solo.monthly"])
        let product = try XCTUnwrap(products.first)
        XCTAssertEqual(product.type, .autoRenewable)
        XCTAssertEqual(product.subscription?.subscriptionPeriod.unit, .month)
        let purchase = try await product.purchase(options: [.appAccountToken(owner)])
        guard case .success(let result) = purchase, case .verified(let transaction) = result else { return XCTFail("Local StoreKit purchase did not verify") }
        XCTAssertEqual(transaction.appAccountToken, owner)
        for (account, status, expectedError) in [(UUID().uuidString, 200, 409), (owner.uuidString, 503, 503)] {
            do { try await PurchaseDelivery.deliver(transaction, signedTransaction: result.jwsRepresentation, accountID: account, api: api(status: status)); XCTFail("Rejected delivery finished") }
            catch let error as ServiceError { XCTAssertEqual(error.status, expectedError) }
            let unfinished = await unfinishedIDs(); XCTAssertTrue(unfinished.contains(transaction.id))
        }
        try await PurchaseDelivery.deliver(transaction, signedTransaction: result.jwsRepresentation, accountID: owner.uuidString, api: api(status: 200))
        let finished = await unfinishedIDs(); XCTAssertFalse(finished.contains(transaction.id))
    }
    func testLocalAskToBuyDoesNotReturnAnActivePurchase() async throws {
        let session = try session(); defer { session.clearTransactions(); session.resetToDefaultState() }
        session.askToBuyEnabled = true
        let products = try await Product.products(for: ["test.tradies2quote.crew.monthly"])
        let product = try XCTUnwrap(products.first)
        let result = try await product.purchase(options: [.appAccountToken(UUID())])
        guard case .pending = result else { return XCTFail("Ask to Buy must remain pending") }
        var entitlementIDs: [String] = []
        for await result in StoreKit.Transaction.currentEntitlements { if case .verified(let transaction) = result { entitlementIDs.append(transaction.productID) } }
        XCTAssertFalse(entitlementIDs.contains(product.id))
    }
    private func unfinishedIDs() async -> [UInt64] {
        var ids: [UInt64] = []
        for await result in StoreKit.Transaction.unfinished { if case .verified(let transaction) = result { ids.append(transaction.id) } }
        return ids
    }
}

private final class PurchaseFixtureProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "purchase-test.invalid" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let status = Int(request.value(forHTTPHeaderField: "X-Test-Response") ?? "503")!
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data((status == 200 ? "{\"ok\":true}" : "{\"message\":\"Test backend unavailable\"}").utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
