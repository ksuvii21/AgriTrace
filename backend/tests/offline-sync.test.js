import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeTelemetry,
  normalizeTransmission,
  validateReading,
} from "../models/telemetry.js";

import {
  generateTelemetryHash,
  generateTelemetryHashChained,
  verifyTelemetryReading,
  verifySequenceContinuity,
  resolvePreviousHash,
  GENESIS_PREVIOUS_HASH,
} from "../services/integrityService.js";

const RECEIVED_AT = new Date("2026-01-15T12:00:00.000Z");

function livePayload(overrides = {}) {
  return {
    deviceId: "DEV001",
    sequenceNumber: 10,
    temperature: 25,
    humidity: 55,
    battery: 80,
    timestamp: "2026-01-15T11:59:50.000Z",
    ...overrides,
  };
}

function sdPayload(overrides = {}) {
  return {
    deviceId: "DEV001",
    sequenceNumber: 5,
    temperature: 24,
    humidity: 52,
    battery: 78,
    // Capture time is preserved from the SD record.
    capturedAt: "2026-01-15T11:30:00.000Z",
    gpsTimestamp: "2026-01-15T11:30:00.000Z",
    latitude: 25.3176,
    longitude: 82.9739,
    gpsValid: true,
    transmission: {
      source: "SD_SYNC",
      storedOffline: true,
      queuedAt: "2026-01-15T11:30:01.000Z",
    },
    ...overrides,
  };
}

// ============================================================
// Transmission detection
// ============================================================

test("legacy payload defaults to a LIVE transmission (backward compatible)", () => {
  const transmission = normalizeTransmission(livePayload(), RECEIVED_AT);

  assert.equal(transmission.source, "LIVE");
  assert.equal(transmission.storedOffline, false);
  assert.equal(transmission.syncStatus, "LIVE");
  assert.equal(transmission.syncedAt, null);
  assert.equal(transmission.offlineDurationMs, null);
});

test("explicit SD_SYNC transmission is detected and marked stored offline", () => {
  const transmission = normalizeTransmission(sdPayload(), RECEIVED_AT);

  assert.equal(transmission.source, "SD_SYNC");
  assert.equal(transmission.storedOffline, true);
  assert.equal(transmission.syncStatus, "SYNCED");
  assert.equal(transmission.capturedAt.toISOString(), "2026-01-15T11:30:00.000Z");
});

test("storedOffline flag alone is enough to classify as SD_SYNC", () => {
  const transmission = normalizeTransmission(
    livePayload({ storedOffline: true }),
    RECEIVED_AT
  );

  assert.equal(transmission.source, "SD_SYNC");
  assert.equal(transmission.storedOffline, true);
});

test("offline duration is derived from capturedAt when not reported", () => {
  const transmission = normalizeTransmission(sdPayload(), RECEIVED_AT);

  // 12:00:00 - 11:30:00 = 30 minutes
  assert.equal(transmission.offlineDurationMs, 30 * 60 * 1000);
});

test("explicit offlineDurationMs is respected over derivation", () => {
  const transmission = normalizeTransmission(
    sdPayload({ transmission: { source: "SD_SYNC", offlineDurationMs: 1234 } }),
    RECEIVED_AT
  );

  assert.equal(transmission.offlineDurationMs, 1234);
});

test("validateReading rejects unknown transmission.source and syncStatus", () => {
  const badSource = validateReading(livePayload({ transmission: { source: "FAKE" } }));
  assert.ok(badSource.includes("invalid transmission.source"));

  const badStatus = validateReading(livePayload({ transmission: { syncStatus: "MAYBE" } }));
  assert.ok(badStatus.includes("invalid transmission.syncStatus"));
});

test("validateReading still accepts a plain legacy payload", () => {
  assert.deepEqual(validateReading(livePayload()), []);
});

// ============================================================
// normalizeTelemetry metadata
// ============================================================

test("normalizeTelemetry produces the full transmission metadata block for LIVE", () => {
  const normalized = normalizeTelemetry(livePayload(), "DEV001", "SHIP-1", RECEIVED_AT);

  assert.equal(normalized.ingestionSource, undefined); // set by consumer, not model
  assert.equal(normalized.transmission.source, "LIVE");
  assert.equal(normalized.transmission.storedOffline, false);
  assert.equal(normalized.transmission.syncStatus, "LIVE");
});

test("normalizeTelemetry preserves capturedAt and capture timestamp for SD_SYNC", () => {
  const normalized = normalizeTelemetry(sdPayload(), "DEV001", "SHIP-1", RECEIVED_AT);

  assert.equal(normalized.transmission.source, "SD_SYNC");
  assert.equal(normalized.transmission.storedOffline, true);
  assert.equal(normalized.capturedAt.toISOString(), "2026-01-15T11:30:00.000Z");
  // The original capture timestamp must survive and be used as `timestamp`.
  assert.equal(normalized.timestamp.toISOString(), "2026-01-15T11:30:00.000Z");
  assert.equal(normalized.timeSource, "GPS");
  assert.equal(normalized.clockValid, true);
});

test("normalizeTelemetry keeps live readings working normally", () => {
  const normalized = normalizeTelemetry(livePayload(), "DEV001", "SHIP-1", RECEIVED_AT);

  assert.equal(normalized.temperature, 25);
  assert.equal(normalized.sequenceNumber, 10);
  assert.equal(normalized.timestamp.toISOString(), "2026-01-15T11:59:50.000Z");
});

// ============================================================
// Integrity: hash chaining + sequence continuity
// ============================================================

test("generateTelemetryHash ignores integrity bookkeeping fields", () => {
  const base = normalizeTelemetry(livePayload(), "DEV001", "SHIP-1", RECEIVED_AT);
  const hash = generateTelemetryHash(base);

  const withMeta = {
    ...base,
    dataHash: "irrelevant",
    checkpointId: "cp-1",
    checkpointed: true,
    _id: "abc",
  };

  assert.equal(generateTelemetryHash(withMeta), hash);
});

test("verifyTelemetryReading detects a modified sensor value", () => {
  const reading = normalizeTelemetry(livePayload(), "DEV001", "SHIP-1", RECEIVED_AT);
  reading.dataHash = generateTelemetryHash(reading);
  assert.equal(verifyTelemetryReading(reading), true);

  const tampered = { ...reading, temperature: 99 };
  assert.equal(verifyTelemetryReading(tampered), false);
});

test("genesis reading chains from the fixed sentinel", () => {
  const first = normalizeTelemetry(livePayload({ sequenceNumber: 1 }), "DEV001", null, RECEIVED_AT);
  assert.equal(resolvePreviousHash(null), GENESIS_PREVIOUS_HASH);
  assert.equal(resolvePreviousHash(undefined), GENESIS_PREVIOUS_HASH);
  assert.equal(
    resolvePreviousHash({ dataHash: "abc" }),
    "abc"
  );
  assert.ok(first.sequenceNumber === 1);
});

test("generateTelemetryHashChained depends on the previous reading's hash", () => {
  const first = normalizeTelemetry(livePayload({ sequenceNumber: 1, temperature: 20 }), "DEV001", null, RECEIVED_AT);
  const second = normalizeTelemetry(livePayload({ sequenceNumber: 2, temperature: 21 }), "DEV001", null, RECEIVED_AT);

  const chainA = generateTelemetryHashChained(second, first);
  const chainB = generateTelemetryHashChained(second, { ...first, dataHash: "different" });

  assert.notEqual(chainA, chainB);
});

test("verifySequenceContinuity accepts a clean, gap-free chain", () => {
  const readings = [1, 2, 3].map((sequenceNumber) =>
    withHash(
      normalizeTelemetry(livePayload({ sequenceNumber, temperature: 20 + sequenceNumber }), "DEV001", null, RECEIVED_AT)
    )
  );

  // Link them up.
  readings[1].previousHash = readings[0].dataHash;
  readings[2].previousHash = readings[1].dataHash;

  const result = verifySequenceContinuity(readings);
  assert.equal(result.valid, true);
  assert.equal(result.reason, null);
});

test("verifySequenceContinuity flags a modified reading", () => {
  const readings = [1, 2].map((sequenceNumber) =>
    withHash(
      normalizeTelemetry(livePayload({ sequenceNumber, temperature: 20 + sequenceNumber }), "DEV001", null, RECEIVED_AT)
    )
  );
  readings[1].previousHash = readings[0].dataHash;
  readings[0].temperature = 99; // tamper after hashing

  const result = verifySequenceContinuity(readings);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "data_hash_mismatch");
  assert.equal(result.brokenAtSequence, 1);
});

test("verifySequenceContinuity flags a broken previousHash link", () => {
  const readings = [1, 2].map((sequenceNumber) =>
    withHash(
      normalizeTelemetry(livePayload({ sequenceNumber, temperature: 20 + sequenceNumber }), "DEV001", null, RECEIVED_AT)
    )
  );
  readings[1].previousHash = "deadbeef".repeat(8); // wrong link

  const result = verifySequenceContinuity(readings);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "previous_hash_mismatch");
});

test("verifySequenceContinuity flags out-of-order sequences", () => {
  const readings = [2, 1].map((sequenceNumber) =>
    withHash(
      normalizeTelemetry(livePayload({ sequenceNumber, temperature: 20 }), "DEV001", null, RECEIVED_AT)
    )
  );

  const result = verifySequenceContinuity(readings);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "sequence_not_increasing");
});

test("verifySequenceContinuity skips chaining for legacy readings without previousHash", () => {
  const readings = [1, 2].map((sequenceNumber) =>
    withHash(
      normalizeTelemetry(livePayload({ sequenceNumber, temperature: 20 }), "DEV001", null, RECEIVED_AT)
    )
  );

  // No previousHash on the second reading -> backward compatible pass.
  const result = verifySequenceContinuity(readings);
  assert.equal(result.valid, true);
});

function withHash(reading) {
  reading.dataHash = generateTelemetryHash(reading);
  return reading;
}
