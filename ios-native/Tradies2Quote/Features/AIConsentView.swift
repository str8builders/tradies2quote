import SwiftUI
import AVFoundation
import Observation

struct AIConsentView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var message: String?
    var body: some View {
        NavigationStack {
            Form {
                Section("Choose whether to use AI") {
                    Text("With your permission, Anthropic processes quote descriptions, transcripts, drawings and supplier documents. OpenAI processes voice recordings and photos. These services may process data outside New Zealand, including in the United States.")
                    Text("Only send content you have permission to share. AI creates editable drafts and can make mistakes. Check quantities, prices and compliance details before using a result.")
                    Text("You can keep creating quotes manually. Turn AI off at any time in Settings to stop future AI requests.")
                    Link("Read the Privacy Policy", destination: URL(string: "https://tradies2quote.com/privacy")!)
                }
                Section {
                    Button("Allow AI processing") { Task { busy = true; defer { busy = false }; do { try await state.consent(true); dismiss() } catch { message = error.localizedDescription } } }.disabled(busy || state.capabilities["consentVersion"].string.isEmpty)
                    Button("Continue without AI") { dismiss() }
                    if busy { ProgressView() }
                    if let message { ErrorNotice(message: message) }
                }
            }.accessibilityIdentifier("consent.form").navigationTitle("AI permission").navigationBarTitleDisplayMode(.inline)
        }
    }
}

@Observable @MainActor final class VoiceRecorder {
    private var recorder: AVAudioRecorder?
    private var limitTask: Task<Void, Never>?
    var isRecording = false
    var file: URL?
    var message: String?
    func start() async {
        guard await AVAudioApplication.requestRecordPermission() else { message = "Microphone access is off. Enable it in iPhone Settings, or type your job description."; return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .spokenAudio); try session.setActive(true)
            let url = FileManager.default.temporaryDirectory.appending(path: "voice-\(UUID().uuidString).m4a")
            let recorder = try AVAudioRecorder(url: url, settings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1, AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue])
            guard recorder.record() else { throw ServiceError(status: 0, message: "Recording could not start.") }
            self.recorder = recorder; file = url;
            try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
            isRecording = true; message = nil
            limitTask = Task { try? await Task.sleep(for: .seconds(180)); if !Task.isCancelled { stop(); message = "Recording stopped after three minutes. You can transcribe this note." } }
        } catch { message = error.localizedDescription; stop() }
    }
    func stop() { recorder?.stop(); isRecording = false; limitTask?.cancel(); try? AVAudioSession.sharedInstance().setActive(false) }
    func cleanUp() { stop(); if let file { try? FileManager.default.removeItem(at: file) }; file = nil; recorder = nil }
}

struct VoiceCaptureView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @Binding var transcript: String
    @State private var recorder = VoiceRecorder()
    @State private var busy = false
    @State private var message: String?
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Describe the job, measurements, materials and client details you want on the quote.")
                    if recorder.isRecording { Label("Recording…", systemImage: "waveform").foregroundStyle(.red); Button("Stop recording") { recorder.stop() } }
                    else { Button(recorder.file == nil ? "Start recording" : "Record again", systemImage: "mic") { recorder.cleanUp(); Task { await recorder.start() } }.disabled(busy) }
                    if recorder.file != nil && !recorder.isRecording {
                        Button("Send to OpenAI and transcribe") { Task { await transcribe() } }.disabled(busy)
                    }
                    if busy { ProgressView("Transcribing…") }
                    if let message = message ?? recorder.message { ErrorNotice(message: message) }
                }
            }.navigationTitle("Voice note").toolbar { Button("Cancel") { dismiss() } }
        }.onDisappear { recorder.cleanUp() }
            .task {
                for await _ in NotificationCenter.default.notifications(named: AVAudioSession.interruptionNotification) { recorder.stop() }
            }
    }
    private func transcribe() async {
        guard let file = recorder.file else { return }; busy = true; defer { busy = false }
        do {
            let bytes = try Data(contentsOf: file)
            let response = try await state.api.upload("/api/quotes/transcribe", field: "audio", filename: "job.m4a", contentType: "audio/mp4", bytes: bytes)
            let text = response["transcript"].string.nonempty ?? response["text"].string
            guard !text.isEmpty else { throw ServiceError(status: 0, message: "No speech was found. Record again or type your description.") }
            transcript = [transcript, text].filter { !$0.isEmpty }.joined(separator: "\n")
            recorder.cleanUp(); dismiss()
        } catch { message = error.localizedDescription }
    }
}
