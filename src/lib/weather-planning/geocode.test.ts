import { describe, expect, it } from "vitest";
import { candidateQueries } from "./geocode";

describe("candidateQueries", () => {
  it("drops the street segment and strips NZ postcodes glued to the locality", () => {
    // The real-world shape that broke the weather sweep: open-meteo's
    // place-name search returns nothing for "Mount Maunganui 3116".
    expect(candidateQueries("12 Beach Rd, Mount Maunganui 3116")).toEqual([
      "Mount Maunganui",
    ]);
  });

  it("keeps locality, region pairs coarsest-first", () => {
    expect(
      candidateQueries("12 Example Street, Upper Hutt, Wellington, NZ"),
    ).toEqual(["Upper Hutt, Wellington", "Upper Hutt", "Wellington"]);
  });

  it("survives an address that is only a locality", () => {
    expect(candidateQueries("Tauranga")).toEqual(["Tauranga"]);
  });

  it("does not strip digits that are part of the place name itself", () => {
    // A trailing 4-digit token is a postcode; an embedded number is not.
    expect(candidateQueries("1 Main St, Palmerston North 4410")).toEqual([
      "Palmerston North",
    ]);
  });
});
