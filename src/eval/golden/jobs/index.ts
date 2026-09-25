import type { GoldenJob } from "../types";
import { CLADDING_JOBS } from "./cladding";
import { DECK_JOBS } from "./decks";
import { MONEY_JOBS } from "./money";
import { OUTDOOR_JOBS } from "./outdoor";
import { WALL_JOBS } from "./walls";

/** Every golden job, in report order. */
export const GOLDEN_JOBS: GoldenJob[] = [
  ...WALL_JOBS,
  ...DECK_JOBS,
  ...CLADDING_JOBS,
  ...OUTDOOR_JOBS,
  ...MONEY_JOBS,
];
