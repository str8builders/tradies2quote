import XCTest
@testable import Tradies2Quote

final class QuoteMathTests: XCTestCase {
    func testSumOfRoundedLinesAndMaterialOnlyMarkup() {
        let value: JSONValue = .object(["line_items": .array([
            .object(["type": .string("material"), "quantity": .number(3), "unit_price": .number(0.335), "t2qcal_source_key": .string("deck.boards")]),
            .object(["type": .string("labour"), "quantity": .number(2), "unit_price": .number(75)])]), "markup_pct": .number(20), "tax_rate": .number(15)])
        let result = QuoteMath.recalculate(value)
        XCTAssertEqual(result["materials_subtotal"].number, 1.01)
        XCTAssertEqual(result["labour_subtotal"].number, 150)
        XCTAssertEqual(result["markup_amount"].number, 0.2)
        XCTAssertEqual(result["total"].number, 173.89)
        XCTAssertEqual(result["line_items"].array[0]["t2qcal_source_key"].string, "deck.boards")
    }
    func testUnknownFieldsSurviveDecodeAndEdit() throws {
        let original = Data(#"{"client":{"name":"Sam"},"future":{"x":true},"line_items":[{"quantity":1,"t2qcal_source_key":"wall"}]}"#.utf8)
        var value = try JSONDecoder().decode(JSONValue.self, from: original)
        value["client"]["name"] = .string("Jess")
        let decoded = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value))
        XCTAssertTrue(decoded["future"]["x"].bool)
        XCTAssertEqual(decoded["client"]["name"].string, "Jess")
        XCTAssertEqual(decoded["line_items"].array[0]["t2qcal_source_key"].string, "wall")
    }
}
