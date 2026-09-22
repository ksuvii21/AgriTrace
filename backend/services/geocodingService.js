import { config } from "../core/config.js";

const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const EARTH_RADIUS_METERS = 6371008.8;

function distanceMeters(from, to) {
  if (
    !Number.isFinite(from?.latitude) ||
    !Number.isFinite(from?.longitude) ||
    !Number.isFinite(to?.latitude) ||
    !Number.isFinite(to?.longitude)
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const toRadians = (value) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function firstAddressValue(address, keys) {
  for (const key of keys) {
    if (typeof address?.[key] === "string" && address[key].trim()) {
      return address[key].trim();
    }
  }
  return null;
}

function uniqueParts(parts) {
  const seen = new Set();
  return parts.filter((part) => {
    if (!part || seen.has(part.toLowerCase())) return false;
    seen.add(part.toLowerCase());
    return true;
  });
}

function buildPlace(address = {}, fallbackDisplayName = null) {
  const locality = firstAddressValue(address, [
    "city",
    "town",
    "village",
    "municipality",
    "county",
    "suburb",
  ]);
  const district = firstAddressValue(address, [
    "city_district",
    "district",
    "county",
    "state_district",
  ]);
  const state = firstAddressValue(address, ["state", "province", "region"]);
  const country = firstAddressValue(address, ["country", "country_name"]);
  const displayName =
    uniqueParts([locality, state, country]).join(", ") ||
    (typeof fallbackDisplayName === "string" && fallbackDisplayName.trim()
      ? fallbackDisplayName.trim()
      : null);

  if (!displayName) return null;

  return {
    locality,
    city: locality,
    district,
    state,
    country,
    countryCode:
      typeof address.country_code === "string" && address.country_code.trim()
        ? address.country_code.trim().toUpperCase()
        : null,
    displayName,
  };
}

function coordinateCacheKey(latitude, longitude) {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

const coordinateCache = new Map();
const inFlightRequests = new Map();

function readCachedPlace(latitude, longitude, now, settings) {
  const entry = coordinateCache.get(coordinateCacheKey(latitude, longitude));
  if (!entry || entry.expiresAt <= now) {
    if (entry) coordinateCache.delete(coordinateCacheKey(latitude, longitude));
    return null;
  }

  coordinateCache.delete(coordinateCacheKey(latitude, longitude));
  coordinateCache.set(coordinateCacheKey(latitude, longitude), entry);
  return entry.place ? { ...entry.place, cached: true } : null;
}

function writeCache(latitude, longitude, place, expiresAt, now, settings) {
  const key = coordinateCacheKey(latitude, longitude);
  coordinateCache.delete(key);
  coordinateCache.set(key, { place, expiresAt });

  while (coordinateCache.size > settings.cacheMaxEntries) {
    coordinateCache.delete(coordinateCache.keys().next().value);
  }

  if (now) {
    for (const [key, entry] of coordinateCache) {
      if (entry.expiresAt <= now) coordinateCache.delete(key);
    }
  }
}

function withCoordinates(place, latitude, longitude, source, receivedAt) {
  if (!place) return null;
  return {
    latitude,
    longitude,
    locality: place.locality ?? null,
    city: place.city ?? null,
    district: place.district ?? null,
    state: place.state ?? null,
    country: place.country ?? null,
    countryCode: place.countryCode ?? null,
    displayName: place.displayName,
    source,
    geocodedAt: place.geocodedAt || receivedAt.toISOString(),
  };
}

export function clearGeocodingCache() {
  coordinateCache.clear();
  inFlightRequests.clear();
}

export async function reverseGeocodeLocation({
  latitude,
  longitude,
  previousLocation = null,
  receivedAt = new Date(),
  fetchImpl = globalThis.fetch,
  configOverride = {},
} = {}) {
  const settings = {
    enabled: configOverride.enabled ?? config.geocodingEnabled,
    endpoint: configOverride.endpoint ?? config.geocodingEndpoint,
    userAgent: configOverride.userAgent ?? config.geocodingUserAgent,
    timeoutMs: configOverride.timeoutMs ?? config.geocodingTimeoutMs,
    movementMeters: configOverride.movementMeters ?? config.geocodingMovementMeters,
    cacheTtlMs: configOverride.cacheTtlMs ?? config.geocodingCacheTtlMs,
    cacheMaxEntries:
      configOverride.cacheMaxEntries ?? config.geocodingCacheMaxEntries,
  };
  const now = receivedAt instanceof Date && Number.isFinite(receivedAt.getTime())
    ? receivedAt
    : new Date();

  if (
    !settings.enabled ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    !settings.endpoint ||
    !settings.userAgent
  ) {
    return null;
  }

  const previousPlace = previousLocation?.location && previousLocation.location.displayName
    ? previousLocation.location
    : previousLocation;
  if (
    previousPlace?.displayName &&
    distanceMeters(previousPlace, { latitude, longitude }) <= settings.movementMeters
  ) {
    return withCoordinates(
      previousPlace,
      latitude,
      longitude,
      "movement-cache",
      now
    );
  }

  const cached = readCachedPlace(latitude, longitude, now, settings);
  if (cached) {
    return withCoordinates(cached, latitude, longitude, "coordinate-cache", now);
  }

  const key = coordinateCacheKey(latitude, longitude);
  if (inFlightRequests.has(key)) {
    const place = await inFlightRequests.get(key);
    return withCoordinates(place, latitude, longitude, "coordinate-cache", now);
  }

  const request = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);
      const url = new URL(settings.endpoint);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("zoom", "10");
      url.searchParams.set("lat", String(latitude));
      url.searchParams.set("lon", String(longitude));

      const response = await fetchImpl(url, {
        method: "GET",
        headers: {
          "User-Agent": settings.userAgent,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Geocoding provider returned HTTP ${response.status}`);
      }

      const payload = await response.json();
      const place = buildPlace(payload.address, payload.display_name);
      const expiresAt = now.getTime() + settings.cacheTtlMs;

      if (place) {
        place.geocodedAt = now.toISOString();
        writeCache(latitude, longitude, place, expiresAt, now, settings);
      } else {
          writeCache(
            latitude,
            longitude,
            null,
            Math.min(NEGATIVE_CACHE_TTL_MS, settings.cacheTtlMs),
            now,
            settings
          );
      }

      return place;
    } catch (error) {
      writeCache(
        latitude,
        longitude,
        null,
        Math.min(NEGATIVE_CACHE_TTL_MS, settings.cacheTtlMs),
        now,
        settings
      );
      console.warn(`Reverse geocoding failed for ${latitude}, ${longitude}:`, error.message);
      return null;
    }
  })();

  inFlightRequests.set(key, request);
  try {
    const place = await request;
    return withCoordinates(place, latitude, longitude, "geocoding", now);
  } finally {
    inFlightRequests.delete(key);
  }
}

export { distanceMeters };
