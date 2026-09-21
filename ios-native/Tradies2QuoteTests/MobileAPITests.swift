import XCTest
@testable import Tradies2Quote

final class MobileAPITests: XCTestCase {
    private func api() -> MobileAPI {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [FixtureProtocol.self]
        return MobileAPI(baseURL: URL(string: "https://example.invalid")!, token: { "test-token" }, session: URLSession(configuration: config))
    }
    func testBearerRequestAndJSONResponse() async throws {
        let response = try await api().request("/api/success")
        XCTAssertEqual(response["authorization"].string, "Bearer test-token")
    }
    func testInvalidOriginRejectedBeforeNetworking() async {
        do { _ = try await api().request("https://evil.invalid/api/quotes"); XCTFail("Accepted an external origin") }
        catch let error as ServiceError { XCTAssertEqual(error.status, 0) }
        catch { XCTFail("Unexpected error: \(error)") }
    }
    func testExpiredSessionAndConflictRemainActionable() async {
        for status in [401, 409, 503] {
            do { _ = try await api().request("/api/error/\(status)"); XCTFail("Error reported success") }
            catch let error as ServiceError { XCTAssertEqual(error.status, status); XCTAssertEqual(error.message, "Refresh before retrying") }
            catch { XCTFail("Unexpected error: \(error)") }
        }
    }
    func testMalformedSuccessIsNotTreatedAsSaved() async {
        do { _ = try await api().request("/api/malformed"); XCTFail("Accepted invalid JSON") }
        catch is DecodingError {} catch { XCTFail("Unexpected error: \(error)") }
    }
    func testCollectionLoadsAllPages() async throws {
        let records = try await api().collection("quotes")
        XCTAssertEqual(records.map(\.id), ["first", "second"])
    }
}
private final class FixtureProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "example.invalid" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let path = request.url!.path
        let status = path.hasPrefix("/api/error/") ? Int(path.components(separatedBy: "/").last!)! : 200
        let body: String
        if path == "/api/success" { body = "{\"authorization\":\"\(request.value(forHTTPHeaderField: "Authorization") ?? "")\"}" }
        else if path == "/api/malformed" { body = "not JSON" }
        else if path == "/api/mobile/v1/quotes" { body = request.url!.query == "offset=0" ? "{\"items\":[{\"id\":\"first\"}],\"nextOffset\":100}" : "{\"items\":[{\"id\":\"second\"}],\"nextOffset\":null}" }
        else { body = "{\"message\":\"Refresh before retrying\"}" }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
