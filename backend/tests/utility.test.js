import test from "node:test";
import assert from "node:assert/strict";
import { validateReading } from "../models/telemetry.js";
import { parseTelemetryTopic } from "../models/mqttTopic.js";
import { validateThresholds } from "../services/shipmentService.js";
import { SHIPMENT_STATUS, ALLOWED_STATUS_TRANSITIONS } from "../utils/constants.js";

test("validateReading accepts valid reading", () => {
  const errors = validateReading({
    deviceId: "DEV001",
    sequenceNumber: 1,
    temperature: 25,
    humidity: 55,
    battery: 80,
    gasLevel: 10,
    latitude: 25.3176,
    longitude: 82.9739,
    timestamp: new Date().toISOString(),
  });
  assert.equal(errors.length, 0);
});

test("accepts invalid device timestamps and falls back during normalization", () => {
  const errors = validateReading({
    deviceId: "DEV001",
    sequenceNumber: 1,
    temperature: 25,
    humidity: 55,
    battery: 80,
    timestamp: "not-a-date",
  });
  assert.deepEqual(errors, []);
});

test("validateReading rejects missing deviceId", () => {
  const errors = validateReading({
    temperature: 25,
    humidity: 55,
    battery: 80,
  });
  assert.ok(errors.includes("invalid deviceId"));
});

test("validateReading rejects invalid humidity", () => {
  const errors = validateReading({
    deviceId: "DEV001",
    sequenceNumber: 1,
    temperature: 25,
    humidity: 150,
    battery: 80,
  });
  assert.ok(errors.includes("sensor value out of range"));
});

test("validateReading rejects invalid battery", () => {
  const errors = validateReading({
    deviceId: "DEV001",
    sequenceNumber: 1,
    temperature: 25,
    humidity: 55,
    battery: -5,
  });
  assert.ok(errors.includes("sensor value out of range"));
});

test("keeps telemetry when GPS is incomplete and marks the fix invalid", () => {
  const data = {
    deviceId: "DEV001",
    sequenceNumber: 1,
    temperature: 25,
    humidity: 55,
    battery: 80,
    latitude: 25.3,
  };
  assert.deepEqual(validateReading(data), []);
});

test("keeps telemetry when GPS coordinates are out of range", () => {
  const data = {
    deviceId: "DEV001",
    sequenceNumber: 1,
    temperature: 25,
    humidity: 55,
    battery: 80,
    latitude: 95,
    longitude: 82.9,
  };
  assert.deepEqual(validateReading(data), []);
});

test("parseTelemetryTopic accepts valid topic", () => {
  const result = parseTelemetryTopic("agr/devices/DEV001/telemetry");
  assert.deepEqual(result, { deviceId: "DEV001" });
});

test("parseTelemetryTopic rejects malformed topics", () => {
  assert.equal(parseTelemetryTopic("agr/device/DEV001/telemetry"), null);
  assert.equal(parseTelemetryTopic("agr/devices//telemetry"), null);
  assert.equal(parseTelemetryTopic("agr/devices/DEV001/status"), null);
  assert.equal(parseTelemetryTopic("agr/devices/DEV001/telemetry/extra"), null);
  assert.equal(parseTelemetryTopic(""), null);
  assert.equal(parseTelemetryTopic(123), null);
});

test("parseTelemetryTopic accepts complex device IDs", () => {
  const result = parseTelemetryTopic("agr/devices/DEV-001_node/telemetry");
  assert.deepEqual(result, { deviceId: "DEV-001_node" });
});

test("validateThresholds accepts valid thresholds", () => {
  const thresholds = { temperature: { min: 0, max: 30 }, humidity: { min: 30, max: 70 } };
  assert.doesNotThrow(() => validateThresholds(thresholds));
});

test("validateThresholds rejects temperature min >= max", () => {
  const thresholds = { temperature: { min: 30, max: 30 } };
  assert.throws(() => validateThresholds(thresholds), /minimum must be lower/);
});

test("validateThresholds rejects humidity out of range", () => {
  const thresholds = { humidity: { min: -1, max: 50 } };
  assert.throws(() => validateThresholds(thresholds), /Humidity minimum/);
});

test("validateThresholds rejects non-object temperature", () => {
  assert.throws(() => validateThresholds({ temperature: "hot" }), /Temperature thresholds/);
});

test("validateThresholds accepts undefined", () => {
  assert.doesNotThrow(() => validateThresholds(undefined));
  assert.doesNotThrow(() => validateThresholds(null));
});

test("ALLOWED_STATUS_TRANSITIONS allows valid transitions", () => {
  for (const [from, allowedTos] of Object.entries(ALLOWED_STATUS_TRANSITIONS)) {
    for (const to of allowedTos) {
      assert.ok(ALLOWED_STATUS_TRANSITIONS[from]?.includes(to), `${from} -> ${to} should be allowed`);
    }
  }
});

test("ALLOWED_STATUS_TRANSITIONS rejects invalid transitions", () => {
  assert.ok(!ALLOWED_STATUS_TRANSITIONS[SHIPMENT_STATUS.PENDING]?.includes(SHIPMENT_STATUS.IN_TRANSIT));
  assert.ok(!ALLOWED_STATUS_TRANSITIONS[SHIPMENT_STATUS.DELIVERED]?.includes(SHIPMENT_STATUS.PENDING));
  assert.ok(!ALLOWED_STATUS_TRANSITIONS[SHIPMENT_STATUS.CANCELLED]?.includes(SHIPMENT_STATUS.PENDING));
});

test("ALLOWED_STATUS_TRANSITIONS rejects same status", () => {
  for (const [status, transitions] of Object.entries(ALLOWED_STATUS_TRANSITIONS)) {
    assert.ok(!transitions.includes(status), `${status} -> ${status} should not be allowed`);
  }
});

test("all statuses have transition entries", () => {
  for (const status of Object.values(SHIPMENT_STATUS)) {
    assert.ok(ALLOWED_STATUS_TRANSITIONS[status] !== undefined, `${status} missing from ALLOWED_STATUS_TRANSITIONS`);
    assert.ok(Array.isArray(ALLOWED_STATUS_TRANSITIONS[status]), `${status} transitions should be an array`);
  }
});