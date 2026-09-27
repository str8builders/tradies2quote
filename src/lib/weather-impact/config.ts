import type { WeatherImpactContext, WeatherImpactTrade } from "./types";

/** A safe call in plain words (the weather sheet and the new-look weather page). */
export const ALL_CLEAR_REASON = "No weather limits right now.";

export const WEATHER_IMPACT_ADVISORY =
  "Advisory only — always assess site conditions before starting.";

export const DEFAULT_WEATHER_CONTEXT: WeatherImpactContext = {
  workingAtHeight: false,
  exposedSite: true,
  surfaceWet: false,
  usingLiftScaffoldLadder: false,
  pouringConcreteToday: false,
  exteriorFinishApplication: false,
};

export interface TradeProfile {
  label: string;
  baseRisk: number;
  outdoor: boolean;
  heightSensitive: boolean;
  rainSensitive: boolean;
  finishSensitive: boolean;
  groundSensitive: boolean;
  defaultSafeTasks: string[];
}

export const TRADE_PROFILES: Record<WeatherImpactTrade, TradeProfile> = {
  roofing: {
    label: "Roofing",
    baseRisk: 18,
    outdoor: true,
    heightSensitive: true,
    rainSensitive: true,
    finishSensitive: false,
    groundSensitive: false,
    defaultSafeTasks: ["Ground prep", "Material sorting", "Measure-up from safe access"],
  },
  painting_exterior: {
    label: "Painting (exterior)",
    baseRisk: 10,
    outdoor: true,
    heightSensitive: false,
    rainSensitive: true,
    finishSensitive: true,
    groundSensitive: false,
    defaultSafeTasks: ["Masking under cover", "Interior prep", "Client colour checks"],
  },
  concrete_slab: {
    label: "Concrete / slab",
    baseRisk: 12,
    outdoor: true,
    heightSensitive: false,
    rainSensitive: true,
    finishSensitive: false,
    groundSensitive: true,
    defaultSafeTasks: ["Set-out checks", "Steel inspection", "Formwork tidy-up"],
  },
  framing_carpentry: {
    label: "Framing / carpentry",
    baseRisk: 10,
    outdoor: true,
    heightSensitive: false,
    rainSensitive: false,
    finishSensitive: false,
    groundSensitive: false,
    defaultSafeTasks: ["Cut lists", "Ground-level assembly", "Indoor set-out"],
  },
  scaffolding_height: {
    label: "Scaffolding / working at height",
    baseRisk: 20,
    outdoor: true,
    heightSensitive: true,
    rainSensitive: true,
    finishSensitive: false,
    groundSensitive: false,
    defaultSafeTasks: ["Inspection paperwork", "Tag checks from ground", "Exclusion-zone setup"],
  },
  earthworks_digging: {
    label: "Earthworks / digging",
    baseRisk: 12,
    outdoor: true,
    heightSensitive: false,
    rainSensitive: true,
    finishSensitive: false,
    groundSensitive: true,
    defaultSafeTasks: ["Service-location checks", "Machine pre-start", "Traffic control setup"],
  },
  brick_block_laying: {
    label: "Brick / block laying",
    baseRisk: 10,
    outdoor: true,
    heightSensitive: false,
    rainSensitive: true,
    finishSensitive: true,
    groundSensitive: false,
    defaultSafeTasks: ["Dry cuts", "Set-out", "Material staging under cover"],
  },
  cladding_exterior: {
    label: "Cladding / exterior install",
    baseRisk: 12,
    outdoor: true,
    heightSensitive: false,
    rainSensitive: true,
    finishSensitive: true,
    groundSensitive: false,
    defaultSafeTasks: ["Flashing checks", "Pre-cutting under cover", "Fixing plan review"],
  },
  general_outdoor: {
    label: "General outdoor labour",
    baseRisk: 8,
    outdoor: true,
    heightSensitive: false,
    rainSensitive: false,
    finishSensitive: false,
    groundSensitive: false,
    defaultSafeTasks: ["Toolbox talk", "Material handling", "Low-risk ground tasks"],
  },
};

export const TRADE_OPTIONS = Object.entries(TRADE_PROFILES).map(
  ([value, profile]) => ({
    value: value as WeatherImpactTrade,
    label: profile.label,
  }),
);
