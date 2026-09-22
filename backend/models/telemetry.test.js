import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeGps,
  normalizeTelemetry,
  resolveTelemetryTimestamp,
  validateReading,
} from "./telemetry.js";

const receivedAt = new Date("2026-09-22T12:00:00.000Z");

function validReading(overrides = {}) {
  return {
    deviceId: "DEV-001",
    sequenceNumber: 1,
    temperature: 25,
    humidity: 60,
    battery: 80,
    timestamp: "2026-09-22T11:59:59.000Z",
    ...overrides,
  };
}

test("accepts telemetry without shipmentId or device timestamp", () => {
  assert.deepEqual(validateReading(validReading({ shipmentId: undefined, timestamp: undefined })), []);

  const telemetry = normalizeTelemetry(
    validReading({ shipmentId: undefined, timestamp: undefined }),
    "DEV-001",
    null,
    receivedAt
  );

  assert.equal(telemetry.shipmentId, null);
  assert.equal(telemetry.timeSource, "SERVER");
  assert.equal(telemetry.clockValid, false);
  assert.equal(telemetry.timestamp.toISOString(), receivedAt.toISOString());
});

test("uses backend shipment assignment as authoritative", () => {
  const telemetry = normalizeTelemetry(
    validReading({ shipmentId: "PAYLOAD-SHIPMENT" }),
    "DEV-001",
    "BACKEND-SHIPMENT",
    receivedAt
  );

  assert.equal(telemetry.shipmentId, "BACKEND-SHIPMENT");
});

test("uses GPS then RTC then server timestamp fallback", () => {
  const gps = resolveTelemetryTimestamp(
    validReading({
      gpsTimestamp: "2026-09-22T11:59:58.000Z",
      rtcTimestamp: "2026-09-22T11:59:57.000Z",
    }),
    receivedAt,
    true
  );
  assert.equal(gps.timeSource, "GPS");

  const rtc = resolveTelemetryTimestamp(
    validReading({
      gpsTimestamp: "2000-01-01T00:00:00.000Z",
      rtcTimestamp: "2026-09-22T11:59:57.000Z",
    }),
    receivedAt,
    true
  );
  assert.equal(rtc.timeSource, "RTC");
  assert.equal(rtc.clockValid, true);

  const server = resolveTelemetryTimestamp(
    validReading({
      gpsTimestamp: "2000-01-01T00:00:00.000Z",
      rtcTimestamp: "1999-01-01T00:00:00.000Z",
    }),
    receivedAt,
    true
  );
  assert.equal(server.timeSource, "SERVER");
  assert.equal(server.clockValid, false);
  assert.equal(server.timestamp.toISOString(), receivedAt.toISOString());
});

test("does not reject otherwise valid telemetry for invalid device timestamps", () => {
  const data = validReading({ timestamp: "2000-01-01T00:00:00.000Z" });
  assert.deepEqual(validateReading(data), []);

  const telemetry = normalizeTelemetry(data, "DEV-001", null, receivedAt);
  assert.equal(telemetry.timeSource, "SERVER");
  assert.equal(telemetry.clockValid, false);
});

test("normalizes valid GPS metadata and rejects invalid fixes without dropping telemetry", () => {
  assert.deepEqual(
    normalizeGps({
      latitude: 25.3176,
      longitude: 82.9739,
      gpsValid: true,
      satelliteCount: 12,
      hdop: 0.9,
      accuracy: 4.5,
    }),
    {
      latitude: 25.3176,
      longitude: 82.9739,
      gpsValid: true,
      satelliteCount: 12,
      hdop: 0.9,
      accuracy: 4.5,
    }
  );

  const invalidFix = normalizeTelemetry(
    validReading({
      latitude: 25.3176,
      longitude: 82.9739,
      gpsValid: false,
    }),
    "DEV-001",
    null,
    receivedAt
  );
  assert.equal(invalidFix.gpsValid, false);
  assert.equal(invalidFix.latitude, null);
  assert.equal(invalidFix.longitude, null);
});

test("keeps backward compatibility when GPS is unavailable", () => {
  const telemetry = normalizeTelemetry(validReading({ latitude: undefined, longitude: undefined }), "DEV-001", null, receivedAt);
  assert.equal(telemetry.gpsValid, false);
  assert.equal(telemetry.latitude, null);
  assert.equal(telemetry.longitude, null);
  assert.equal(telemetry.satelliteCount, null);
  assert.equal(telemetry.hdop, null);
  assert.equal(telemetry.accuracy, null);
});
