import XCTest

final class LaunchTests: XCTestCase {
    @MainActor func testNativeAccountScreensAndDeletionOfEmbeddedCalculatorNavigation() {
        let app = XCUIApplication(); app.launch()
        XCTAssertTrue(app.textFields["auth.email"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.secureTextFields["auth.password"].exists)
        XCTAssertFalse(app.buttons["auth.submit"].isEnabled)
        app.buttons["Create an account"].tap()
        XCTAssertTrue(app.switches["I agree to the Terms and Privacy Policy"].exists)
        XCTAssertFalse(app.buttons["auth.submit"].isEnabled)
        XCTAssertFalse(app.buttons["Calculators"].exists)
    }
}
