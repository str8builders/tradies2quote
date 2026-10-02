import Capacitor
import Contacts
import ContactsUI
import UIKit

/// Choose a client from the phone's contacts (JS name "T2QContacts").
///
/// Opens iOS's own contact picker. It runs outside the app and needs no
/// permission: the app never sees the address book, only the one contact the
/// person taps, and only the name, number, email and address it fills in.
@objc(T2QContactsPlugin)
public class T2QContactsPlugin: CAPPlugin, CAPBridgedPlugin, CNContactPickerDelegate {
    public let identifier = "T2QContactsPlugin"
    public let jsName = "T2QContacts"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise),
    ]

    private var waiting: CAPPluginCall?

    /// Opens the picker and resolves `{ name, company, phone, email, address }`
    /// for the contact tapped (any of them may be an empty string), or
    /// `{ cancelled: true }`.
    @objc func pick(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.waiting == nil else {
                call.reject("The contacts are already open.")
                return
            }
            guard let host = self.bridge?.viewController else {
                call.reject("The contacts can't open right now.")
                return
            }
            self.waiting = call
            let picker = CNContactPickerViewController()
            picker.delegate = self
            host.present(picker, animated: true)
        }
    }

    public func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
        let details = Self.details(of: contact)
        let call = waiting
        waiting = nil
        call?.resolve(details)
    }

    public func contactPickerDidCancel(_ picker: CNContactPickerViewController) {
        let call = waiting
        waiting = nil
        call?.resolve(["cancelled": true])
    }

    /// What the quote needs from a contact. Every field is read only when the
    /// picker supplied it (reading one it didn't would crash).
    static func details(of contact: CNContact) -> [String: Any] {
        func has(_ key: String) -> Bool { contact.isKeyAvailable(key) }
        let given = has(CNContactGivenNameKey) ? contact.givenName : ""
        let family = has(CNContactFamilyNameKey) ? contact.familyName : ""
        let company = has(CNContactOrganizationNameKey) ? contact.organizationName : ""
        let name = [given, family].filter { !$0.isEmpty }.joined(separator: " ")

        var phone = ""
        if has(CNContactPhoneNumbersKey) {
            let numbers = contact.phoneNumbers
            let mobile = numbers.first { $0.label == CNLabelPhoneNumberMobile || $0.label == CNLabelPhoneNumberiPhone }
            phone = (mobile ?? numbers.first)?.value.stringValue ?? ""
        }
        let email = has(CNContactEmailAddressesKey) ? (contact.emailAddresses.first?.value as String? ?? "") : ""

        var address = ""
        if has(CNContactPostalAddressesKey), let postal = contact.postalAddresses.first?.value {
            address = CNPostalAddressFormatter.string(from: postal, style: .mailingAddress)
                .split(whereSeparator: \.isNewline)
                .joined(separator: ", ")
        }
        return ["name": name, "company": company, "phone": phone, "email": email, "address": address]
    }
}
