import Foundation

struct ServiceError: LocalizedError, Sendable {
    let status: Int
    let message: String
    var errorDescription: String? { message }
}

struct MobileAPI: Sendable {
    let baseURL: URL
    let token: @Sendable () async throws -> String
    let session: URLSession
    init(baseURL: URL, token: @escaping @Sendable () async throws -> String, session: URLSession? = nil) {
        self.baseURL = baseURL; self.token = token
        let configuration = URLSessionConfiguration.ephemeral; configuration.httpCookieStorage = nil
        self.session = session ?? URLSession(configuration: configuration, delegate: OriginRedirectGuard(origin: baseURL), delegateQueue: nil)
    }
    func request(_ path: String, method: String = "GET", body: JSONValue? = nil) async throws -> JSONValue {
        let data = try await data(path, method: method, body: body.map { try JSONEncoder().encode($0) }, contentType: "application/json")
        if data.isEmpty { return .object([:]) }
        return try JSONDecoder().decode(JSONValue.self, from: data)
    }
    func data(_ path: String, method: String = "GET", body: Data? = nil, contentType: String? = nil) async throws -> Data {
        guard path.hasPrefix("/api/"), let url = URL(string: path, relativeTo: baseURL)?.absoluteURL,
              url.host == baseURL.host, url.scheme == baseURL.scheme else {
            throw ServiceError(status: 0, message: "Invalid service address.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method; request.httpBody = body; request.timeoutInterval = 180
        request.setValue("Bearer \(try await token())", forHTTPHeaderField: "Authorization")
        request.setValue("Tradies2Quote-iOS/1", forHTTPHeaderField: "User-Agent")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let contentType { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw ServiceError(status: 0, message: "No response from the service.") }
        guard (200..<300).contains(response.statusCode) else {
            let value = try? JSONDecoder().decode(JSONValue.self, from: data)
            let message = value?["message"].string.nonempty ?? value?["error"].string.nonempty ?? "The service is unavailable. Refresh before retrying."
            throw ServiceError(status: response.statusCode, message: message)
        }
        return data
    }
    func upload(_ path: String, field: String, filename: String, contentType: String, bytes: Data, fields: [String: String] = [:]) async throws -> JSONValue {
        try await upload(path, parts: [(field: field, filename: filename, contentType: contentType, bytes: bytes)], fields: fields)
    }
    func upload(_ path: String, parts: [(field: String, filename: String, contentType: String, bytes: Data)], fields: [String: String] = [:]) async throws -> JSONValue {
        let boundary = "T2Q-\(UUID().uuidString)"
        var body = Data()
        func append(_ text: String) { body.append(Data(text.utf8)) }
        for (key, value) in fields { append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(key)\"\r\n\r\n\(value)\r\n") }
        for (field, filename, contentType, bytes) in parts {
        append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(field)\"; filename=\"\(filename)\"\r\nContent-Type: \(contentType)\r\n\r\n")
        body.append(bytes); append("\r\n")
        }
        append("--\(boundary)--\r\n")
        let data = try await data(path, method: "POST", body: body, contentType: "multipart/form-data; boundary=\(boundary)")
        return try JSONDecoder().decode(JSONValue.self, from: data)
    }
    func collection(_ name: String) async throws -> [BusinessRecord] {
        var results: [BusinessRecord] = [], offset = 0
        while true {
            try Task.checkCancellation()
            let page = try await request("/api/mobile/v1/\(name)?offset=\(offset)")
            results.append(contentsOf: page["items"].array.map(BusinessRecord.init(raw:)))
            if page["nextOffset"].isNull { return results }
            let next = Int(page["nextOffset"].number)
            guard next > offset else { throw ServiceError(status: 0, message: "Could not load the next page.") }
            offset = next
        }
    }
}

extension String { var nonempty: String? { isEmpty ? nil : self } }

private final class OriginRedirectGuard: NSObject, URLSessionTaskDelegate, Sendable {
    let origin: URL
    init(origin: URL) { self.origin = origin }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        guard let url = request.url, url.host == origin.host, url.scheme == origin.scheme, url.port == origin.port else { completionHandler(nil); return }
        completionHandler(request)
    }
}
