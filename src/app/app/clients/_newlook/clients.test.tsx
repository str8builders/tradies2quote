// Clients (/app/clients): the new-look switch, the new list and edit sheet
// rendered to static HTML in node from a scripted address book, the shared
// search rule, and the old page still rendering as before.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ on: false, user: { id: "user-1" } as { id: string } | null }));

vi.mock("@/lib/ui/newLook", () => ({ isNewLookOn: async () => env.on }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: env.user } }) } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("@/app/app/_components/AppHeader", () => ({ AppHeader: () => null }));

import ClientsPage from "../page";
import { AppHeader } from "@/app/app/_components/AppHeader";
import { Screen } from "@/components/ui/screen";
import { ClientsManager } from "../ClientsManager";
import { EMPTY_CLIENT_FORM, clientFormFor, searchClients, type ClientsBook, type SavedClient } from "../_lib/useClientsBook";
import { ClientEditSheet } from "./ClientEditSheet";
import { ClientsBook as ClientsBookLive, ClientsBookView, clientContactLine, sharingLine } from "./ClientsBook";

function findAll(node: unknown, type: unknown): ReactElement<Record<string, unknown>>[] {
  const found: ReactElement<Record<string, unknown>>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object" || !("props" in value)) return;
    const element = value as ReactElement<Record<string, unknown>>;
    if (element.type === type) found.push(element);
    for (const prop of Object.values(element.props ?? {})) visit(prop);
  };
  visit(node);
  return found;
}

const CLIENTS: SavedClient[] = [
  { id: "c1", name: "Aroha Smith", email: "aroha@example.nz", phone: "021 555 0101", address: "12 Rata St, Tauranga" },
  { id: "c2", name: "Ben Tait", email: null, phone: null, address: null },
];

const noop = () => {};
function book(over: Partial<ClientsBook> = {}): ClientsBook {
  const clients = over.clients ?? CLIENTS;
  const search = over.search ?? "";
  return {
    clients,
    shared: false,
    search,
    setSearch: noop,
    form: EMPTY_CLIENT_FORM,
    setForm: noop,
    error: "",
    setError: noop,
    notice: "",
    busy: false,
    loaded: true,
    load: async () => {},
    save: async () => true,
    visible: searchClients(clients, search),
    ...over,
  };
}
const view = (over: Partial<ClientsBook> = {}) => renderToStaticMarkup(<ClientsBookView book={book(over)} />);

beforeEach(() => {
  env.on = false;
  env.user = { id: "user-1" };
});

describe("/app/clients switch", () => {
  it("off: the old page and manager, unchanged", async () => {
    const tree = (await ClientsPage()) as ReactElement<{ className: string }>;
    expect(tree.props.className).toBe("min-h-screen text-white");
    expect(findAll(tree, ClientsManager)).toHaveLength(1);
    expect(findAll(tree, ClientsBookLive)).toHaveLength(0);
  });

  it("on: the new list under the shared top bar", async () => {
    env.on = true;
    const tree = (await ClientsPage()) as ReactElement;
    expect(tree.type).toBe(Screen);
    expect(findAll(tree, AppHeader).map((el) => el.props.context)).toEqual(["Clients"]);
    expect(findAll(tree, ClientsBookLive)).toHaveLength(1);
    expect(findAll(tree, ClientsManager)).toHaveLength(0);
  });

  it("signed out goes to the login page either way", async () => {
    env.user = null;
    await expect(ClientsPage()).rejects.toThrow("NEXT_REDIRECT /login");
    env.on = true;
    await expect(ClientsPage()).rejects.toThrow("NEXT_REDIRECT /login");
  });
});

describe("ClientsBookView (new look)", () => {
  it("lists every client as a big tappable row with their details", () => {
    const html = view();
    expect(html).toContain('data-testid="clients-list"');
    expect(html).toMatch(/<button type="button"[^>]*min-h-16/);
    expect(html).toContain("Aroha Smith");
    expect(html).toContain("aroha@example.nz · 021 555 0101");
    expect(html).toContain("12 Rata St, Tauranga");
    expect(html).toContain("No contact details yet");
    expect(html).toContain(">AS<");
    expect(html).toContain('data-testid="clients-add"');
    expect(html).toContain('data-testid="clients-search"');
    expect(html).toContain(sharingLine(false));
  });

  it("says when the list is shared with the team", () => {
    expect(view({ shared: true })).toContain(sharingLine(true));
  });

  it("while loading: a status line, no list", () => {
    const html = view({ loaded: false, clients: [], visible: [] });
    expect(html).toContain("Loading clients…");
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('data-testid="clients-list"');
  });

  it("a failed load says why and offers another go", () => {
    const html = view({ loaded: false, clients: [], visible: [], error: "Clients could not be loaded. Please retry." });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Clients could not be loaded. Please retry.");
    expect(html).toContain("Try again");
  });

  it("no clients yet: an empty state with the way forward", () => {
    const html = view({ clients: [], visible: [] });
    expect(html).toContain("No clients yet");
    expect(html.match(/data-testid="clients-add"/g)).toHaveLength(1);
  });

  it("a search with no match says so", () => {
    expect(view({ search: "zzz" })).toContain("No matching clients");
  });

  it("a saved client is confirmed", () => {
    const html = view({ notice: "Client saved. You can select this client when reviewing a quote." });
    expect(html).toMatch(/role="status"[\s\S]*Client saved\./);
  });

  it("uses the new look only", () => {
    expect(view()).not.toMatch(/t2q-|font-mono|uppercase|bg-ink-|text-white|\/\/ /);
  });
});

describe("ClientEditSheet (new look)", () => {
  const sheet = (form = EMPTY_CLIENT_FORM, error = "") =>
    renderToStaticMarkup(
      <ClientEditSheet open form={form} onChange={noop} onSave={noop} onClose={noop} busy={false} error={error} />,
    );

  it("adds a client with the old form's four boxes and limits", () => {
    const html = sheet();
    expect(html).toContain("Add a client");
    const name = html.match(/<input[^>]*data-testid="client-name"[^>]*>/)?.[0] ?? "";
    expect(name).toContain("required");
    expect(name).toContain('maxLength="150"');
    expect(html).toMatch(/<input[^>]*type="email"[^>]*maxLength="254"/);
    expect(html).toMatch(/<input[^>]*type="tel"[^>]*maxLength="100"/);
    expect(html).toContain('maxLength="500"');
  });

  it("the footer's Save submits the sheet's form", () => {
    const html = sheet();
    const formId = html.match(/<form id="([^"]+)"/)?.[1];
    expect(formId).toBeTruthy();
    const save = html.match(/<button[^>]*data-testid="client-save"[^>]*>/)?.[0] ?? "";
    expect(save).toContain('type="submit"');
    expect(save).toContain(`form="${formId}"`);
  });

  it("edits a saved client, and shows why a save failed", () => {
    const html = sheet(clientFormFor(CLIENTS[0]), "Enter a valid email address.");
    expect(html).toContain("Edit client");
    expect(html).toContain('value="Aroha Smith"');
    expect(html).toMatch(/role="alert"[\s\S]*Enter a valid email address\./);
  });
});

describe("the address book rules", () => {
  it("search matches any detail, any case", () => {
    expect(searchClients(CLIENTS, "RATA").map((c) => c.id)).toEqual(["c1"]);
    expect(searchClients(CLIENTS, "ben").map((c) => c.id)).toEqual(["c2"]);
    expect(searchClients(CLIENTS, "")).toHaveLength(2);
  });

  it("a saved client opens with blanks for missing details", () => {
    expect(clientFormFor(CLIENTS[1])).toEqual({ id: "c2", name: "Ben Tait", email: "", phone: "", address: "" });
    expect(clientContactLine(CLIENTS[1])).toBe("");
  });
});

describe("the old manager is unchanged", () => {
  it("still renders its dark form and search box", () => {
    const html = renderToStaticMarkup(<ClientsManager />);
    expect(html).toContain("t2q-card-pro");
    expect(html).toContain("Add a client");
    expect(html).toContain("Loading clients…");
    expect(html).toContain("Search name, email, phone or address");
  });
});
