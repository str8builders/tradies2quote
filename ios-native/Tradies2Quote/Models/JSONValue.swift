import Foundation

/// Preserve fields that the website or the separate calculator adds. Editing
/// prices must not discard takeoff provenance, consent stamps or dimensions.
indirect enum JSONValue: Codable, Equatable, Sendable {
    case object([String: JSONValue]), array([JSONValue]), string(String), number(Double), bool(Bool), null
    init(from decoder: any Decoder) throws {
        let value = try decoder.singleValueContainer()
        if value.decodeNil() { self = .null }
        else if let v = try? value.decode(Bool.self) { self = .bool(v) }
        else if let v = try? value.decode(Double.self) { self = .number(v) }
        else if let v = try? value.decode(String.self) { self = .string(v) }
        else if let v = try? value.decode([String: JSONValue].self) { self = .object(v) }
        else { self = .array(try value.decode([JSONValue].self)) }
    }
    func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
    subscript(_ key: String) -> JSONValue {
        get { if case .object(let fields) = self { return fields[key] ?? .null }; return .null }
        set { var fields = object; fields[key] = newValue; self = .object(fields) }
    }
    var object: [String: JSONValue] { if case .object(let value) = self { return value }; return [:] }
    var array: [JSONValue] { if case .array(let value) = self { return value }; return [] }
    var string: String { if case .string(let value) = self { return value }; return "" }
    var number: Double { if case .number(let value) = self { return value }; return 0 }
    var bool: Bool { if case .bool(let value) = self { return value }; return false }
    var isNull: Bool { self == .null }
}

struct BusinessRecord: Identifiable, Codable, Sendable, Equatable {
    let raw: JSONValue
    var id: String { raw["id"].string.nonempty ?? raw["user_id"].string }
    var quote: JSONValue { raw["quote_data"].isNull ? raw["invoice_data"] : raw["quote_data"] }
    var title: String {
        let candidates = [quote["job_summary"].string, raw["name"].string, raw["client_name"].string, raw["body"].string, raw["description"].string]
        return candidates.first { !$0.isEmpty } ?? "Untitled"
    }
    var status: String { raw["status"].string }
    var currency: String { raw["currency"].string.isEmpty ? "NZD" : raw["currency"].string }
    var total: Double { raw["total_amount"].number }
}

struct EditableLine: Identifiable, Equatable, Sendable {
    let id: UUID
    var raw: JSONValue
    init(raw: JSONValue, id: UUID = UUID()) { self.raw = raw; self.id = id }
}

enum QuoteMath {
    static func cents(_ value: Double) -> Double { (value * 100).rounded(.toNearestOrAwayFromZero) / 100 }
    static func recalculate(_ quote: JSONValue) -> JSONValue {
        var next = quote
        var material = 0.0, labour = 0.0
        next["line_items"] = .array(quote["line_items"].array.map { item in
            var line = item
            let total = cents(line["quantity"].number * line["unit_price"].number)
            line["line_total"] = .number(total)
            if line["type"].string == "labour" { labour += total } else { material += total }
            return line
        })
        material = cents(material); labour = cents(labour)
        let markup = cents(material * quote["markup_pct"].number / 100)
        let subtotal = cents(material + labour + markup)
        let tax = cents(subtotal * quote["tax_rate"].number / 100)
        for (key, value) in ["materials_subtotal": material, "labour_subtotal": labour, "markup_amount": markup, "subtotal_before_tax": subtotal, "tax_amount": tax, "total": cents(subtotal + tax)] { next[key] = .number(value) }
        return next
    }
    static func blank(profile: JSONValue) -> JSONValue {
        .object(["client": .object(["name": .string(""), "email": .string(""), "phone": .string(""), "address": .string("")]), "job_summary": .string(""), "line_items": .array([]), "currency": .string(profile["currency"].string.isEmpty ? "NZD" : profile["currency"].string), "tax_label": .string(profile["tax_label"].string.isEmpty ? "GST" : profile["tax_label"].string), "tax_rate": profile["tax_rate"].isNull ? .number(15) : profile["tax_rate"], "markup_pct": profile["default_markup_pct"].isNull ? .number(20) : profile["default_markup_pct"], "terms": .string(""), "notes": .array([])])
    }
}

struct DisplayContent: Identifiable, Equatable {
    let id: UUID
    let raw: JSONValue
    static func update(_ values: [JSONValue], preserving existing: [DisplayContent]) -> [DisplayContent] {
        var pool = existing
        return values.map { value in
            if let index = pool.firstIndex(where: { $0.raw == value }) { return pool.remove(at: index) }
            return DisplayContent(id: UUID(), raw: value)
        }
    }
}
