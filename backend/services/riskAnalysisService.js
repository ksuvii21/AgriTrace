// ==========================================================
// RISK ANALYSIS SERVICE
// ==========================================================
//
// Modular, explainable risk engine for shipment environmental conditions.
//
// Design goals:
//  - Never hard-code a single threshold for all agricultural products.
//    Thresholds come from the shipment document (`shipment.thresholds`).
//  - Analyze gas over TIME (trend/spike), not from a single reading.
//  - Combine temperature + humidity + gas into a spoilage-risk indicator.
//  - Return human-readable reasons for every WARNING/CRITICAL verdict.
//  - Stay pluggable: product-specific rule packs or a future ML model can be
//    registered via `registerRiskProfile` without touching ingestion.
//
// IMPORTANT: The MQ-3 sensor is a raw / normalized gas-response (VOC / alcohol)
// sensor. We NEVER label its readings as calibrated "ethylene ppm". We treat
// `gasLevel` as a raw-normalized response value and name it accordingly.

export const RiskLevel = Object.freeze({
  NORMAL: "NORMAL",
  WARNING: "WARNING",
  CRITICAL: "CRITICAL",
  UNKNOWN: "UNKNOWN",
});

// Severity ordering used to escalate/de-escalate levels.
const LEVEL_ORDER = {
  UNKNOWN: 0,
  NORMAL: 1,
  WARNING: 2,
  CRITICAL: 3,
};

export function isRiskLevel(value) {
  return Object.values(RiskLevel).includes(value);
}

export function maxRiskLevel(a, b) {
  const rankA = LEVEL_ORDER[a] ?? 0;
  const rankB = LEVEL_ORDER[b] ?? 0;
  return rankA >= rankB ? a : b;
}

// ==========================================================
// DEFAULT KNOBS (per analysis, overridable per shipment/profile)
// ==========================================================

const DEFAULT_CONFIG = Object.freeze({
  // Number of most-recent readings used for trend analysis.
  trendWindow: 10,
  // Minimum readings required before trend-based rules activate.
  minTrendSamples: 3,
  // Fractional rise across the window that counts as a "sustained increase".
  sustainedIncreaseRatio: 0.25,
  // Absolute jump between consecutive readings that counts as a "spike".
  spikeDelta: 30,
  // Absolute ceiling for the raw gas response used by the spoilage model.
  gasResponseCeiling: 200,
  // A reading whose |value - threshold| is within this % is "near" the limit.
  nearLimitRatio: 0.1,
  // This many consecutive abnormal readings escalate WARNING -> CRITICAL.
  repeatAbnormalCount: 3,
  // How far beyond a limit (as a fraction) escalates to CRITICAL.
  severeOvershootRatio: 0.2,
  // Spoilage-risk score bands.
  spoilageWarningScore: 35,
  spoilageCriticalScore: 65,
});

// ==========================================================
// RISK PROFILES (pluggable rule packs)
// ==========================================================
//
// A profile can:
//   - adjust config defaults
//   - add custom condition evaluators (product-specific)
//   - override the spoilage weighting
//
// Registering a profile is additive; the default profile always exists.

const profiles = new Map();

const DEFAULT_PROFILE_ID = "default";

profiles.set(DEFAULT_PROFILE_ID, {
  id: DEFAULT_PROFILE_ID,
  config: { ...DEFAULT_CONFIG },
  // Product-specific evaluators: (context) => condition | null
  evaluators: [],
});

export function registerRiskProfile(profile) {
  if (!profile?.id) {
    throw new Error("Risk profile requires an id");
  }

  profiles.set(profile.id, {
    id: profile.id,
    config: { ...DEFAULT_CONFIG, ...(profile.config || {}) },
    evaluators: Array.isArray(profile.evaluators) ? profile.evaluators : [],
  });
}

export function getRiskProfile(id = DEFAULT_PROFILE_ID) {
  return profiles.get(id) || profiles.get(DEFAULT_PROFILE_ID);
}

export function listRiskProfiles() {
  return [...profiles.keys()];
}

// ==========================================================
// HELPERS
// ==========================================================

function finiteOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Returns readings that actually carry a usable gas value, most recent last.
function gasSeries(readings) {
  if (!Array.isArray(readings)) return [];
  return readings
    .map((reading) => finiteOrNull(reading?.gasLevel))
    .filter((value) => value !== null);
}

function describeThreshold(threshold) {
  if (!threshold || typeof threshold !== "object") return null;
  return {
    min: finiteOrNull(threshold.min),
    max: finiteOrNull(threshold.max),
  };
}

// ==========================================================
// CONDITION EVALUATORS
// ==========================================================

// A "condition" is the atomic unit of explanation:
//   { key, level, field, message, actual, threshold, ... }

function evaluateTemperature(reading, thresholds, config) {
  const value = finiteOrNull(reading?.temperature);
  const bounds = thresholds?.temperature || {};
  const min = finiteOrNull(bounds.min);
  const max = finiteOrNull(bounds.max);

  if (value === null || (min === null && max === null)) return null;

  if (max !== null && value > max) {
    const overshootRatio = (value - max) / Math.max(Math.abs(max), 1);
    const level =
      overshootRatio >= config.severeOvershootRatio
        ? RiskLevel.CRITICAL
        : RiskLevel.WARNING;
    return {
      key: "TEMPERATURE_ABOVE_MAX",
      level,
      field: "temperature",
      actual: value,
      threshold: { operator: ">", limit: max, min, max },
      message: `Temperature ${value}°C is above the shipment maximum of ${max}°C`,
    };
  }

  if (min !== null && value < min) {
    const undershootRatio = (min - value) / Math.max(Math.abs(min), 1);
    const level =
      undershootRatio >= config.severeOvershootRatio
        ? RiskLevel.CRITICAL
        : RiskLevel.WARNING;
    return {
      key: "TEMPERATURE_BELOW_MIN",
      level,
      field: "temperature",
      actual: value,
      threshold: { operator: "<", limit: min, min, max },
      message: `Temperature ${value}°C is below the shipment minimum of ${min}°C`,
    };
  }

  // Near-limit advisory (does not by itself violate).
  const near = nearLimit(value, min, max, config);
  if (near) {
    return {
      key: `TEMPERATURE_NEAR_${near}`,
      level: RiskLevel.NORMAL,
      field: "temperature",
      actual: value,
      threshold: { operator: "~", limit: near === "MAX" ? max : min, min, max },
      message: `Temperature ${value}°C is approaching the shipment ${near.toLowerCase()} limit`,
      advisory: true,
    };
  }

  return null;
}

function evaluateHumidity(reading, thresholds, config) {
  const value = finiteOrNull(reading?.humidity);
  const bounds = thresholds?.humidity || {};
  const min = finiteOrNull(bounds.min);
  const max = finiteOrNull(bounds.max);

  if (value === null || (min === null && max === null)) return null;

  if (max !== null && value > max) {
    const overshootRatio = (value - max) / Math.max(Math.abs(max), 1);
    const level =
      overshootRatio >= config.severeOvershootRatio
        ? RiskLevel.CRITICAL
        : RiskLevel.WARNING;
    return {
      key: "HUMIDITY_ABOVE_MAX",
      level,
      field: "humidity",
      actual: value,
      threshold: { operator: ">", limit: max, min, max },
      message: `Humidity ${value}% is above the shipment maximum of ${max}%`,
    };
  }

  if (min !== null && value < min) {
    const undershootRatio = (min - value) / Math.max(Math.abs(min), 1);
    const level =
      undershootRatio >= config.severeOvershootRatio
        ? RiskLevel.CRITICAL
        : RiskLevel.WARNING;
    return {
      key: "HUMIDITY_BELOW_MIN",
      level,
      field: "humidity",
      actual: value,
      threshold: { operator: "<", limit: min, min, max },
      message: `Humidity ${value}% is below the shipment minimum of ${min}%`,
    };
  }

  const near = nearLimit(value, min, max, config);
  if (near) {
    return {
      key: `HUMIDITY_NEAR_${near}`,
      level: RiskLevel.NORMAL,
      field: "humidity",
      actual: value,
      threshold: { operator: "~", limit: near === "MAX" ? max : min, min, max },
      message: `Humidity ${value}% is approaching the shipment ${near.toLowerCase()} limit`,
      advisory: true,
    };
  }

  return null;
}

function nearLimit(value, min, max, config) {
  if (max !== null) {
    const span = Math.max(Math.abs(max), 1);
    if (value <= max && max - value <= span * config.nearLimitRatio) return "MAX";
  }
  if (min !== null) {
    const span = Math.max(Math.abs(min), 1);
    if (value >= min && value - min <= span * config.nearLimitRatio) return "MIN";
  }
  return null;
}

// Gas threshold + absolute ceiling from shipment config.
function evaluateGasThreshold(reading, thresholds, config) {
  const value = finiteOrNull(reading?.gasLevel);
  const max = finiteOrNull(thresholds?.gasLevel?.max);

  if (value === null || max === null) return null;
  if (value <= max) {
    const span = Math.max(Math.abs(max), 1);
    if (max - value <= span * config.nearLimitRatio) {
      return {
        key: "GAS_NEAR_MAX",
        level: RiskLevel.NORMAL,
        field: "gasLevel",
        actual: value,
        threshold: { operator: "~", limit: max },
        message: `Raw gas response ${value} is approaching the shipment maximum of ${max}`,
        advisory: true,
      };
    }
    return null;
  }

  const overshootRatio = (value - max) / Math.max(Math.abs(max), 1);
  const level =
    overshootRatio >= config.severeOvershootRatio
      ? RiskLevel.CRITICAL
      : RiskLevel.WARNING;

  return {
    key: "GAS_ABOVE_MAX",
    level,
    field: "gasLevel",
    actual: value,
    threshold: { operator: ">", limit: max },
    message: `Raw gas response ${value} is above the shipment maximum of ${max}`,
  };
}

// ==========================================================
// GAS TREND ANALYSIS
// ==========================================================
//
// Uses a window of recent readings. Returns a structured trend object plus
// any conditions it produces. Never interprets the value as ethylene ppm.

export function analyzeGasTrend(readings, config = DEFAULT_CONFIG) {
  const series = gasSeries(readings).slice(-config.trendWindow);
  const conditions = [];

  const trend = {
    sampleCount: series.length,
    window: config.trendWindow,
    direction: "UNKNOWN",
    change: null,
    changeRatio: null,
    slopePerReading: null,
    detectedSpike: false,
    sustainedIncrease: false,
  };

  if (series.length < 2) {
    return { trend, conditions };
  }

  const first = series[0];
  const last = series[series.length - 1];
  const change = last - first;
  const changeRatio = first !== 0 ? change / Math.abs(first) : last > 0 ? 1 : 0;

  // Simple least-squares slope per reading.
  const n = series.length;
  const meanX = (n - 1) / 2;
  const meanY = series.reduce((sum, v) => sum + v, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < n; index += 1) {
    numerator += (index - meanX) * (series[index] - meanY);
    denominator += (index - meanX) ** 2;
  }
  const slopePerReading = denominator !== 0 ? numerator / denominator : 0;

  trend.change = change;
  trend.changeRatio = Number(changeRatio.toFixed(4));
  trend.slopePerReading = Number(slopePerReading.toFixed(4));
  trend.direction =
    slopePerReading > 0 ? "RISING" : slopePerReading < 0 ? "FALLING" : "FLAT";

  // Sudden spike between consecutive readings.
  let maxDelta = 0;
  for (let index = 1; index < series.length; index += 1) {
    maxDelta = Math.max(maxDelta, series[index] - series[index - 1]);
  }
  if (maxDelta >= config.spikeDelta) {
    trend.detectedSpike = true;
    trend.maxDelta = Number(maxDelta.toFixed(4));
    conditions.push({
      key: "GAS_SPIKE",
      level: RiskLevel.WARNING,
      field: "gasLevel",
      actual: last,
      message: `Raw gas response spiked by ${maxDelta.toFixed(1)} within the last ${n} readings`,
    });
  }

  // Sustained increase across the window.
  if (
    n >= config.minTrendSamples &&
    change > 0 &&
    changeRatio >= config.sustainedIncreaseRatio
  ) {
    trend.sustainedIncrease = true;
    conditions.push({
      key: "GAS_SUSTAINED_INCREASE",
      level: RiskLevel.WARNING,
      field: "gasLevel",
      actual: last,
      message: `Raw gas response increased ${(changeRatio * 100).toFixed(0)}% over the last ${n} readings`,
    });
  }

  return { trend, conditions };
}

// ==========================================================
// SPOILAGE RISK INDICATOR
// ==========================================================
//
// A 0..100 score combining gas trend + temperature/humidity excursions.
// Explainable via `reasons`. This is a heuristic indicator, not a guarantee.

function computeSpoilageRisk({ trend, conditions, reading, thresholds, config }) {
  let score = 0;
  const reasons = [];

  // --- Gas component (0..50) ---
  const gasValue = finiteOrNull(reading?.gasLevel);
  const gasMax = finiteOrNull(thresholds?.gasLevel?.max);

  if (gasValue !== null) {
    const ceiling = gasMax ?? config.gasResponseCeiling;
    const fraction = Math.min(Math.max(gasValue / Math.max(ceiling, 1), 0), 1.5);
    const gasPoints = Math.min(50, Math.round(fraction * 50));
    score += gasPoints;
    if (gasPoints > 0) {
      reasons.push({
        key: "GAS_LEVEL_CONTRIBUTION",
        points: gasPoints,
        message: `Raw gas response contributes ${gasPoints}/50 to spoilage risk`,
      });
    }
  }

  if (trend?.sustainedIncrease) {
    score += 15;
    reasons.push({
      key: "GAS_SUSTAINED_INCREASE",
      points: 15,
      message: "Sustained rise in raw gas response (+15)",
    });
  }

  if (trend?.detectedSpike) {
    score += 10;
    reasons.push({
      key: "GAS_SPIKE",
      points: 10,
      message: "Sudden gas spike detected (+10)",
    });
  }

  // --- Temperature/humidity component (0..35) ---
  for (const condition of conditions) {
    if (condition.field !== "temperature" && condition.field !== "humidity") {
      continue;
    }
    if (condition.advisory) continue;

    if (condition.level === RiskLevel.CRITICAL) {
      score += 20;
      reasons.push({
        key: condition.key,
        points: 20,
        message: `${condition.message} (+20)`,
      });
    } else if (condition.level === RiskLevel.WARNING) {
      score += 10;
      reasons.push({
        key: condition.key,
        points: 10,
        message: `${condition.message} (+10)`,
      });
    }
  }

  score = Math.min(100, score);

  let level = RiskLevel.NORMAL;
  if (score >= config.spoilageCriticalScore) {
    level = RiskLevel.CRITICAL;
  } else if (score >= config.spoilageWarningScore) {
    level = RiskLevel.WARNING;
  }

  return {
    score,
    level,
    // 0..1 for convenience in dashboards.
    normalized: Number((score / 100).toFixed(4)),
    reasons,
    basis:
      "Heuristic combination of raw gas response, gas trend, and temperature/humidity excursions. Not a calibrated ethylene measurement.",
  };
}

// ==========================================================
// MAIN ENTRY POINT
// ==========================================================

/**
 * Analyze a single telemetry reading in the context of recent readings and
 * shipment thresholds.
 *
 * @param {object}   reading     The normalized telemetry reading.
 * @param {object}   options
 * @param {object}   options.thresholds     Shipment thresholds.
 * @param {object[]} options.recentReadings Recent readings (oldest -> newest),
 *                                          including the current one last.
 * @param {string}   options.profileId       Risk profile id (default profile).
 * @returns {object} Explainable analysis result.
 */
export function analyzeReading(reading, options = {}) {
  const profile = getRiskProfile(options.profileId);
  const config = profile.config;
  const thresholds = normalizeThresholds(options.thresholds);
  const recentReadings =
    Array.isArray(options.recentReadings) && options.recentReadings.length > 0
      ? options.recentReadings
      : reading
      ? [reading]
      : [];

  const conditions = [];

  const temperatureCondition = evaluateTemperature(reading, thresholds, config);
  if (temperatureCondition) conditions.push(temperatureCondition);

  const humidityCondition = evaluateHumidity(reading, thresholds, config);
  if (humidityCondition) conditions.push(humidityCondition);

  const gasCondition = evaluateGasThreshold(reading, thresholds, config);
  if (gasCondition) conditions.push(gasCondition);

  const { trend, conditions: trendConditions } = analyzeGasTrend(
    recentReadings,
    config
  );
  conditions.push(...trendConditions);

  // Profile-specific evaluators (product rules / future ML hooks).
  for (const evaluator of profile.evaluators) {
    try {
      const extra = evaluator({
        reading,
        thresholds,
        recentReadings,
        trend,
        config,
      });
      if (Array.isArray(extra)) {
        conditions.push(...extra.filter(Boolean));
      } else if (extra) {
        conditions.push(extra);
      }
    } catch (error) {
      console.error("Risk evaluator failed:", error.message);
    }
  }

  // ----- Repeated abnormal readings -----
  const abnormalRunLength = countAbnormalTail(recentReadings, thresholds, config);

  let level = RiskLevel.NORMAL;
  for (const condition of conditions) {
    if (condition.advisory) continue;
    level = maxRiskLevel(level, condition.level);
  }

  // Repeated abnormal readings escalate WARNING -> CRITICAL.
  if (
    level === RiskLevel.WARNING &&
    abnormalRunLength >= config.repeatAbnormalCount
  ) {
    level = RiskLevel.CRITICAL;
    conditions.push({
      key: "REPEATED_ABNORMAL_READINGS",
      level: RiskLevel.CRITICAL,
      field: "multi",
      actual: abnormalRunLength,
      message: `${abnormalRunLength} consecutive abnormal readings escalated the condition to CRITICAL`,
    });
  }

  // Snapshot after every condition (including the escalation above) is known,
  // so the explanation returned to callers always accounts for the final level.
  const activeConditions = conditions.filter((c) => !c.advisory);

  // ----- Duration of violation -----
  const violationDurationMs = estimateViolationDuration(
    recentReadings,
    thresholds,
    config
  );

  // ----- Spoilage risk -----
  const spoilageRisk = computeSpoilageRisk({
    trend,
    conditions,
    reading,
    thresholds,
    config,
  });

  // Spoilage CRITICAL should also escalate the overall level.
  if (spoilageRisk.level === RiskLevel.CRITICAL) {
    level = maxRiskLevel(level, RiskLevel.CRITICAL);
  } else if (
    spoilageRisk.level === RiskLevel.WARNING &&
    level === RiskLevel.NORMAL
  ) {
    level = RiskLevel.WARNING;
  }

  const reasons = buildReasons(conditions, spoilageRisk);

  return {
    level,
    status: level,
    profileId: profile.id,
    analyzedAt: new Date().toISOString(),
    isNormal: level === RiskLevel.NORMAL,
    conditions: activeConditions.map(stripInternalFields),
    advisories: conditions
      .filter((c) => c.advisory)
      .map(stripInternalFields),
    reasons,
    gasTrend: trend,
    spoilageRisk,
    repeatedAbnormalCount: abnormalRunLength,
    violationDurationMs,
    thresholds,
  };
}

// ==========================================================
// INTERNAL: abnormal-run + duration helpers
// ==========================================================

function readingIsAbnormal(reading, thresholds) {
  const temperatureCondition = evaluateTemperature(reading, thresholds, {
    ...DEFAULT_CONFIG,
  });
  const humidityCondition = evaluateHumidity(reading, thresholds, {
    ...DEFAULT_CONFIG,
  });
  const gasCondition = evaluateGasThreshold(reading, thresholds, {
    ...DEFAULT_CONFIG,
  });

  return [temperatureCondition, humidityCondition, gasCondition].some(
    (condition) => condition && !condition.advisory
  );
}

function countAbnormalTail(recentReadings, thresholds, config) {
  if (!Array.isArray(recentReadings)) return 0;
  let count = 0;
  for (
    let index = recentReadings.length - 1;
    index >= 0 && index >= recentReadings.length - config.trendWindow;
    index -= 1
  ) {
    if (readingIsAbnormal(recentReadings[index], thresholds)) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

function estimateViolationDuration(recentReadings, thresholds, config) {
  if (!Array.isArray(recentReadings) || recentReadings.length === 0) return 0;
  const window = recentReadings.slice(-config.trendWindow);

  let start = null;
  for (let index = window.length - 1; index >= 0; index -= 1) {
    if (readingIsAbnormal(window[index], thresholds)) {
      start = window[index];
    } else {
      break;
    }
  }

  if (!start) return 0;

  const end = window[window.length - 1];
  const startTime = new Date(start.timestamp ?? start.capturedAt ?? 0).getTime();
  const endTime = new Date(end.timestamp ?? end.capturedAt ?? 0).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
  return Math.max(0, endTime - startTime);
}

function buildReasons(conditions, spoilageRisk) {
  const reasons = [];

  for (const condition of conditions) {
    if (condition.advisory) continue;
    reasons.push({
      key: condition.key,
      level: condition.level,
      message: condition.message,
      field: condition.field,
      actual: condition.actual ?? null,
      threshold: condition.threshold ?? null,
    });
  }

  for (const riskReason of spoilageRisk.reasons || []) {
    if (reasons.some((r) => r.key === riskReason.key)) continue;
    reasons.push({
      key: riskReason.key,
      level: spoilageRisk.level,
      message: riskReason.message,
      field: "spoilageRisk",
      actual: spoilageRisk.score,
      threshold: null,
    });
  }

  return reasons;
}

function stripInternalFields(condition) {
  const { advisory, ...rest } = condition;
  return rest;
}

// Normalizes partial thresholds without inventing values.
export function normalizeThresholds(thresholds) {
  const source = thresholds && typeof thresholds === "object" ? thresholds : {};
  return {
    temperature: describeThreshold(source.temperature) || { min: null, max: null },
    humidity: describeThreshold(source.humidity) || { min: null, max: null },
    gasLevel: describeThreshold(source.gasLevel) || { min: null, max: null },
  };
}

// ==========================================================
// Device command intent
// ==========================================================
//
// Maps a risk level to the physical feedback the firmware should show.
// CRITICAL -> buzzer ON + red LED. WARNING -> amber LED, buzzer off.
// NORMAL -> green LED, buzzer off.

export function riskLevelToDeviceCommand(level, { buzzerEnabled = true } = {}) {
  const normalizedLevel = isRiskLevel(level) ? level : RiskLevel.UNKNOWN;

  if (normalizedLevel === RiskLevel.CRITICAL) {
    return {
      level: normalizedLevel,
      buzzer: buzzerEnabled,
      led: "RED",
      // Firmware falls back to its own local thresholds if offline.
      requiresLocalFallback: true,
    };
  }

  if (normalizedLevel === RiskLevel.WARNING) {
    return {
      level: normalizedLevel,
      buzzer: false,
      led: "AMBER",
      requiresLocalFallback: true,
    };
  }

  return {
    level: normalizedLevel,
    buzzer: false,
    led: normalizedLevel === RiskLevel.NORMAL ? "GREEN" : "OFF",
    requiresLocalFallback: true,
  };
}

// Expose defaults for tests/inspection.
export const RISK_ANALYSIS_DEFAULTS = DEFAULT_CONFIG;
