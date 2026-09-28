import { describe, expect, it } from "vitest";
import { loadAllMaterials } from "./loadLibrary";

type Call = { select: string; order: Array<[string, boolean]>; range: [number, number] };

/** A minimal Supabase-shaped stub: one page of rows per `.range()` call. */
function fakeSupabase(pages: unknown[][], opts: { errorOnPage?: number } = {}) {
  const calls: Call[] = [];
  let pageIndex = 0;
  const client = {
    from: (_table: string) => {
      const call: Call = { select: "", order: [], range: [0, 0] };
      const builder = {
        select: (s: string) => {
          call.select = s;
          return builder;
        },
        eq: (_col: string, _val: unknown) => builder,
        order: (col: string, o: { ascending?: boolean }) => {
          call.order.push([col, o.ascending ?? true]);
          return builder;
        },
        range: async (from: number, to: number) => {
          call.range = [from, to];
          calls.push(call);
          const idx = pageIndex++;
          if (opts.errorOnPage === idx) {
            return { data: null, error: new Error("read failed") };
          }
          return { data: pages[idx] ?? [], error: null };
        },
      };
      return builder;
    },
  };
  return { client, calls };
}

describe("loadAllMaterials", () => {
  it("returns a single short page in one request", async () => {
    const { client, calls } = fakeSupabase([[{ id: "a" }, { id: "b" }]]);
    const rows = await loadAllMaterials(client as never, "user-1", { select: "id" });
    expect(rows).toEqual([{ id: "a" }, { id: "b" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].range).toEqual([0, 999]);
  });

  it("pages past 1,000 rows instead of silently truncating", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `a${i}` }));
    const page2 = [{ id: "last" }];
    const { client, calls } = fakeSupabase([page1, page2]);
    const rows = await loadAllMaterials(client as never, "user-1", { select: "id" });
    expect(rows).toHaveLength(1001);
    expect(rows[1000]).toEqual({ id: "last" });
    expect(calls).toHaveLength(2);
    expect(calls[0].range).toEqual([0, 999]);
    expect(calls[1].range).toEqual([1000, 1999]);
  });

  it("stops at the hard cap rather than paging forever", async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ id: `x${i}` }));
    // Ten full pages, never a short one — every one of these would return
    // more if asked, so only the cap can be what stops the loop.
    const { client, calls } = fakeSupabase(Array.from({ length: 10 }, () => fullPage));
    const rows = await loadAllMaterials(client as never, "user-1", { select: "id" });
    expect(rows).toHaveLength(10_000);
    expect(calls).toHaveLength(10);
  });

  it("defaults to ordering by id when no order is given", async () => {
    const { client, calls } = fakeSupabase([[]]);
    await loadAllMaterials(client as never, "user-1", { select: "id" });
    expect(calls[0].order).toEqual([["id", true]]);
  });

  it("applies every order clause given, then id asc as the final tiebreaker", async () => {
    const { client, calls } = fakeSupabase([[]]);
    await loadAllMaterials(client as never, "user-1", {
      select: "id, name",
      order: [
        { column: "usage_count", ascending: false },
        { column: "name", ascending: true },
      ],
    });
    // .range() pagination only works when the ORDER BY is unique — without
    // id last, rows tied on usage_count could land on both pages or neither.
    expect(calls[0].order).toEqual([
      ["usage_count", false],
      ["name", true],
      ["id", true],
    ]);
    expect(calls[0].select).toBe("id, name");
  });

  it("never orders by id twice when the caller already included it", async () => {
    const { client, calls } = fakeSupabase([[]]);
    await loadAllMaterials(client as never, "user-1", {
      select: "id, name",
      order: [
        { column: "id", ascending: false },
        { column: "name", ascending: true },
      ],
    });
    expect(calls[0].order).toEqual([
      ["id", false],
      ["name", true],
    ]);
  });

  it("throws on a read error instead of returning a partial, silent result", async () => {
    const { client } = fakeSupabase([[]], { errorOnPage: 0 });
    await expect(loadAllMaterials(client as never, "user-1", { select: "id" })).rejects.toThrow(
      "read failed",
    );
  });
});
