import ActivityKit
import Foundation

/// The clock-in Live Activity (Dynamic Island and Lock Screen): "Clocked in"
/// with a timer that counts up from when work started.
///
/// This one file is compiled into BOTH the app (which starts, updates and
/// ends the activity, T2QClockActivityPlugin.swift) and the widget extension
/// (which draws it, T2QWidgets/). ActivityKit matches the two by this type's
/// name, so keep it in one place.
///
/// Nothing about the job or the client goes in here on purpose: the Lock
/// Screen is readable by anyone who picks the phone up. Open the app for the
/// rest.
@available(iOS 16.1, *)
struct T2QClockActivityAttributes: ActivityAttributes {
    /// What can change while it runs.
    struct ContentState: Codable, Hashable {
        /// When work started. The timer counts up from here without the app
        /// having to wake once a second.
        var startedAt: Date
    }

    /// The open time entry this belongs to. A different entry is a new activity.
    var entryId: String
}
