import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeGps,
  resolveTelemetryTimestamp,
  normalizeTelemetry,
} from "../models/telemetry.js";

import {
  reverseGeocodeLocation,
  distanceMeters,
  clearGeocodingCache,
} from "../services/geocodingService.js";

const RECEIVED_AT = new Date("2026-01-15T12:00:00.000Z");

// ============================================================
// GPS normalization
// ============================================================

test("normalizeGps keeps coordinates when the fix is valid", () => {
  const gps = normalizeGps({
    latitude: 25.3176,
    longitude: 82.9739,
    gpsValid: true,
    satelliteCount: 9,
    hdop: 0.8,
    accuracy: 4.5,
  });

  assert.equal(gps.gpsValid, true);
  assert.equal(gps.latitude, 25.3176);
  assert.equal(gps.longitude, 82.9739);
  assert.equal(gps.satelliteCount, 9);
  assert.equal(gps.hdop, 0.8);
  assert.equal(gps.accuracy, 4.5);
});

test("normalizeGps clears coordinates when the fix is explicitly invalid", () => {
  const gps = normalizeGps({
    latitude: 25.3176,
    longitude: 82.9739,
    gpsValid: false,
  });

  assert.equal(gps.gpsValid, false);
  assert.equal(gps.latitude, null);
  assert.equal(gps.longitude, null);
});

test("normalizeGps invalidates fixes with out-of-range coordinates", () => {
  const gps = normalizeGps({
    latitude: 95,
    longitude: 82.9739,
    gpsValid: true,
  });

  assert.equal(gps.gpsValid, false);
  assert.equal(gps.latitude, null);
  assert.equal(gps.longitude, null);
});

test("normalizeGps reads nested gps object", () => {
  const gps = normalizeGps({
    gps: {
      valid: true,
      latitude: 12.34,
      longitude: 56.78,
      satelliteCount: 7,
      hdop: 1.2,
      accuracyMeters: 6,
    },
  });

  assert.equal(gps.gpsValid, true);
  assert.equal(gps.latitude, 12.34);
  assert.equal(gps.longitude, 56.78);
  assert.equal(gps.satelliteCount, 7);
  assert.equal(gps.accuracy, 6);
});

test("normalizeGps rejects absurd satellite / hdop values", () => {
  const gps = normalizeGps({
    latitude: 1,
    longitude: 1,
    satelliteCount: 500,
    hdop: 0,
  });

  assert.equal(gps.satelliteCount, null);
  assert.equal(gps.hdop, null);
});

// ============================================================
// Timestamp priority: GPS -> RTC -> server
// ============================================================

test("timestamp prefers a plausible GPS time", () => {
  const resolved = resolveTelemetryTimestamp(
    {
      gpsTimestamp: "2026-01-15T11:59:50.000Z",
      rtcTimestamp: "2026-01-15T11:59:40.000Z",
    },
    RECEIVED_AT,
    true
  );

  assert.equal(resolved.timeSource, "GPS");
  assert.equal(resolved.clockValid, true);
  assert.equal(resolved.clockFallbackReason, null);
  assert.equal(resolved.timestamp.toISOString(), "2026-01-15T11:59:50.000Z");
});

test("timestamp falls back to RTC when the GPS fix is invalid", () => {
  const resolved = resolveTelemetryTimestamp(
    {
      gpsTimestamp: "2026-01-15T11:59:50.000Z",
      rtcTimestamp: "2026-01-15T11:59:40.000Z",
    },
    RECEIVED_AT,
    false
  );

  assert.equal(resolved.timeSource, "RTC");
  assert.equal(resolved.clockValid, true);
  assert.equal(resolved.timestamp.toISOString(), "2026-01-15T11:59:40.000Z");
});

test("timestamp falls back to server time when no device time exists", () => {
  const resolved = resolveTelemetryTimestamp({}, RECEIVED_AT, false);

  assert.equal(resolved.timeSource, "SERVER");
  assert.equal(resolved.clockValid, false);
  assert.equal(resolved.clockFallbackReason, "missing");
  assert.equal(resolved.timestamp.toISOString(), RECEIVED_AT.toISOString());
});

test("timestamp rejects unrealistically old device dates", () => {
  const resolved = resolveTelemetryTimestamp(
    { rtcTimestamp: "1999-01-01T00:00:00.000Z" },
    RECEIVED_AT,
    false
  );

  assert.equal(resolved.timeSource, "SERVER");
  assert.equal(resolved.clockValid, false);
  assert.equal(resolved.clockFallbackReason, "timestamp_out_of_range");
});

test("timestamp rejects device dates too far in the future", () => {
  const resolved = resolveTelemetryTimestamp(
    { rtcTimestamp: "2026-01-20T00:00:00.000Z" },
    RECEIVED_AT,
    false
  );

  assert.equal(resolved.timeSource, "SERVER");
  assert.equal(resolved.clockValid, false);
  assert.equal(resolved.clockFallbackReason, "timestamp_in_future");
});

test("timestamp accepts small future clock skew (RTC drift)", () => {
  const resolved = resolveTelemetryTimestamp(
    { rtcTimestamp: "2026-01-15T12:02:00.000Z" },
    RECEIVED_AT,
    false
  );

  assert.equal(resolved.timeSource, "RTC");
  assert.equal(resolved.clockValid, true);
});

// ============================================================
// normalizeTelemetry end-to-end
// ============================================================

test("normalizeTelemetry always populates timeSource and clockValid", () => {
  const normalized = normalizeTelemetry(
    {
      deviceId: "IGNORED",
      sequenceNumber: 7,
      temperature: 25,
      humidity: 55,
      battery: 80,
    },
    "DEV001",
    "SHIP-1",
    RECEIVED_AT
  );

  assert.equal(normalized.deviceId, "DEV001");
  assert.equal(normalized.shipmentId, "SHIP-1");
  assert.equal(normalized.timeSource, "SERVER");
  assert.equal(normalized.clockValid, false);
});

test("normalizeTelemetry uses authoritative shipment and clears bad GPS", () => {
  const normalized = normalizeTelemetry(
    {
      deviceId: "IGNORED",
      sequenceNumber: 8,
      temperature: 25,
      humidity: 55,
      battery: 80,
      latitude: 95,
      longitude: 82.9,
      shipmentId: "PAYLOAD-SHIPMENT",
    },
    "DEV001",
    "AUTHORITATIVE-SHIPMENT",
    RECEIVED_AT
  );

  assert.equal(normalized.shipmentId, "AUTHORITATIVE-SHIPMENT");
  assert.equal(normalized.gpsValid, false);
  assert.equal(normalized.latitude, null);
  assert.equal(normalized.longitude, null);
  // Stored even though GPS was unusable.
  assert.equal(normalized.temperature, 25);
});

test("normalizeTelemetry keeps the reading when only GPS is missing", () => {
  const normalized = normalizeTelemetry(
    {
      deviceId: "IGNORED",
      sequenceNumber: 9,
      temperature: 30,
      humidity: 60,
      battery: 75,
    },
    "DEV002",
    null,
    RECEIVED_AT
  );

  assert.equal(normalized.shipmentId, null);
  assert.equal(normalized.gpsValid, false);
  assert.equal(normalized.location, null);
  assert.equal(normalized.temperature, 30);
});

// ============================================================
// Geocoding service
// ============================================================

function jsonResponse(payload, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    async json() {
      return payload;
    },
  };
}

test("reverseGeocodeLocation maps address parts into a place", async () => {
  clearGeocodingCache();

  const result = await reverseGeocodeLocation({
    latitude: 25.3176,
    longitude: 82.9739,
    receivedAt: RECEIVED_AT,
    configOverride: {
      enabled: true,
      endpoint: "https://example.test/reverse",
      userAgent: "AgriTraceTest/1.0",
      timeoutMs: 1000,
      movementMeters: 100,
      cacheTtlMs: 60000,
      cacheMaxEntries: 10,
    },
    fetchImpl: async () =>
      jsonResponse({
        display_name: "Varanasi, Uttar Pradesh, India",
        address: {
          city: "Varanasi",
          state: "Uttar Pradesh",
          country: "India",
          country_code: "in",
        },
      }),
  });

  assert.equal(result.displayName, "Varanasi, Uttar Pradesh, India");
  assert.equal(result.city, "Varanasi");
  assert.equal(result.locality, "Varanasi");
  assert.equal(result.state, "Uttar Pradesh");
  assert.equal(result.country, "India");
  assert.equal(result.countryCode, "IN");
  assert.equal(result.source, "geocoding");
});

test("reverseGeocodeLocation reuses the previous place when movement is small", async () => {
  clearGeocodingCache();

  let calls = 0;

  const previousLocation = {
    displayName: "Varanasi, Uttar Pradesh, India",
    locality: "Varanasi",
    state: "Uttar Pradesh",
    country: "India",
    latitude: 25.3176,
    longitude: 82.9739,
  };

  const result = await reverseGeocodeLocation({
    latitude: 25.3177,
    longitude: 82.9739,
    previousLocation,
    receivedAt: RECEIVED_AT,
    configOverride: {
      enabled: true,
      endpoint: "https://example.test/reverse",
      userAgent: "AgriTraceTest/1.0",
      timeoutMs: 1000,
      movementMeters: 100,
      cacheTtlMs: 60000,
      cacheMaxEntries: 10,
    },
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({});
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.source, "movement-cache");
  assert.equal(result.displayName, "Varanasi, Uttar Pradesh, India");
});

test("reverseGeocodeLocation returns null when disabled (no network call)", async () => {
  clearGeocodingCache();

  let calls = 0;

  const result = await reverseGeocodeLocation({
    latitude: 25.3176,
    longitude: 82.9739,
    receivedAt: RECEIVED_AT,
    configOverride: { enabled: false },
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({});
    },
  });

  assert.equal(result, null);
  assert.equal(calls, 0);
});

test("reverseGeocodeLocation never throws when the provider fails", async () => {
  clearGeocodingCache();

  const result = await reverseGeocodeLocation({
    latitude: 10,
    longitude: 20,
    receivedAt: RECEIVED_AT,
    configOverride: {
      enabled: true,
      endpoint: "https://example.test/reverse",
      userAgent: "AgriTraceTest/1.0",
      timeoutMs: 1000,
      movementMeters: 100,
      cacheTtlMs: 60000,
      cacheMaxEntries: 10,
    },
    fetchImpl: async () => {
      throw new Error("network down");
    },
  });

  assert.equal(result, null);
});

test("reverseGeocodeLocation caches successful lookups by coordinate", async () => {
  clearGeocodingCache();

  let calls = 0;

  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse({
      display_name: "Delhi, India",
      address: { city: "Delhi", country: "India", country_code: "in" },
    });
  };

  const options = {
    latitude: 28.6139,
    longitude: 77.209,
    receivedAt: RECEIVED_AT,
    configOverride: {
      enabled: true,
      endpoint: "https://example.test/reverse",
      userAgent: "AgriTraceTest/1.0",
      timeoutMs: 1000,
      movementMeters: 0,
      cacheTtlMs: 60000,
      cacheMaxEntries: 10,
    },
    fetchImpl,
  };

  const first = await reverseGeocodeLocation(options);
  const second = await reverseGeocodeLocation({
    ...options,
    receivedAt: new Date(RECEIVED_AT.getTime() + 1000),
  });

  assert.equal(calls, 1);
  assert.equal(first.displayName, "Delhi, India");
  assert.equal(second.displayName, "Delhi, India");
  assert.equal(second.source, "coordinate-cache");
});

test("distanceMeters returns infinity for missing coordinates", () => {
  assert.equal(
    distanceMeters({ latitude: 1, longitude: 1 }, {}),
    Number.POSITIVE_INFINITY
  );
});
