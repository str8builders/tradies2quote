import {
  DEFAULT_WEATHER_CONTEXT,
  TRADE_PROFILES,
  WEATHER_IMPACT_ADVISORY,
} from "./config";
import type {
  TriggeredWeatherRule,
  WeatherForecastWindow,
  WeatherImpactContext,
  WeatherImpactInput,
  WeatherImpactResult,
  WeatherImpactTrade,
} from "./types";

/** The engine's reason when no weather rule fires (the call is safe). */
export const NO_THRESHOLDS_REASON = "No deterministic weather thresholds were triggered for the selected trade.";

const REQUIRED_FIELDS: Array<keyof WeatherImpactInput> = [
  "rainProbabilityPct",
  "precipitationMmPerHour",
  "windSpeedKph",
  "windGustKph",
  "thunderstormRisk",
  "temperatureC",
  "feelsLikeC",
  "humidityPct",
];

export function evaluateWeatherImpact({
  trade,
  weather,
  context = DEFAULT_WEATHER_CONTEXT,
}: {
  trade: WeatherImpactTrade;
  weather: WeatherImpactInput;
  context?: Partial<WeatherImpactContext>;
}): WeatherImpactResult {
  const profile = TRADE_PROFILES[trade];
  const site = { ...DEFAULT_WEATHER_CONTEXT, ...context };
  const rules: TriggeredWeatherRule[] = [];
  const missingFields = REQUIRED_FIELDS.filter((field) => weather[field] == null);
  const heightWork =
    profile.heightSensitive || site.workingAtHeight || site.usingLiftScaffoldLadder;
  const finishWork = profile.finishSensitive || site.exteriorFinishApplication;
  const concreteWork = trade === "concrete_slab" || site.pouringConcreteToday;
  const groundWork = profile.groundSensitive || trade === "earthworks_digging";

  if (missingFields.length > 0) {
    addRule(rules, {
      id: "missing-weather-data",
      status: "caution",
      score: Math.min(28, 10 + missingFields.length * 3),
      reason: `Weather data is incomplete (${formatMissingFields(missingFields)}), so this check cannot honestly call the site safe.`,
      controls: [
        "Confirm conditions on site before starting.",
        "Update the missing weather values or use a current local forecast.",
      ],
      blockedTasks: [],
      safeTasks: ["Planning", "pricing", "client calls", "materials prep"],
    });
  }

  if (weather.thunderstormRisk === true && profile.outdoor) {
    addRule(rules, {
      id: "lightning-outdoor-hard-stop",
      status: "unsafe",
      score: 100,
      reason: "Lightning or thunderstorm risk is present for outdoor work.",
      controls: [
        "Stop outdoor work and move people away from exposed areas.",
        "Restart only after the storm has clearly passed and site conditions are reassessed.",
      ],
      blockedTasks: ["All outdoor work", "height work", "machine operation in exposed areas"],
      safeTasks: ["Indoor admin", "covered workshop prep"],
    });
  }

  const gust = weather.windGustKph;
  const wind = weather.windSpeedKph;
  if (heightWork && gust != null) {
    if (gust >= 45) {
      addRule(rules, {
        id: "height-gust-hard-stop",
        status: "unsafe",
        score: 88,
        reason: `Wind gusts are ${round(gust)} kph, which is too high for roof, ladder, scaffold, or lift work.`,
        controls: [
          "Postpone work at height.",
          "Secure loose materials and check edge protection before leaving site.",
        ],
        blockedTasks: ["Roof work", "ladder work", "scaffold/lift use", "lifting sheets at height"],
        safeTasks: ["Ground-level prep", "material checks", "paperwork"],
      });
    } else if (gust >= 35) {
      addRule(rules, {
        id: "height-gust-caution",
        status: "caution",
        score: 48,
        reason: `Wind gusts are ${round(gust)} kph, close to the caution range for height work.`,
        controls: [
          "Limit sheet handling and exposed edges.",
          "Recheck access equipment and pause if gusts lift again.",
        ],
        blockedTasks: [],
        safeTasks: profile.defaultSafeTasks,
      });
    }
  }

  if (!heightWork && gust != null) {
    const unsafeGust = site.exposedSite ? 58 : 65;
    const cautionGust = site.exposedSite ? 40 : 48;
    if (gust >= unsafeGust) {
      addRule(rules, {
        id: "exposed-gust-hard-stop",
        status: "unsafe",
        score: 72,
        reason: `Wind gusts are ${round(gust)} kph on ${site.exposedSite ? "an exposed" : "a"} site.`,
        controls: ["Secure materials.", "Avoid lifting sheets, panels, or long lengths."],
        blockedTasks: ["Panel lifting", "sheet handling", "unsecured elevated work"],
        safeTasks: ["Low-level prep", "site tidy if sheltered"],
      });
    } else if (gust >= cautionGust) {
      addRule(rules, {
        id: "exposed-gust-caution",
        status: "caution",
        score: 34,
        reason: `Wind gusts are ${round(gust)} kph, enough to affect handling and balance.`,
        controls: ["Use extra hands for sheets.", "Keep loose materials tied down."],
        blockedTasks: [],
        safeTasks: profile.defaultSafeTasks,
      });
    }
  }

  if (site.usingLiftScaffoldLadder && gust != null) {
    if (gust >= 40) {
      addRule(rules, {
        id: "access-equipment-gust-hard-stop",
        status: "unsafe",
        score: 82,
        reason: `Access equipment is selected and gusts are ${round(gust)} kph.`,
        controls: ["Do not use ladders, scaffold, or lifts until wind drops.", "Review manufacturer and site limits."],
        blockedTasks: ["Ladder work", "scaffold changes", "lift operation"],
        safeTasks: ["Ground-level setup", "materials prep"],
      });
    } else if (gust >= 30) {
      addRule(rules, {
        id: "access-equipment-gust-caution",
        status: "caution",
        score: 36,
        reason: `Access equipment is selected and gusts are ${round(gust)} kph.`,
        controls: ["Keep a spotter nearby.", "Stop if gusts increase or materials start to move."],
        blockedTasks: [],
        safeTasks: profile.defaultSafeTasks,
      });
    }
  }

  if (wind != null && wind >= 40 && profile.outdoor) {
    addRule(rules, {
      id: "sustained-wind-caution",
      status: "caution",
      score: 26,
      reason: `Sustained wind is ${round(wind)} kph, which can make outdoor handling harder even without stronger gusts.`,
      controls: ["Reduce exposed handling.", "Keep materials weighted or tied down."],
      blockedTasks: [],
      safeTasks: profile.defaultSafeTasks,
    });
  }

  const rainProb = weather.rainProbabilityPct;
  const rain = weather.precipitationMmPerHour;
  if (finishWork) {
    if ((rain ?? 0) > 0.2 || (rainProb ?? 0) >= 50) {
      addRule(rules, {
        id: "finish-rain-hard-stop",
        status: "unsafe",
        score: 76,
        reason: "Rain risk is too high for exterior paint, coatings, adhesives, mortar finish, or cladding seal work.",
        controls: [
          "Keep finish work under cover or reschedule.",
          "Check substrate moisture before applying product.",
        ],
        blockedTasks: ["Exterior coating", "paint application", "sealant/adhesive work"],
        safeTasks: ["Masking", "dry prep", "cutting under cover"],
      });
    }
    if ((weather.humidityPct ?? 0) >= 90) {
      addRule(rules, {
        id: "finish-humidity-hard-stop",
        status: "unsafe",
        score: 64,
        reason: `Humidity is ${round(weather.humidityPct)}%, which can stop exterior finishes curing properly.`,
        controls: ["Delay finish application.", "Check product data sheets and surface moisture."],
        blockedTasks: ["Exterior paint/coating", "adhesive/sealant application"],
        safeTasks: ["Prep under cover", "surface cleaning if dry enough"],
      });
    } else if ((weather.humidityPct ?? 0) >= 82) {
      addRule(rules, {
        id: "finish-humidity-caution",
        status: "caution",
        score: 28,
        reason: `Humidity is ${round(weather.humidityPct)}%, so drying and curing may be slow.`,
        controls: ["Allow extra drying time.", "Check product limits before applying."],
        blockedTasks: [],
        safeTasks: profile.defaultSafeTasks,
      });
    }
  }

  if (!finishWork && profile.rainSensitive) {
    if ((rain ?? 0) >= 5 || (rainProb ?? 0) >= 85) {
      addRule(rules, {
        id: "heavy-rain-hard-stop",
        status: "unsafe",
        score: 72,
        reason: "Heavy or very likely rain is expected for rain-sensitive outdoor work.",
        controls: ["Delay exposed work.", "Protect materials and incomplete work."],
        blockedTasks: ["Exposed outdoor work", "work on slippery surfaces"],
        safeTasks: profile.defaultSafeTasks,
      });
    } else if ((rain ?? 0) >= 1 || (rainProb ?? 0) >= 55) {
      addRule(rules, {
        id: "rain-sensitive-caution",
        status: "caution",
        score: 30,
        reason: "Rain risk may affect quality, footing, and material handling.",
        controls: ["Keep dry materials covered.", "Reassess surface condition before starting."],
        blockedTasks: [],
        safeTasks: profile.defaultSafeTasks,
      });
    }
  } else if ((rain ?? 0) >= 5 && profile.outdoor) {
    addRule(rules, {
      id: "general-heavy-rain-caution",
      status: "caution",
      score: 34,
      reason: "Heavy rain can reduce visibility, traction, and site access.",
      controls: ["Slow the work down.", "Keep traffic/access paths clear.", "Stop if ground becomes unstable."],
      blockedTasks: [],
      safeTasks: profile.defaultSafeTasks,
    });
  }

  if (site.surfaceWet) {
    addRule(rules, {
      id: heightWork ? "wet-height-hard-stop" : "wet-surface-caution",
      status: heightWork ? "unsafe" : "caution",
      score: heightWork ? 82 : 30,
      reason: heightWork
        ? "The surface is already wet or slippery and the selected work includes height/access risk."
        : "The surface is already wet or slippery.",
      controls: [
        "Reassess footing before starting.",
        heightWork ? "Postpone height/access work until the surface is dry." : "Use slip controls and reduce pace.",
      ],
      blockedTasks: heightWork ? ["Roof work", "ladder work", "scaffold/lift use"] : [],
      safeTasks: ["Ground-level prep", "covered work", "admin"],
    });
  }

  if (concreteWork) {
    if ((rain ?? 0) >= 3 || (rainProb ?? 0) >= 75) {
      addRule(rules, {
        id: "concrete-rain-hard-stop",
        status: "unsafe",
        score: 72,
        reason: "Rain risk is high enough to threaten concrete placing, finishing, or surface quality.",
        controls: ["Delay the pour or arrange proper cover.", "Confirm pump/truck timing against the next dry window."],
        blockedTasks: ["Pouring slab", "final finishing", "exposed screed work"],
        safeTasks: ["Formwork checks", "steel checks", "site setup"],
      });
    } else if ((rain ?? 0) >= 0.5 || (rainProb ?? 0) >= 40) {
      addRule(rules, {
        id: "concrete-rain-caution",
        status: "caution",
        score: 38,
        reason: "Rain may affect concrete placing or finishing.",
        controls: ["Have cover ready.", "Check timing and drainage before committing to the pour."],
        blockedTasks: [],
        safeTasks: ["Prep and inspection tasks"],
      });
    }
  }

  if (groundWork) {
    if ((rain ?? 0) >= 6 || (weather.visibilityKm ?? 99) <= 2) {
      addRule(rules, {
        id: "groundwork-heavy-rain-visibility-hard-stop",
        status: "unsafe",
        score: 70,
        reason: "Ground conditions or visibility may be unsafe for digging, machinery, or traffic control.",
        controls: ["Stop machine work if ground is unstable.", "Check trenches, edges, and access routes."],
        blockedTasks: ["Digging", "machine operation", "trench work"],
        safeTasks: ["Service-location checks", "admin", "traffic plan review"],
      });
    } else if ((rain ?? 0) >= 2 || (weather.visibilityKm ?? 99) <= 5) {
      addRule(rules, {
        id: "groundwork-wet-caution",
        status: "caution",
        score: 36,
        reason: "Rain or reduced visibility can make ground and machine work less predictable.",
        controls: ["Check access and spoil stability.", "Use spotters where visibility is limited."],
        blockedTasks: [],
        safeTasks: profile.defaultSafeTasks,
      });
    }
  }

  const feelsLike = weather.feelsLikeC ?? weather.temperatureC;
  if (feelsLike != null) {
    if (feelsLike >= 40) {
      addRule(rules, {
        id: "heat-hard-stop",
        status: "unsafe",
        score: 76,
        reason: `Feels-like temperature is ${round(feelsLike)}°C, creating serious heat-stress risk.`,
        controls: ["Move work to a cooler window.", "Use shade, water, and shorter rotations if any work continues."],
        blockedTasks: ["Heavy outdoor labour", "PPE-heavy work", "roof or slab work in full sun"],
        safeTasks: ["Indoor admin", "early-morning prep only"],
      });
    } else if (feelsLike >= 32) {
      addRule(rules, {
        id: "heat-caution",
        status: "caution",
        score: 30,
        reason: `Feels-like temperature is ${round(feelsLike)}°C, so heat controls are needed.`,
        controls: ["Schedule heavy work earlier.", "Add water, shade, and rest breaks."],
        blockedTasks: [],
        safeTasks: profile.defaultSafeTasks,
      });
    } else if (feelsLike <= 0) {
      addRule(rules, {
        id: "cold-hard-stop",
        status: "unsafe",
        score: 60,
        reason: `Feels-like temperature is ${round(feelsLike)}°C, with ice/cold-stress risk for outdoor work.`,
        controls: ["Check for ice.", "Delay exposed work until temperatures lift."],
        blockedTasks: ["Height work", "wet trades", "exposed outdoor work"],
        safeTasks: ["Indoor prep", "materials checks"],
      });
    } else if (feelsLike <= 4) {
      addRule(rules, {
        id: "cold-caution",
        status: "caution",
        score: 24,
        reason: `Feels-like temperature is ${round(feelsLike)}°C, which can affect curing, grip, and worker comfort.`,
        controls: ["Check product minimums.", "Warm up before heavy handling.", "Watch for slippery patches."],
        blockedTasks: [],
        safeTasks: profile.defaultSafeTasks,
      });
    }
  }

  const unsafe = rules.some((rule) => rule.status === "unsafe");
  const caution = rules.some((rule) => rule.status === "caution");
  const severity = Math.min(
    100,
    profile.baseRisk + rules.reduce((sum, rule) => sum + rule.score, 0),
  );
  const overallStatus = unsafe ? "unsafe" : caution ? "caution" : "safe";
  const resultRules =
    overallStatus === "safe"
      ? [
          {
            id: "clear-working-window",
            status: "caution" as const,
            score: 0,
            reason: NO_THRESHOLDS_REASON,
            controls: ["Keep monitoring conditions and reassess if weather changes."],
            blockedTasks: [],
            safeTasks: profile.defaultSafeTasks,
          },
        ]
      : rules;

  return {
    overall_status: overallStatus,
    severity_score: overallStatus === "safe" ? Math.min(20, profile.baseRisk) : severity,
    confidence: missingFields.length > 0 ? "degraded" : "normal",
    reasons:
      overallStatus === "safe"
        ? [NO_THRESHOLDS_REASON]
        : unique(rules.map((rule) => rule.reason)),
    controls:
      overallStatus === "safe"
        ? ["Keep monitoring conditions and reassess if weather changes."]
        : unique(rules.flatMap((rule) => rule.controls)),
    blocked_tasks: unique(rules.flatMap((rule) => rule.blockedTasks)),
    safe_tasks: unique(resultRules.flatMap((rule) => rule.safeTasks)),
    weather_summary: buildWeatherSummary(weather),
    next_better_window: findBetterWindow(trade, site, weather.forecast ?? []),
    missing_fields: missingFields.map(String),
    triggered_rules: rules,
    advisory: WEATHER_IMPACT_ADVISORY,
  };
}

function addRule(rules: TriggeredWeatherRule[], rule: TriggeredWeatherRule) {
  if (!rules.some((existing) => existing.id === rule.id)) rules.push(rule);
}

function buildWeatherSummary(weather: WeatherImpactInput): string {
  const parts = [
    weather.temperatureC == null ? null : `${round(weather.temperatureC)}°C`,
    weather.feelsLikeC == null ? null : `feels ${round(weather.feelsLikeC)}°C`,
    weather.windGustKph == null ? null : `gusts ${round(weather.windGustKph)} kph`,
    weather.rainProbabilityPct == null ? null : `${round(weather.rainProbabilityPct)}% rain`,
    weather.precipitationMmPerHour == null
      ? null
      : `${round(weather.precipitationMmPerHour, 1)} mm/h`,
  ].filter(Boolean);
  if (parts.length === 0) return "Weather data missing — add current conditions first.";
  return parts.join(" · ");
}

function findBetterWindow(
  trade: WeatherImpactTrade,
  context: WeatherImpactContext,
  forecast: WeatherForecastWindow[],
): string | null {
  if (forecast.length < 3) return null;
  for (let i = 0; i <= forecast.length - 3; i += 1) {
    const window = forecast.slice(i, i + 3);
    if (window.every((hour) => isLowRiskForecastHour(trade, context, hour))) {
      const first = window[0];
      const last = window[window.length - 1];
      return `${formatWindowTime(first.startsAt)}-${formatWindowTime(last.startsAt)} looks better: gusts around ${round(first.windGustKph)} kph and rain about ${round(first.rainProbabilityPct)}%.`;
    }
  }
  return null;
}

function isLowRiskForecastHour(
  trade: WeatherImpactTrade,
  context: WeatherImpactContext,
  hour: WeatherForecastWindow,
) {
  const profile = TRADE_PROFILES[trade];
  const heightWork =
    profile.heightSensitive || context.workingAtHeight || context.usingLiftScaffoldLadder;
  const finishWork = profile.finishSensitive || context.exteriorFinishApplication;
  if (hour.thunderstormRisk === true) return false;
  if ((hour.windGustKph ?? 999) > (heightWork ? 30 : 38)) return false;
  if ((hour.rainProbabilityPct ?? 100) > (finishWork ? 20 : 35)) return false;
  if ((hour.precipitationMmPerHour ?? 99) > (finishWork ? 0 : 0.5)) return false;
  if ((hour.temperatureC ?? 20) >= 32 || (hour.temperatureC ?? 20) <= 3) return false;
  return true;
}

function formatMissingFields(fields: Array<keyof WeatherImpactInput>) {
  return fields
    .map((field) =>
      String(field)
        .replace(/([A-Z])/g, " $1")
        .replace("Pct", "%")
        .replace("Kph", " kph")
        .replace("Mm Per Hour", " mm/h")
        .toLowerCase(),
    )
    .join(", ");
}

function formatWindowTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-NZ", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function round(value: number | null | undefined, digits = 0) {
  if (value == null) return "unknown";
  return Number(value).toFixed(digits);
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
