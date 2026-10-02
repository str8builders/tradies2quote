import ActivityKit
import SwiftUI
import WidgetKit

/// The brand orange (#FF5F15), the same as the app's.
private let brand = Color(red: 1.0, green: 0.373, blue: 0.082)
/// The app's dark ground (#111110).
private let ground = Color(red: 0.067, green: 0.067, blue: 0.063)

/// "Clocked in", with a timer that counts up from when work started.
///
/// - Lock Screen and banner: the words, the time work started, and the timer.
/// - Dynamic Island, compact: a stopwatch on the left, the timer on the right.
///   Minimal (another app shares the island): the stopwatch.
/// - Dynamic Island, expanded: the same, with room to read.
///
/// A tap anywhere opens the Timesheet (t2q://timesheet), where Finish is.
/// The timer is the system's own (`Text(timerInterval:)`), so it keeps
/// counting with the app closed. There are no buttons: finishing asks for the
/// break and the client, which belongs in the app.
@available(iOS 16.2, *)
struct T2QClockLiveActivity: Widget {
    private static let timesheet = URL(string: "t2q://timesheet")!

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: T2QClockActivityAttributes.self) { context in
            LockScreenClock(startedAt: context.state.startedAt)
                .activityBackgroundTint(ground)
                .activitySystemActionForegroundColor(.white)
                .widgetURL(Self.timesheet)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "stopwatch.fill")
                        .font(.title2)
                        .foregroundStyle(brand)
                        .padding(.leading, 4)
                        .accessibilityHidden(true)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    ElapsedTimer(startedAt: context.state.startedAt, font: .title2.weight(.semibold))
                        .frame(width: 104, alignment: .trailing)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Clocked in")
                                .font(.headline)
                            HStack(spacing: 4) {
                                Text("Since")
                                Text(context.state.startedAt, style: .time)
                            }
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 8)
                        Text("Tap to open")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 4)
                    .accessibilityElement(children: .combine)
                }
            } compactLeading: {
                Image(systemName: "stopwatch.fill")
                    .foregroundStyle(brand)
                    .accessibilityLabel("Clocked in")
            } compactTrailing: {
                ElapsedTimer(startedAt: context.state.startedAt, font: .caption.weight(.semibold))
                    .frame(width: 52, alignment: .trailing)
            } minimal: {
                Image(systemName: "stopwatch.fill")
                    .foregroundStyle(brand)
                    .accessibilityLabel("Clocked in")
            }
            .keylineTint(brand)
            .widgetURL(Self.timesheet)
        }
    }
}

/// A count-up timer from `startedAt`, as digits ("12:04", then "2:14:09" past
/// the hour). It uses `Text(timerInterval:)`: `Text(date, style: .timer)` on a
/// past date came out as words ("2 hours, 14 minutes") on iOS 26. The interval
/// is twelve hours long, past the 8 hours iOS lets an activity run. A fixed
/// frame and monospaced digits keep it from jumping about or taking the whole
/// width: a timer text grows to fill whatever it is given.
@available(iOS 16.1, *)
private struct ElapsedTimer: View {
    let startedAt: Date
    let font: Font

    var body: some View {
        Text(timerInterval: startedAt...startedAt.addingTimeInterval(12 * 60 * 60), pauseTime: nil, countsDown: false, showsHours: true)
            .font(font)
            .monospacedDigit()
            .multilineTextAlignment(.trailing)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .foregroundStyle(.white)
    }
}

@available(iOS 16.1, *)
private struct LockScreenClock: View {
    @Environment(\.isLuminanceReduced) private var dimmed
    let startedAt: Date

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "stopwatch.fill")
                .font(.title2)
                .foregroundStyle(ground)
                .frame(width: 44, height: 44)
                .background(brand, in: Circle())
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text("Clocked in")
                    .font(.headline)
                    .foregroundStyle(.white)
                HStack(spacing: 4) {
                    Text("Since")
                    Text(startedAt, style: .time)
                }
                .font(.subheadline)
                .foregroundStyle(.white.opacity(dimmed ? 0.5 : 0.72))
            }

            Spacer(minLength: 8)

            ElapsedTimer(startedAt: startedAt, font: .title.weight(.semibold))
                .frame(width: 118, alignment: .trailing)
        }
        .padding(16)
        .accessibilityElement(children: .combine)
    }
}
