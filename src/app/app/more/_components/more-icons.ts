import type { Icon } from "@phosphor-icons/react";
import {
  AddressBook,
  Bug,
  CalendarBlank,
  ChatCircleDots,
  CreditCard,
  Gauge,
  Lifebuoy,
  Pulse,
  Robot,
  Scroll,
  ShieldCheck,
  SlidersHorizontal,
  Storefront,
  Tag,
  UserCircle,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import type { MoreItemId } from "../_lib/menu";

/** One icon per More row, shared by the More screen and the account sheet. */
export const MORE_ICON: Readonly<Record<MoreItemId, Icon>> = {
  clients: AddressBook,
  prices: Tag,
  calendar: CalendarBlank,
  business: Storefront,
  rates: SlidersHorizontal,
  payments: CreditCard,
  account: UserCircle,
  team: UsersThree,
  help: Lifebuoy,
  feedback: ChatCircleDots,
  privacy: ShieldCheck,
  terms: Scroll,
  agents: Robot,
  debug: Bug,
  monitor: Pulse,
  ops: Gauge,
};
