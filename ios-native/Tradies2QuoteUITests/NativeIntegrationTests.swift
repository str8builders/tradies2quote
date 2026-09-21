import XCTest

final class NativeIntegrationTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }
    @MainActor func testSignInCreateManualQuoteAndReopenFromServer() throws {
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
        for _ in 0..<5 where !app.buttons["Add from materials"].isHittable { app.swipeUp() }
        app.buttons["Add from materials"].tap()
        let savedMaterial = app.buttons.containing(.staticText, identifier: "Integration Material").firstMatch
        XCTAssertTrue(savedMaterial.waitForExistence(timeout: 15)); savedMaterial.tap()
        for _ in 0..<8 where !app.buttons["quote.save"].isHittable { app.swipeUp() }
        XCTAssertTrue(app.buttons["quote.save"].isHittable); app.buttons["quote.save"].tap()
        XCTAssertTrue(app.buttons["home.newQuote"].waitForExistence(timeout: 30))
        app.tabBars.buttons["Quotes"].tap()
        let quote = app.staticTexts[title].firstMatch
        XCTAssertTrue(quote.waitForExistence(timeout: 20)); quote.tap()
        XCTAssertTrue(app.staticTexts["Integration Client"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Integration Material"].exists)
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "Native manual quote saved and reopened"; screenshot.lifetime = .keepAlways; add(screenshot)
        app.terminate()
        app.launchEnvironment.removeValue(forKey: "T2Q_TEST_RESET")
        app.launch()
        XCTAssertTrue(app.buttons["home.newQuote"].waitForExistence(timeout: 30))
        app.tabBars.buttons["Quotes"].tap()
        XCTAssertTrue(app.staticTexts[title].firstMatch.waitForExistence(timeout: 20))
    }
}
