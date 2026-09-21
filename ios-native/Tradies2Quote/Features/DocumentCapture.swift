import SwiftUI
import VisionKit
import PDFKit

struct DocumentCapture: UIViewControllerRepresentable {
    @Environment(\.dismiss) private var dismiss
    let completed: ([Data]) -> Void
    let failed: (String) -> Void
    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let camera = VNDocumentCameraViewController(); camera.delegate = context.coordinator; return camera
    }
    func updateUIViewController(_ uiViewController: VNDocumentCameraViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }
    @MainActor final class Coordinator: NSObject, @preconcurrency VNDocumentCameraViewControllerDelegate {
        let parent: DocumentCapture
        init(parent: DocumentCapture) { self.parent = parent }
        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) { parent.dismiss() }
        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: any Error) { parent.dismiss(); parent.failed(error.localizedDescription) }
        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
            parent.dismiss()
            guard (1...8).contains(scan.pageCount) else { parent.failed("Scan between one and eight pages from the same document."); return }
            do {
                let images = try (0..<scan.pageCount).map { index -> Data in
                    guard let data = scan.imageOfPage(at: index).jpegData(compressionQuality: 0.85) else { throw ServiceError(status: 0, message: "A scanned page could not be read. Scan it again.") }
                    return try PreparedImage.jpeg(data)
                }
                parent.completed(images)
            } catch { parent.failed(error.localizedDescription) }
        }
    }
}
enum PreparedDocument {
    static func pdfPages(_ data: Data) throws -> [Data] {
        guard data.count <= 25_000_000, let document = PDFDocument(data: data), !document.isLocked, (1...8).contains(document.pageCount) else {
            throw ServiceError(status: 0, message: "Choose an unlocked PDF with one to eight pages, smaller than 25 MB.")
        }
        return try (0..<document.pageCount).map { index in
            guard let page = document.page(at: index), let data = page.thumbnail(of: CGSize(width: 2000, height: 2600), for: .mediaBox).jpegData(compressionQuality: 0.85) else {
                throw ServiceError(status: 0, message: "A PDF page could not be read. Choose another copy of the document.")
            }
            return data
        }
    }
}
