import SwiftUI
import WidgetKit

/// Tradies2Quote's widget extension. Today it holds one thing: the clock-in
/// Live Activity. It needs iOS 16.2, so on an older iPhone the bundle is empty
/// and the app simply never starts an activity.
@main
struct T2QWidgetsBundle: WidgetBundle {
    var body: some Widget {
        T2QClockLiveActivity()
    }
}
