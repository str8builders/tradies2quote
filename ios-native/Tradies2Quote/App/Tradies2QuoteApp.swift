import SwiftUI

@main
struct Tradies2QuoteApp: App {
    @UIApplicationDelegateAdaptor(NativeAppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var phase
    @State private var state = AppState()
    var body: some Scene {
        WindowGroup {
            Group {
                if state.isStarting { ProgressView("Opening Tradies2Quote…") }
                else if state.accountID == nil { AuthView() }
                else { MainTabs().id(state.accountID) }
            }
            .environment(state)
            .tint(Color(red: 1, green: 0.373, blue: 0.082))
            .task { appDelegate.state = state; await state.start() }
            .task { await state.observePurchases() }
            .task { await state.observeAuth() }
            .onChange(of: phase) { if phase == .active, state.accountID != nil { Task { await state.refreshAccount(); await state.reconcilePurchases() } } }
            .onOpenURL { url in Task { await state.open(url) } }
            .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                if let url = activity.webpageURL { Task { await state.open(url) } }
            }
        }
    }
}
