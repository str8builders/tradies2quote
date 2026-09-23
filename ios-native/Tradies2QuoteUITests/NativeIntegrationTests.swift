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
        try scrollTo(savedClient, in: app, container: "library.picker"); savedClient.tap()
        try scrollTo(app.buttons["Add from materials"], in: app)
        app.buttons["Add from materials"].tap()
        let savedMaterial = app.buttons.containing(.staticText, identifier: "Integration Material").firstMatch
        try scrollTo(savedMaterial, in: app, container: "library.picker"); savedMaterial.tap()
        try scrollTo(app.buttons["quote.save"], in: app)
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
    @MainActor func testConsentAccountControlsAndUnavailableServices() async throws {
        let (app, _, headers) = try await launchSyntheticAccount()
        _ = try await jsonRequest("http://127.0.0.1:14100/api/mobile/v1/consent", method: "POST", headers: headers, body: ["granted": false])
        openTab("More", in: app)
        try scrollTo(app.buttons["Settings"], in: app, container: "more.list")
        app.buttons["Settings"].tap()
        let permission = app.buttons["Review AI permission"]
        try scrollTo(permission, in: app, container: "settings.form"); permission.tap()
        try scrollTo(app.buttons["Continue without AI"], in: app, container: "consent.form")
        app.buttons["Continue without AI"].tap()
        let declined = try await jsonRequest("http://127.0.0.1:14100/api/mobile/v1/account", headers: headers)
        XCTAssertEqual(declined["consented"] as? Bool, false)
        permission.tap()
        try scrollTo(app.buttons["Allow AI processing"], in: app, container: "consent.form")
        XCTAssertTrue(app.buttons["Allow AI processing"].isEnabled)
        app.buttons["Allow AI processing"].tap()
        let withdraw = app.buttons["Turn off future AI processing"]
        XCTAssertTrue(withdraw.waitForExistence(timeout: 20))
        let granted = try await jsonRequest("http://127.0.0.1:14100/api/mobile/v1/account", headers: headers)
        XCTAssertEqual(granted["consented"] as? Bool, true)
        withdraw.tap(); XCTAssertTrue(permission.waitForExistence(timeout: 20))
        let withdrawn = try await jsonRequest("http://127.0.0.1:14100/api/mobile/v1/account", headers: headers)
        XCTAssertEqual(withdrawn["consented"] as? Bool, false)
        try scrollTo(app.buttons["Delete account"], in: app, container: "settings.form")
        app.buttons["Delete account"].tap()
        let remove = app.buttons["Permanently delete account"]
        try scrollTo(remove, in: app, container: "delete.form")
        XCTAssertFalse(remove.isEnabled)
        XCTAssertTrue(app.descendants(matching: .any)["Manage Apple subscriptions"].firstMatch.exists)
        app.textFields["account.deleteConfirmation"].tap(); app.textFields["account.deleteConfirmation"].typeText("DELETE")
        XCTAssertTrue(remove.isEnabled)
        app.buttons["Cancel"].tap()
        let retainedAccount = try await jsonRequest("http://127.0.0.1:14100/api/mobile/v1/account", headers: headers)
        XCTAssertNotNil(retainedAccount["id"])
        app.collectionViews["settings.form"].swipeDown()
        try scrollTo(app.buttons["Subscription"], in: app, container: "settings.form"); app.buttons["Subscription"].tap()
        XCTAssertTrue(app.buttons["Restore purchases"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.descendants(matching: .any)["Manage Apple subscriptions"].firstMatch.exists)
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Subscribe to ")).firstMatch.exists)
        openTab("Home", in: app); app.buttons["home.newQuote"].tap()
        try scrollTo(app.textViews["quote.description"], in: app)
        XCTAssertFalse(app.buttons["Record a voice note"].exists)
        XCTAssertFalse(app.buttons["Generate draft quote"].exists)
        XCTAssertTrue(app.staticTexts["Voice input is unavailable right now. You can type your description."].exists)
        app.buttons["Close"].tap()
    }

    @MainActor func testClientAndMaterialEntryPersistsToServer() async throws {
        let (app, _, headers) = try await launchSyntheticAccount()
        openTab("Clients", in: app); app.buttons["Add client"].tap()
        let client = "Harbour Renovation \(UUID().uuidString.prefix(6))"
        app.textFields["Name"].tap(); app.textFields["Name"].typeText(client)
        app.textFields["Email"].tap(); app.textFields["Email"].typeText("client@example.invalid")
        try scrollTo(app.buttons["Save client"], in: app, container: "client.form"); app.buttons["Save client"].tap()
        XCTAssertTrue(app.staticTexts[client].waitForExistence(timeout: 20))
        let clients = try await jsonRequest("http://127.0.0.1:14100/api/mobile/v1/clients", headers: headers)["items"] as! [[String: Any]]
        XCTAssertTrue(clients.contains { $0["name"] as? String == client })
        capture("Clients — synthetic acceptance", app: app)
        openTab("More", in: app); app.buttons["Materials"].tap(); app.buttons["records.add"].tap()
        let material = "Deck board \(UUID().uuidString.prefix(6))"
        app.textFields["Name"].tap(); app.textFields["Name"].typeText(material)
        try scrollTo(app.buttons["Save material"], in: app, container: "material.form"); app.buttons["Save material"].tap()
        XCTAssertTrue(app.staticTexts[material].waitForExistence(timeout: 20))
        let materials = try await jsonRequest("http://127.0.0.1:14100/api/mobile/v1/materials", headers: headers)["items"] as! [[String: Any]]
        XCTAssertTrue(materials.contains { $0["name"] as? String == material })
        capture("Materials — synthetic acceptance", app: app)
    }

    @MainActor func testLocalDraftSurvivesTerminationAndOfflineReopen() async throws {
        let (app, _, _) = try await launchSyntheticAccount()
        app.buttons["home.newQuote"].tap()
        let title = "Porch repair \(UUID().uuidString.prefix(6))"
        app.textFields["quote.summary"].tap(); app.textFields["quote.summary"].typeText(title)
        app.buttons["Close"].tap()
        XCTAssertTrue(app.buttons["home.newQuote"].waitForExistence(timeout: 15))
        app.terminate(); app.launchEnvironment.removeValue(forKey: "T2Q_TEST_RESET")
        // Only the local backend is unavailable; no device network settings change.
        app.launchEnvironment["T2Q_TEST_API_URL"] = "http://127.0.0.1:14101"
        app.launch(); XCTAssertTrue(app.buttons["home.newQuote"].waitForExistence(timeout: 30))
        openQuotes(in: app)
        let draft = app.staticTexts[title].firstMatch
        XCTAssertTrue(draft.waitForExistence(timeout: 20)); draft.tap()
        XCTAssertTrue(app.textFields["quote.summary"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.textFields["quote.summary"].value as? String, title)
        capture("Recovered device draft — offline acceptance", app: app)
        app.buttons["Close"].tap(); app.terminate()
        app.launchEnvironment["T2Q_TEST_API_URL"] = "http://127.0.0.1:14100"
        app.launch(); XCTAssertTrue(app.buttons["home.newQuote"].waitForExistence(timeout: 30)); openQuotes(in: app)
        XCTAssertTrue(app.staticTexts[title].firstMatch.waitForExistence(timeout: 20))
    }

    @MainActor func testLargerTextQuoteControlsRemainReachable() async throws {
        let (app, _, _) = try await launchSyntheticAccount(largerText: true)
        try app.performAccessibilityAudit(for: [.dynamicType, .textClipped, .sufficientElementDescription])
        capture("Home — largest text acceptance", app: app)
        app.buttons["home.newQuote"].tap()
        app.textFields["quote.summary"].tap(); app.textFields["quote.summary"].typeText("Large text review")
        try scrollTo(app.buttons["quote.addLine"], in: app); app.buttons["quote.addLine"].tap()
        try scrollTo(app.textFields["Unit price"], in: app)
        XCTAssertTrue(app.textFields["Unit price"].isHittable)
        try scrollTo(app.buttons["quote.save"], in: app)
        XCTAssertTrue(app.buttons["quote.save"].isHittable)
        app.buttons["Close"].tap()
    }

    @MainActor private func launchSyntheticAccount(largerText: Bool = false) async throws -> (XCUIApplication, [String: String], [String: String]) {
        let path = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appending(path: "IntegrationCredentials.json")
        guard FileManager.default.fileExists(atPath: path.path) else { throw XCTSkip("Requires isolated synthetic test services.") }
        let config = try JSONDecoder().decode([String: String].self, from: Data(contentsOf: path))
        let session = try await jsonRequest("http://127.0.0.1:14300/auth/v1/token?grant_type=password", method: "POST", headers: ["apikey": config["anon"]!], body: ["email": config["email"]!, "password": config["password"]!])
        let headers = ["Authorization": "Bearer \(session["access_token"] as! String)"]
        let app = XCUIApplication()
        app.launchEnvironment = ["T2Q_TEST_AUTH_URL": "http://127.0.0.1:14300", "T2Q_TEST_API_URL": "http://127.0.0.1:14100", "T2Q_TEST_ANON_KEY": config["anon"]!, "T2Q_TEST_RESET": "1"]
        if largerText { app.launchArguments = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"] }
        app.launch()
        try scrollTo(app.textFields["auth.email"], in: app, container: "auth.form")
        app.textFields["auth.email"].tap(); app.textFields["auth.email"].typeText(config["email"]!)
        try scrollTo(app.secureTextFields["auth.password"], in: app, container: "auth.form")
        app.secureTextFields["auth.password"].tap(); app.secureTextFields["auth.password"].typeText(config["password"]!)
        let signIn = app.buttons["auth.submit"]
        try scrollTo(signIn, in: app, container: "auth.form")
        signIn.tap()
        guard app.descendants(matching: .any)["home.loaded"].firstMatch.waitForExistence(timeout: 30) else {
            throw acceptanceError("Synthetic account did not finish loading; inspect the test service and sign-in screen")
        }
        try scrollTo(app.buttons["home.newQuote"], in: app, container: "home.loaded")
        return (app, config, headers)
    }
    @MainActor private func openTab(_ title: String, in app: XCUIApplication) {
        let tab = app.tabBars.buttons[title]
        if tab.exists { tab.tap() }
        else { app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", title)).firstMatch.tap() }
    }
    @MainActor private func capture(_ name: String, app: XCUIApplication) {
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = name; screenshot.lifetime = .keepAlways; add(screenshot)
    }

    @MainActor private func exerciseConflict(in app: XCUIApplication, title: String, config: [String: String]) async throws -> String {
        let session = try await jsonRequest("http://127.0.0.1:14300/auth/v1/token?grant_type=password", method: "POST", headers: ["apikey": config["anon"]!], body: ["email": config["email"]!, "password": config["password"]!])
        let headers = ["Authorization": "Bearer \(session["access_token"] as! String)"]
        let list = try await jsonRequest("http://127.0.0.1:14100/api/mobile/v1/quotes", headers: headers)
        let records = list["items"] as! [[String: Any]]
        let record = try XCTUnwrap(records.first { ($0["quote_data"] as? [String: Any])?["job_summary"] as? String == title })
        let id = record["id"] as! String
        let detail = try await jsonRequest("http://127.0.0.1:14100/api/mobile/v1/quotes/\(id)", headers: headers)["item"] as! [String: Any]
        try scrollTo(app.buttons["Edit quote"], in: app, container: "quote.detail.list")
        app.buttons["Edit quote"].tap()
        let summary = app.textFields["quote.summary"]
        XCTAssertTrue(summary.waitForExistence(timeout: 10)); summary.tap(); summary.typeText(" local edit")
        let localTitle = try XCTUnwrap(summary.value as? String)
        var remote = detail["quote_data"] as! [String: Any]
        let remoteTitle = title + " remote edit"; remote["job_summary"] = remoteTitle
        _ = try await jsonRequest("http://127.0.0.1:14100/api/mobile/v1/quotes/\(id)/save", method: "POST", headers: headers, body: ["quote_data": remote, "expectedRevision": detail["revision"]!, "transcript": "Changed on another device"])
        try scrollTo(app.buttons["quote.save"], in: app); app.buttons["quote.save"].tap()
        XCTAssertTrue(app.navigationBars["Compare versions"].waitForExistence(timeout: 20))
        let copy = app.buttons["quote.conflict.copy"]
        try scrollTo(copy, in: app, container: "quote.conflict.list"); copy.tap()
        XCTAssertTrue(app.navigationBars["New quote"].waitForExistence(timeout: 10))
        try scrollTo(app.buttons["quote.save"], in: app); app.buttons["quote.save"].tap()
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
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw acceptanceError("Synthetic fixture request failed with status \((response as? HTTPURLResponse)?.statusCode ?? 0); credentials omitted")
        }
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
    @MainActor private func openQuotes(in app: XCUIApplication) {
        let phoneTab = app.tabBars.buttons["Quotes"]
        if phoneTab.exists { phoneTab.tap() }
        else { app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Quotes")).firstMatch.tap() }
    }
    @MainActor private func scrollTo(_ element: XCUIElement, in app: XCUIApplication, container: String = "quote.editor.form") throws {
        let form = app.collectionViews[container]
        guard form.waitForExistence(timeout: 5) else { throw acceptanceError("Expected form is not present: \(container)") }
        for _ in 0..<24 {
            if element.exists && element.isHittable { return }
            // A full-screen swipe starts on the keyboard on a 4.7-inch phone.
            // Scroll within the visible form, as a user does above the keyboard.
            let start = form.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.4))
            let end = form.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.1))
            start.press(forDuration: 0.05, thenDragTo: end)
        }
        guard element.isHittable else { throw acceptanceError("Control is not reachable: \(element.identifier)") }
    }
    private func acceptanceError(_ message: String) -> NSError {
        NSError(domain: "NativeAcceptance", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
