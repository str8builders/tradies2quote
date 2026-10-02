/**
 * Choose a client from the phone's contacts (browser code). The Swift side
 * (T2QContactsPlugin.swift) opens iOS's own contact picker, which runs outside
 * the app: no permission is asked and the app sees only the one contact the
 * person taps.
 */

import { registerPlugin } from "@capacitor/core";
import { hasNativeModule } from "./plugins";

export interface PickedContact {
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
}

interface T2QContactsPlugin {
  pick(): Promise<Partial<PickedContact> & { cancelled?: boolean }>;
}

const T2QContacts = registerPlugin<T2QContactsPlugin>("T2QContacts");

export function hasNativeContacts(): boolean {
  return hasNativeModule("T2QContacts");
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** The contact the person tapped, or null (they backed out, or it isn't available). Never throws. */
export async function pickContact(): Promise<PickedContact | null> {
  if (!hasNativeContacts()) return null;
  try {
    const picked = await T2QContacts.pick();
    if (picked.cancelled) return null;
    const contact = {
      name: text(picked.name),
      company: text(picked.company),
      phone: text(picked.phone),
      email: text(picked.email),
      address: text(picked.address),
    };
    return Object.values(contact).some(Boolean) ? contact : null;
  } catch {
    return null;
  }
}
