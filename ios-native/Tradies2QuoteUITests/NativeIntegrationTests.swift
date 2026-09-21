import XCTest

final class NativeIntegrationTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }
    @MainActor func testSignInCreateManualQuoteAndReopenFromServer() async throws {
        // Synthetic local credentials are deliberately absent from source control.
        let path = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appending(path: "IntegrationCredentials.json")
        guard FileManager.default.fileExists(atPath: path.path) else { throw XCTSkip("Requires the isolated integration services and synthetic test credentials.") }
        let config = try JSONDecoder().decode([String: String].self, from: Data(contentsOf: path))
        let app = XCUIApplication()
        app.launchEnvironment = ["T2Q_TEST_AUTH_URL": "http://127.0.0.1:14300", "T2Q_TEST_API_URL": "http://127.0.0.1:14100", "T2Q_TEST_ANON_KEY": config["anon"]!, "T2Q_TEST_RESET": "1"]
        app.launch()
        XCTAssertTrue(app.textFields["auth.email"].waitForExistence(timeout: 20))
        app.textFields["auth.email"].tap(); app.textFields["auth.email"].typeText(config["email"]!)
        app.secureTextFields["auth.password"].tap(); app.secureTextFields["auth.password"].typeText(config["password"]!)
        app.buttons["auth.submit"].tap()
        XCTAssertTrue(app.buttons["home.newQuote"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.descendants(matching: .any)["home.loaded"].firstMatch.waitForExistence(timeout: 20))
        XCTAssertFalse(app.staticTexts["service.error"].exists)
        app.buttons["home.newQuote"].tap()
        let title = "Native acceptance \(UUID().uuidString.prefix(8))"
        app.textFields["quote.summary"].tap(); app.textFields["quote.summary"].typeText(title)
        app.buttons["Choose saved client"].tap()
        let savedClient = app.buttons["Integration Client"].firstMatch
        XCTAssertTrue(savedClient.waitForExistence(timeout: 15)); savedClient.tap()
        scrollTo(app.buttons["Add from materials"], in: app)
        app.buttons["Add from materials"].tap()
        let savedMaterial = app.buttons.containing(.staticText, identifier: "Integration Material").firstMatch
        XCTAssertTrue(savedMaterial.waitForExistence(timeout: 15)); savedMaterial.tap()
        scrollTo(app.buttons["quote.save"], in: app)
        XCTAssertTrue(app.buttons["quote.save"].isHittable); app.buttons["quote.save"].tap()
        XCTAssertTrue(app.buttons["home.newQuote"].waitForExistence(timeout: 30))
        openQuotes(in: app)
        let quote = app.staticTexts[title].firstMatch
        XCTAssertTrue(quote.waitForExistence(timeout: 20)); quote.tap()
        XCTAssertTrue(app.staticTexts["Integration Client"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Integration Material"].exists)
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "Native manual quote saved and reopened"; screenshot.lifetime = .keepAlways; add(screenshot)
        let remoteTitle = try await exerciseConflict(in: app, title: title, config: config)
        app.terminate()
        app.launchEnvironment.removeValue(forKey: "T2Q_TEST_RESET")
        app.launch()
        XCTAssertTrue(app.buttons["home.newQuote"].waitForExistence(timeout: 30))
        openQuotes(in: app)
        XCTAssertTrue(app.staticTexts[remoteTitle].firstMatch.waitForExistence(timeout: 20))
    }
    @MainActor private func exerciseConflict(in app: XCUIApplication, title: String, config: [String: String]) async throws -> String {
        let session = try await jsonRequest("http://127.0.0.1:14300/auth/v1/token?grant_type=password", method: "POST", headers: ["apikey": config["anon"]!], body: ["email": config["email"]!, "password": config["password"]!])
        let headers = ["Authorization": "Bearer \(session["access_token"] as! String)"]
        let list = try await jsonRequest("http://127.0.0.1:14100/api/mobile/v1/quotes", headers: headers)
        let records = list["items"] as! [[String: Any]]
        let record = try XCTUnwrap(records.first { ($0["quote_data"] as? [String: Any])?["job_summary"] as? String == title })
        let id = record["id"] as! String
        let detail = try await jsonRequest("http://127.0.0.1:14100/api/mobile/v1/quotes/\(id)", headers: headers)["item"] as! [String: Any]
        scrollTo(app.buttons["Edit quote"], in: app, container: "quote.detail.list")
        app.buttons["Edit quote"].tap()
        let summary = app.textFields["quote.summary"]
        XCTAssertTrue(summary.waitForExistence(timeout: 10)); summary.tap(); summary.typeText(" local edit")
        let localTitle = try XCTUnwrap(summary.value as? String)
        var remote = detail["quote_data"] as! [String: Any]
        let remoteTitle = title + " remote edit"; remote["job_summary"] = remoteTitle
        _ = try await jsonRequest("http://127.0.0.1:14100/api/mobile/v1/quotes/\(id)/save", method: "POST", headers: headers, body: ["quote_data": remote, "expectedRevision": detail["revision"]!, "transcript": "Changed on another device"])
        scrollTo(app.buttons["quote.save"], in: app); app.buttons["quote.save"].tap()
        XCTAssertTrue(app.navigationBars["Compare versions"].waitForExistence(timeout: 20))
        let copy = app.buttons["quote.conflict.copy"]
        scrollTo(copy, in: app, container: "quote.conflict.list"); copy.tap()
        XCTAssertTrue(app.navigationBars["New quote"].waitForExistence(timeout: 10))
        scrollTo(app.buttons["quote.save"], in: app); app.buttons["quote.save"].tap()
        XCTAssertTrue(app.navigationBars["Quote"].waitForExistence(timeout: 20))
        let original = try await jsonRequest("http://127.0.0.1:14100/api/mobile/v1/quotes/\(id)", headers: headers)["item"] as! [String: Any]
        XCTAssertEqual((original["quote_data"] as! [String: Any])["job_summary"] as? String, remoteTitle)
        let final = try await jsonRequest("http://127.0.0.1:14100/api/mobile/v1/quotes", headers: headers)["items"] as! [[String: Any]]
        XCTAssertTrue(final.contains { ($0["quote_data"] as? [String: Any])?["job_summary"] as? String == localTitle + " (recovered copy)" && $0["id"] as? String != id })
        return remoteTitle
    }
    @MainActor private func jsonRequest(_ address: String, method: String = "GET", headers: [String: String], body: [String: Any]? = nil) async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: address)!); request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        for (key, value) in headers { request.setValue(value, forHTTPHeaderField: key) }
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, "Synthetic fixture request failed; credentials omitted")
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
    @MainActor private func openQuotes(in app: XCUIApplication) {
        let phoneTab = app.tabBars.buttons["Quotes"]
        if phoneTab.exists { phoneTab.tap() }
        else { app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Quotes")).firstMatch.tap() }
    }
    @MainActor private func scrollTo(_ element: XCUIElement, in app: XCUIApplication, container: String = "quote.editor.form") {
        for _ in 0..<24 where !element.isHittable {
            // A full-screen swipe starts on the keyboard on a 4.7-inch phone.
            // Scroll within the visible form, as a user does above the keyboard.
            let form = app.collectionViews[container]
            let start = form.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.4))
            let end = form.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.1))
            start.press(forDuration: 0.05, thenDragTo: end)
        }
        XCTAssertTrue(element.isHittable)
    }
}
