import assert from "node:assert/strict";
import test from "node:test";
import {
  clearGeocodingCache,
  distanceMeters,
  reverseGeocodeLocation,
} from "./geocodingService.js";

const receivedAt = new Date("2026-09-22T12:00:00.000Z");
const coordinates = { latitude: 25.3176, longitude: 82.9739 };
const placePayload = {
  address: {
    city: "Varanasi",
    district: "Varanasi",
    state: "Uttar Pradesh",
    country: "India",
    country_code: "in",
  },
};

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

test("builds a concise readable place", async () => {
  clearGeocodingCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(placePayload);
  };

  const location = await reverseGeocodeLocation({
    ...coordinates,
    receivedAt,
    fetchImpl,
    configOverride: {
      enabled: true,
      userAgent: "AgriTraceTest/1.0",
      endpoint: "https://geocode.test/reverse",
    },
  });

  assert.equal(location.displayName, "Varanasi, Uttar Pradesh, India");
  assert.equal(location.state, "Uttar Pradesh");
  assert.equal(location.country, "India");
  assert.equal(location.source, "geocoding");
  assert.equal(calls, 1);
});

test("reuses a nearby previous place without calling the provider", async () => {
  clearGeocodingCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(placePayload);
  };
  const previousLocation = {
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    displayName: "Varanasi, Uttar Pradesh, India",
    state: "Uttar Pradesh",
    country: "India",
  };

  const location = await reverseGeocodeLocation({
    latitude: coordinates.latitude + 0.0001,
    longitude: coordinates.longitude + 0.0001,
    previousLocation,
    receivedAt,
    fetchImpl,
    configOverride: {
      enabled: true,
      userAgent: "AgriTraceTest/1.0",
      endpoint: "https://geocode.test/reverse",
      movementMeters: 100,
    },
  });

  assert.equal(location.displayName, previousLocation.displayName);
  assert.equal(location.source, "movement-cache");
  assert.equal(calls, 0);
});

test("caches coordinate results", async () => {
  clearGeocodingCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(placePayload);
  };
  const options = {
    receivedAt,
    fetchImpl,
    configOverride: {
      enabled: true,
      userAgent: "AgriTraceTest/1.0",
      endpoint: "https://geocode.test/reverse",
      movementMeters: 0,
    },
  };

  await reverseGeocodeLocation({ ...coordinates, ...options });
  const cached = await reverseGeocodeLocation({ ...coordinates, ...options });

  assert.equal(cached.source, "coordinate-cache");
  assert.equal(calls, 1);
});

test("geocoding failure returns no place without blocking ingestion", async () => {
  clearGeocodingCache();
  const fetchImpl = async () => {
    throw new Error("network unavailable");
  };

  const location = await reverseGeocodeLocation({
    ...coordinates,
    receivedAt,
    fetchImpl,
    configOverride: {
      enabled: true,
      userAgent: "AgriTraceTest/1.0",
      endpoint: "https://geocode.test/reverse",
    },
  });

  assert.equal(location, null);
});

test("calculates movement distance", () => {
  assert.ok(distanceMeters(coordinates, coordinates) < 0.001);
  assert.ok(distanceMeters(coordinates, { latitude: 28.6139, longitude: 77.209 }) > 600000);
});
