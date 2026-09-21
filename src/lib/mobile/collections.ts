import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getTeamContext } from "@/lib/team";
import { MobileError, pageOffset, uuid } from "./contracts";

const collections = {
  clients: { columns: "id,name,email,phone,address", sort: "name" },
  quotes: { columns: "id,status,quote_data,total_amount,currency,created_at,updated_at,revision,scheduled_for,voice_transcript,public_token,chat_disabled,archived_at,deleted_at", sort: "created_at" },
  invoices: { columns: "*", sort: "created_at" },
  materials: { columns: "*", sort: "name" },
  requests: { table: "quote_requests", columns: "*", sort: "created_at" },
  notes: { table: "calendar_notes", columns: "*", sort: "note_date" },
  kits: { columns: "*,kit_items(*)", sort: "name" },
} as const;

export async function readCollection(name: string, userId: string, search: URLSearchParams, id?: string) {
  if (!Object.hasOwn(collections, name)) throw new MobileError(404, "Unknown collection.");
  const config = collections[name as keyof typeof collections];
  const db = await createClient();
  const ownerID = name === "clients" ? (await getTeamContext(userId)).clientOwnerId : userId;
  let query = db.from("table" in config ? config.table : name).select(config.columns).eq("user_id", ownerID);
  if (name === "quotes" || name === "invoices") query = query.is("deleted_at", null);
  if (id) {
    const { data, error } = await query.eq("id", uuid(id)).maybeSingle();
    if (error) throw error;
    if (!data) throw new MobileError(404, "This record is not available to your account.");
    return { item: data };
  }
  const offset = pageOffset(search.get("offset"));
  const { data, error } = await query.order(config.sort, { ascending: ["clients", "materials", "kits", "notes"].includes(name) }).order("id").range(offset, offset + 99);
  if (error) throw error;
  return { items: data ?? [], nextOffset: data?.length === 100 ? offset + 100 : null };
}
