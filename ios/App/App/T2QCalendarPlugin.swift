import Capacitor
import EventKit
import EventKitUI
import UIKit

/// Put a booked job on the phone's own calendar (JS name "T2QCalendar").
///
/// Opens iOS's own "New Event" sheet, filled in with the job, so the person
/// picks the calendar and taps Add. From iOS 17 that sheet runs outside the
/// app and needs no permission: the app never reads the calendar. On iOS 15
/// and 16 the sheet needs permission first, which is asked for only at that
/// moment.
@objc(T2QCalendarPlugin)
public class T2QCalendarPlugin: CAPPlugin, CAPBridgedPlugin, EKEventEditViewDelegate {
    public let identifier = "T2QCalendarPlugin"
    public let jsName = "T2QCalendar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "addEvent", returnType: CAPPluginReturnPromise),
    ]

    private let store = EKEventStore()
    private var waiting: CAPPluginCall?

    /// The day `YYYY-MM-DD` as midnight on this phone's calendar, or nil.
    static func day(_ text: String) -> Date? {
        let parts = text.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, text.count == 10 else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone.current
        var parts3 = DateComponents()
        parts3.year = parts[0]
        parts3.month = parts[1]
        parts3.day = parts[2]
        guard let date = calendar.date(from: parts3),
              calendar.component(.day, from: date) == parts[2],
              calendar.component(.month, from: date) == parts[1] else { return nil }
        return date
    }

    /// `{ title, date: "YYYY-MM-DD", notes?, location? }` → an all-day event,
    /// resolving `{ saved }` once the sheet closes.
    @objc func addEvent(_ call: CAPPluginCall) {
        guard let title = call.getString("title")?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty,
              let text = call.getString("date"), let day = Self.day(text) else {
            call.reject("A title and a date (YYYY-MM-DD) are needed.")
            return
        }
        let notes = call.getString("notes")
        let location = call.getString("location")
        DispatchQueue.main.async {
            guard self.waiting == nil else {
                call.reject("The calendar is already open.")
                return
            }
            guard self.bridge?.viewController != nil else {
                call.reject("The calendar can't open right now.")
                return
            }
            self.waiting = call
            self.withAccess { allowed in
                guard allowed else {
                    self.finish(saved: false, error: "Calendar access was turned off for Tradies2Quote. Turn it on in Settings to add jobs to your calendar.")
                    return
                }
                let event = EKEvent(eventStore: self.store)
                event.title = title
                event.notes = notes
                event.location = location
                event.isAllDay = true
                event.startDate = day
                event.endDate = day
                event.calendar = self.store.defaultCalendarForNewEvents
                let sheet = EKEventEditViewController()
                sheet.eventStore = self.store
                sheet.event = event
                sheet.editViewDelegate = self
                self.bridge?.viewController?.present(sheet, animated: true)
            }
        }
    }

    /// iOS 17 and later: the sheet needs no permission. Before that, ask once.
    private func withAccess(_ then: @escaping (Bool) -> Void) {
        if #available(iOS 17.0, *) {
            then(true)
            return
        }
        switch EKEventStore.authorizationStatus(for: .event) {
        case .authorized:
            then(true)
        case .notDetermined:
            store.requestAccess(to: .event) { granted, _ in
                DispatchQueue.main.async { then(granted) }
            }
        default:
            then(false)
        }
    }

    private func finish(saved: Bool, error: String? = nil) {
        guard let call = waiting else { return }
        waiting = nil
        if let error {
            call.reject(error)
        } else {
            call.resolve(["saved": saved])
        }
    }

    public func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
        let saved = action == .saved
        controller.dismiss(animated: true) { [weak self] in
            self?.finish(saved: saved)
        }
    }
}
