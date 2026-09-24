import test from "node:test";
import assert from "node:assert/strict";
import {
  RiskLevel,
  analyzeReading,
  analyzeGasTrend,
  normalizeThresholds,
  riskLevelToDeviceCommand,
  maxRiskLevel,
  isRiskLevel,
  registerRiskProfile,
  getRiskProfile,
  listRiskProfiles,
} from "./riskAnalysisService.js";

// Shipment thresholds used across the cases (produce-like profile).
const thresholds = {
  temperature: { min: 2, max: 8 },
  humidity: { min: 85, max: 95 },
  gasLevel: { max: 100 },
};

function reading(overrides = {}) {
  return {
    temperature: 5,
    humidity: 90,
    gasLevel: 20,
    timestamp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ==========================================================
// Level helpers
// ==========================================================

test("isRiskLevel recognises only known levels", () => {
  assert.equal(isRiskLevel(RiskLevel.WARNING), true);
  assert.equal(isRiskLevel("BANANA"), false);
});

test("maxRiskLevel returns the more severe level", () => {
  assert.equal(maxRiskLevel(RiskLevel.NORMAL, RiskLevel.CRITICAL), RiskLevel.CRITICAL);
  assert.equal(maxRiskLevel(RiskLevel.WARNING, RiskLevel.NORMAL), RiskLevel.WARNING);
  assert.equal(maxRiskLevel(RiskLevel.UNKNOWN, RiskLevel.NORMAL), RiskLevel.NORMAL);
});

// ==========================================================
// Threshold normalization
// ==========================================================

test("normalizeThresholds preserves missing values as null (never invents)", () => {
  const normalized = normalizeThresholds({ temperature: { max: 8 } });
  assert.deepEqual(normalized.temperature, { min: null, max: 8 });
  assert.deepEqual(normalized.humidity, { min: null, max: null });
  assert.deepEqual(normalized.gasLevel, { min: null, max: null });
});

test("normalizeThresholds tolerates undefined input", () => {
  const normalized = normalizeThresholds(undefined);
  assert.deepEqual(normalized.temperature, { min: null, max: null });
});

// ==========================================================
// Temperature / humidity
// ==========================================================

test("in-range reading is NORMAL with no conditions", () => {
  const result = analyzeReading(reading(), { thresholds });
  assert.equal(result.level, RiskLevel.NORMAL);
  assert.equal(result.isNormal, true);
  assert.equal(result.conditions.length, 0);
});

test("temperature above max is WARNING and explains itself", () => {
  const result = analyzeReading(reading({ temperature: 9 }), { thresholds });
  assert.equal(result.level, RiskLevel.WARNING);
  const condition = result.conditions.find((c) => c.key === "TEMPERATURE_ABOVE_MAX");
  assert.ok(condition, "expected TEMPERATURE_ABOVE_MAX condition");
  assert.match(condition.message, /above the shipment maximum/);
});

test("temperature well above max escalates to CRITICAL (severe overshoot)", () => {
  // 8 -> 12 is a 50% overshoot, beyond the 0.2 severe ratio.
  const result = analyzeReading(reading({ temperature: 12 }), { thresholds });
  assert.equal(result.level, RiskLevel.CRITICAL);
  const condition = result.conditions.find((c) => c.key === "TEMPERATURE_ABOVE_MAX");
  assert.equal(condition.level, RiskLevel.CRITICAL);
});

test("temperature below min is detected (small undershoot is WARNING)", () => {
  // 2 -> 1.8 is a 10% undershoot, below the 0.2 severe ratio, so WARNING.
  const result = analyzeReading(reading({ temperature: 1.8 }), { thresholds });
  assert.equal(result.level, RiskLevel.WARNING);
  assert.ok(result.conditions.some((c) => c.key === "TEMPERATURE_BELOW_MIN"));
});

test("temperature far below min escalates to CRITICAL (severe undershoot)", () => {
  // 2 -> 1 is a 50% undershoot, beyond the 0.2 severe ratio.
  const result = analyzeReading(reading({ temperature: 1 }), { thresholds });
  assert.equal(result.level, RiskLevel.CRITICAL);
  const condition = result.conditions.find((c) => c.key === "TEMPERATURE_BELOW_MIN");
  assert.equal(condition.level, RiskLevel.CRITICAL);
});

test("reading near a limit produces an advisory, not a violation", () => {
  // max 8, nearLimitRatio 0.1 => within 0.8 counts as "near".
  const result = analyzeReading(reading({ temperature: 7.5 }), { thresholds });
  assert.equal(result.level, RiskLevel.NORMAL);
  assert.ok(result.advisories.some((c) => c.key === "TEMPERATURE_NEAR_MAX"));
  assert.equal(result.conditions.length, 0);
});

test("humidity above max is detected", () => {
  const result = analyzeReading(reading({ humidity: 99 }), { thresholds });
  assert.equal(result.level, RiskLevel.WARNING);
  assert.ok(result.conditions.some((c) => c.key === "HUMIDITY_ABOVE_MAX"));
});

// ==========================================================
// Gas threshold
// ==========================================================

test("gas just above shipment max is WARNING and labelled as raw response", () => {
  // 100 -> 110 is a 10% overshoot, below the 0.2 severe ratio, so WARNING.
  const result = analyzeReading(reading({ gasLevel: 110 }), { thresholds });
  assert.equal(result.level, RiskLevel.WARNING);
  const condition = result.conditions.find((c) => c.key === "GAS_ABOVE_MAX");
  assert.equal(condition.level, RiskLevel.WARNING);
  assert.match(condition.message, /Raw gas response/);
  // It must never claim ethylene ppm.
  assert.doesNotMatch(condition.message, /ppm|ethylene/i);
});

test("gas far above shipment max escalates to CRITICAL (severe overshoot)", () => {
  // 100 -> 130 is a 30% overshoot, beyond the 0.2 severe ratio.
  const result = analyzeReading(reading({ gasLevel: 130 }), { thresholds });
  assert.equal(result.level, RiskLevel.CRITICAL);
  const condition = result.conditions.find((c) => c.key === "GAS_ABOVE_MAX");
  assert.equal(condition.level, RiskLevel.CRITICAL);
  assert.doesNotMatch(condition.message, /ppm|ethylene/i);
});

// ==========================================================
// Gas trend
// ==========================================================

test("analyzeGasTrend flags a sustained increase", () => {
  const readings = [10, 12, 15, 18, 22].map((gasLevel) => reading({ gasLevel }));
  const { trend, conditions } = analyzeGasTrend(readings);
  assert.equal(trend.sampleCount, 5);
  assert.equal(trend.direction, "RISING");
  assert.equal(trend.sustainedIncrease, true);
  assert.ok(conditions.some((c) => c.key === "GAS_SUSTAINED_INCREASE"));
});

test("analyzeGasTrend flags a spike on a large single jump", () => {
  const readings = [10, 10, 10, 60].map((gasLevel) => reading({ gasLevel }));
  const { trend, conditions } = analyzeGasTrend(readings);
  assert.equal(trend.detectedSpike, true);
  assert.ok(conditions.some((c) => c.key === "GAS_SPIKE"));
});

test("analyzeGasTrend reports UNKNOWN with fewer than two samples", () => {
  const { trend, conditions } = analyzeGasTrend([reading()]);
  assert.equal(trend.direction, "UNKNOWN");
  assert.equal(conditions.length, 0);
});

test("gas trend drives overall level through trend conditions", () => {
  const readings = [10, 12, 15, 18, 22].map((gasLevel) =>
    reading({ gasLevel, temperature: 5, humidity: 90 })
  );
  const result = analyzeReading(readings[readings.length - 1], {
    thresholds,
    recentReadings: readings,
  });
  assert.equal(result.level, RiskLevel.WARNING);
  assert.equal(result.gasTrend.sustainedIncrease, true);
});

// ==========================================================
// Repeated abnormal readings
// ==========================================================

test("three consecutive abnormal readings escalate WARNING to CRITICAL", () => {
  const readings = [9, 9.2, 9.4].map((temperature) => reading({ temperature }));
  const result = analyzeReading(readings[readings.length - 1], {
    thresholds,
    recentReadings: readings,
  });
  assert.equal(result.level, RiskLevel.CRITICAL);
  assert.equal(result.repeatedAbnormalCount, 3);
  // The escalation must be explained, not silently applied.
  const escalation = result.conditions.find(
    (c) => c.key === "REPEATED_ABNORMAL_READINGS"
  );
  assert.ok(escalation, "escalation condition must be surfaced to callers");
  assert.ok(result.reasons.some((r) => r.key === "REPEATED_ABNORMAL_READINGS"));
});

// ==========================================================
// Spoilage indicator
// ==========================================================

test("spoilage risk is explainable and bounded", () => {
  const result = analyzeReading(reading({ temperature: 12, humidity: 99, gasLevel: 180 }), {
    thresholds,
  });
  assert.ok(result.spoilageRisk.score >= 0 && result.spoilageRisk.score <= 100);
  assert.ok(result.spoilageRisk.reasons.length > 0);
  assert.match(result.spoilageRisk.basis, /Not a calibrated ethylene measurement/);
  assert.equal(result.spoilageRisk.level, RiskLevel.CRITICAL);
});

test("every active condition appears in reasons with a message", () => {
  const result = analyzeReading(reading({ temperature: 12, humidity: 99 }), { thresholds });
  for (const condition of result.conditions) {
    assert.ok(
      result.reasons.some((r) => r.key === condition.key),
      `missing reason for ${condition.key}`
    );
  }
});

// ==========================================================
// Violation duration
// ==========================================================

test("violation duration spans consecutive abnormal readings", () => {
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  const readings = [0, 60000, 120000].map((offset, index) =>
    reading({
      temperature: 9,
      timestamp: new Date(base + offset).toISOString(),
      gasLevel: index,
    })
  );
  const result = analyzeReading(readings[readings.length - 1], {
    thresholds,
    recentReadings: readings,
  });
  assert.equal(result.violationDurationMs, 120000);
});

// ==========================================================
// Device command
// ==========================================================

test("riskLevelToDeviceCommand maps CRITICAL to buzzer + red LED", () => {
  const command = riskLevelToDeviceCommand(RiskLevel.CRITICAL);
  assert.deepEqual(command, {
    level: RiskLevel.CRITICAL,
    buzzer: true,
    led: "RED",
    requiresLocalFallback: true,
  });
});

test("riskLevelToDeviceCommand keeps buzzer off for WARNING and NORMAL", () => {
  assert.equal(riskLevelToDeviceCommand(RiskLevel.WARNING).buzzer, false);
  assert.equal(riskLevelToDeviceCommand(RiskLevel.WARNING).led, "AMBER");
  assert.equal(riskLevelToDeviceCommand(RiskLevel.NORMAL).buzzer, false);
  assert.equal(riskLevelToDeviceCommand(RiskLevel.NORMAL).led, "GREEN");
});

test("riskLevelToDeviceCommand respects buzzerEnabled=false", () => {
  const command = riskLevelToDeviceCommand(RiskLevel.CRITICAL, { buzzerEnabled: false });
  assert.equal(command.buzzer, false);
  assert.equal(command.led, "RED");
});

test("riskLevelToDeviceCommand treats unknown levels safely", () => {
  const command = riskLevelToDeviceCommand("BANANA");
  assert.equal(command.level, RiskLevel.UNKNOWN);
  assert.equal(command.led, "OFF");
  assert.equal(command.buzzer, false);
});

// ==========================================================
// Profiles
// ==========================================================

test("default profile is always available", () => {
  assert.ok(listRiskProfiles().includes("default"));
  assert.equal(getRiskProfile("does-not-exist").id, "default");
});

test("a registered profile can add product-specific evaluators", () => {
  registerRiskProfile({
    id: "test-banana",
    // Oversized spike window so the profile test isolates its custom evaluator.
    config: { gasResponseCeiling: 1000 },
    evaluators: [
      () => ({
        key: "BANANA_CUSTOM_RULE",
        level: RiskLevel.WARNING,
        field: "gasLevel",
        actual: 1,
        message: "Banana rule fired",
      }),
    ],
  });

  assert.ok(listRiskProfiles().includes("test-banana"));

  const result = analyzeReading(reading(), { thresholds, profileId: "test-banana" });
  assert.equal(result.profileId, "test-banana");
  assert.ok(result.conditions.some((c) => c.key === "BANANA_CUSTOM_RULE"));
  assert.equal(result.level, RiskLevel.WARNING);

  // The default profile must be unaffected.
  const defaultResult = analyzeReading(reading(), { thresholds });
  assert.equal(defaultResult.profileId, "default");
  assert.equal(defaultResult.level, RiskLevel.NORMAL);
});

test("a throwing evaluator does not break analysis", () => {
  registerRiskProfile({
    id: "test-throwing",
    evaluators: [
      () => {
        throw new Error("boom");
      },
    ],
  });

  const result = analyzeReading(reading(), { thresholds, profileId: "test-throwing" });
  assert.equal(result.level, RiskLevel.NORMAL);
});

test("registerRiskProfile requires an id", () => {
  assert.throws(() => registerRiskProfile({}), /requires an id/);
});

// ==========================================================
// Result shape
// ==========================================================

test("analysis result exposes status alias and analyzedAt timestamp", () => {
  const result = analyzeReading(reading(), { thresholds });
  assert.equal(result.status, result.level);
  assert.ok(!Number.isNaN(Date.parse(result.analyzedAt)));
  assert.deepEqual(result.thresholds, normalizeThresholds(thresholds));
});
