import { describe, expect, it, vi } from "vitest";

// Route modules are imported only to check which HTTP methods exist.
vi.mock("@/lib/supabase/admin", () => ({ adminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { quotePhotoEndpoints } from "./QuotePhotos";
import * as publicPhotosRoute from "@/app/api/quote/[token]/photos/route";
import * as ownerPhotosRoute from "@/app/api/quotes/[id]/photos/route";

describe("QuotePhotos — endpoints match the routes that exist", () => {
  it("the public quote link only lists photos (its route is GET-only)", () => {
    const { list, manage } = quotePhotoEndpoints({ token: "tok 1" });
    expect(list).toBe("/api/quote/tok%201/photos");
    expect(manage).toBeNull();
    expect(typeof publicPhotosRoute.GET).toBe("function");
    expect("POST" in publicPhotosRoute).toBe(false);
    expect("DELETE" in publicPhotosRoute).toBe(false);
  });

  it("the tradie's quote editor uploads and removes through the owner route", () => {
    const { list, manage } = quotePhotoEndpoints({ quoteId: "q-123" });
    expect(list).toBe("/api/quotes/q-123/photos");
    expect(manage).toBe("/api/quotes/q-123/photos");
    expect(typeof ownerPhotosRoute.POST).toBe("function");
    expect(typeof ownerPhotosRoute.DELETE).toBe("function");
  });
});
