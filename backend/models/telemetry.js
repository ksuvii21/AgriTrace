const SHIPMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MIN_DEVICE_TIMESTAMP = new Date("2020-01-01T00:00:00.000Z").getTime();
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseTimestamp(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  return null;
}

function isPlausibleDeviceTimestamp(date, receivedAt) {
  return (
    date.getTime() >= MIN_DEVICE_TIMESTAMP &&
    date.getTime() <= receivedAt.getTime() + MAX_FUTURE_CLOCK_SKEW_MS
  );
}

function normalizeOptionalInteger(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) return null;
  return value;
}

function normalizeOptionalNumber(value, minimum = 0, maximum = Number.MAX_VALUE) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    return null;
  }
  return value;
}

function cloneOptionalObject(value) {
  return isObject(value) ? { ...value } : null;
}

export function normalizeGps(data = {}) {
  const gps = isObject(data.gps) ? data.gps : {};
  const rawLatitude = data.latitude ?? gps.latitude;
  const rawLongitude = data.longitude ?? gps.longitude;
  const latitude = normalizeOptionalNumber(rawLatitude, -90, 90);
  const longitude = normalizeOptionalNumber(rawLongitude, -180, 180);
  const coordinatesValid = latitude !== null && longitude !== null;
  const reportedValidity = data.gpsValid ?? gps.valid;
  const gpsValid =
    typeof reportedValidity === "boolean"
      ? reportedValidity && coordinatesValid
      : coordinatesValid;

  return {
    latitude: gpsValid ? latitude : null,
    longitude: gpsValid ? longitude : null,
    gpsValid,
    satelliteCount: normalizeOptionalInteger(data.satelliteCount ?? gps.satelliteCount ?? data.satellites, 0, 99),
    hdop: normalizeOptionalNumber(data.hdop ?? gps.hdop, 0.1, 99),
    accuracy: normalizeOptionalNumber(
      data.accuracy ??
        data.gpsAccuracy ??
        data.accuracyMeters ??
        gps.accuracy ??
        gps.accuracyMeters,
      0,
      100000
    ),
  };
}

export function resolveTelemetryTimestamp(data = {}, receivedAt = new Date(), gpsValid = false) {
  const serverTime = parseTimestamp(receivedAt) || new Date();
  const gpsTimestamp = parseTimestamp(
    data.gpsTimestamp ?? data.gpsTime ?? data.gps?.timestamp ?? data.gps?.time
  );
  const rtcTimestamp = parseTimestamp(
    data.rtcTimestamp ?? data.rtcTime ?? data.rtc?.timestamp ?? data.rtc?.time ?? data.timestamp
  );
  const candidates = [
    { source: "GPS", date: gpsValid ? gpsTimestamp : null, reason: gpsValid ? null : "gps_fix_invalid" },
    { source: "RTC", date: rtcTimestamp, reason: null },
  ];

  for (const candidate of candidates) {
    if (!candidate.date) continue;
    if (isPlausibleDeviceTimestamp(candidate.date, serverTime)) {
      return {
        timestamp: candidate.date,
        deviceTimestamp: candidate.date.toISOString(),
        timeSource: candidate.source,
        clockValid: true,
        clockFallbackReason: null,
      };
    }

    candidate.reason =
      candidate.date.getTime() < MIN_DEVICE_TIMESTAMP
        ? "timestamp_out_of_range"
        : "timestamp_in_future";
  }

  const failedGps = gpsValid && !gpsTimestamp;
  const failedRtc = !rtcTimestamp;
  const lastReason = candidates[1].reason || candidates[0].reason;

  return {
    timestamp: serverTime,
    deviceTimestamp: null,
    timeSource: "SERVER",
    clockValid: false,
    clockFallbackReason: failedGps || failedRtc ? "missing" : lastReason,
  };
}

export function validateReading(data = {}) {
  const errors = [];

  if (!isObject(data)) {
    return ["payload must be a JSON object"];
  }

  if (
    typeof data.deviceId !== "string" ||
    !DEVICE_ID_PATTERN.test(data.deviceId)
  ) {
    errors.push("invalid deviceId");
  }

  if (!Number.isInteger(data.sequenceNumber) || data.sequenceNumber <= 0) {
    errors.push("sequenceNumber must be a positive integer");
  }

  for (const field of ["temperature", "humidity", "battery"]) {
    if (
      typeof data[field] !== "number" ||
      !Number.isFinite(data[field])
    ) {
      errors.push(`${field} must be a finite number`);
    }
  }

  if (
    data.temperature < -100 ||
    data.temperature > 300 ||
    data.humidity < 0 ||
    data.humidity > 100 ||
    data.battery < 0 ||
    data.battery > 100
  ) {
    errors.push("sensor value out of range");
  }

  if (
    data.gasLevel !== undefined &&
    (
      typeof data.gasLevel !== "number" ||
      !Number.isFinite(data.gasLevel) ||
      data.gasLevel < 0
    )
  ) {
    errors.push("gasLevel must be a non-negative finite number");
  }

  if (
    data.shipmentId !== undefined &&
    (
      typeof data.shipmentId !== "string" ||
      !SHIPMENT_ID_PATTERN.test(data.shipmentId)
    )
  ) {
    errors.push("invalid shipmentId");
  }

  // Optional offline-first transmission metadata (backward compatible).
  errors.push(...validateTransmission(data));

  return errors;
}

const TRANSMISSION_SOURCES = new Set(["LIVE", "SD_SYNC"]);
const SYNC_STATUSES = new Set([
  "LIVE",
  "PENDING",
  "SYNCED",
  "SYNC_FAILED",
]);

// ==========================================================
// OFFLINE-FIRST TRANSMISSION METADATA
// ==========================================================

// The firmware tells us (via the payload) whether this reading is being
// streamed live or has just been flushed from the microSD backlog.
//
// We stay fully backward compatible: a legacy payload that never sets any
// of this simply becomes a LIVE reading.

function detectTransmissionSource(data) {
  const raw = data?.transmission;
  const explicit =
    (isObject(raw) && typeof raw.source === "string" && raw.source) ||
    (typeof data?.transmissionSource === "string" && data.transmissionSource) ||
    (typeof data?.source === "string" && data.source) ||
    null;

  if (explicit) {
    const upper = String(explicit).toUpperCase();
    if (TRANSMISSION_SOURCES.has(upper)) return upper;
  }

  // Fallbacks the firmware might use to signal an SD replay.
  if (data?.storedOffline === true || data?.offlineBacklog === true || data?.sdSync === true) {
    return "SD_SYNC";
  }

  return "LIVE";
}

function normalizeSyncStatus(value, fallback) {
  if (typeof value !== "string") return fallback;
  const upper = value.toUpperCase();
  return SYNC_STATUSES.has(upper) ? upper : fallback;
}

export function normalizeTransmission(data = {}, receivedAt = new Date()) {
  const raw = isObject(data.transmission) ? data.transmission : {};
  const source = detectTransmissionSource(data);
  const storedOffline =
    source === "SD_SYNC" ||
    raw.storedOffline === true ||
    data.storedOffline === true;

  // When the backend accepts an SD-synchronized reading it is stored, so its
  // syncStatus is SYNCED. Live readings are simply LIVE.
  const defaultStatus = source === "SD_SYNC" ? "SYNCED" : "LIVE";
  const syncStatus = normalizeSyncStatus(
    raw.syncStatus ?? data.syncStatus,
    defaultStatus
  );

  // capturedAt is the moment the sensor captured the reading on-device.
  // We prefer the firmware-provided capturedAt and fall back to the
  // resolved device timestamp so the value is always meaningful.
  const capturedAt =
    parseTimestamp(raw.capturedAt ?? data.capturedAt) ||
    parseTimestamp(data.deviceTimestamp)
      ? new Date(parseTimestamp(raw.capturedAt ?? data.capturedAt) || parseTimestamp(data.deviceTimestamp))
      : null;

  // How long the record waited on the microSD before it reached the backend.
  let offlineDurationMs = null;
  if (typeof raw.offlineDurationMs === "number" && Number.isFinite(raw.offlineDurationMs)) {
    offlineDurationMs = Math.max(0, Math.round(raw.offlineDurationMs));
  } else if (storedOffline && capturedAt) {
    const delta = parseTimestamp(receivedAt).getTime() - capturedAt.getTime();
    if (Number.isFinite(delta) && delta >= 0) offlineDurationMs = delta;
  }

  const queuedAt = parseTimestamp(raw.queuedAt ?? data.queuedAt) || null;
  const syncedAt =
    source === "SD_SYNC" ? parseTimestamp(receivedAt) : null;

  return {
    source,
    storedOffline,
    syncStatus,
    queuedAt,
    capturedAt,
    syncedAt,
    offlineDurationMs,
  };
}

export function validateTransmission(data = {}) {
  const errors = [];
  const raw = isObject(data.transmission) ? data.transmission : {};
  const source = raw.source ?? data.transmissionSource ?? data.source;

  if (
    source !== undefined &&
    typeof source === "string" &&
    !TRANSMISSION_SOURCES.has(source.toUpperCase())
  ) {
    errors.push("invalid transmission.source");
  }

  const syncStatus = raw.syncStatus ?? data.syncStatus;
  if (
    syncStatus !== undefined &&
    typeof syncStatus === "string" &&
    !SYNC_STATUSES.has(syncStatus.toUpperCase())
  ) {
    errors.push("invalid transmission.syncStatus");
  }

  return errors;
}

function cloneTransmission(raw) {
  return isObject(raw) ? { ...raw } : {};
}

export function normalizeTelemetry(
  data,
  verifiedDeviceId,
  authoritativeShipmentId = data?.shipmentId ?? null,
  receivedAt = new Date()
) {
  const serverTime = parseTimestamp(receivedAt) || new Date();
  const gps = normalizeGps(data);
  const resolvedTimestamp = resolveTelemetryTimestamp(data, serverTime, gps.gpsValid);

  // Resolve once so the timestamp resolver sees the device-provided capture
  // time even when it arrives nested under `transmission.capturedAt`.
  const transmission = normalizeTransmission(data, serverTime);

  const deviceTimestamp =
    resolvedTimestamp.deviceTimestamp ??
    (transmission.capturedAt ? transmission.capturedAt.toISOString() : null);

  return {
    deviceId: verifiedDeviceId,
    sequenceNumber: data.sequenceNumber,
    shipmentId: authoritativeShipmentId || null,
    temperature: data.temperature,
    humidity: data.humidity,
    gasLevel: typeof data.gasLevel === "number" && Number.isFinite(data.gasLevel)
      ? data.gasLevel
      : null,
    battery: data.battery,
    latitude: gps.latitude,
    longitude: gps.longitude,
    gpsValid: gps.gpsValid,
    satelliteCount: gps.satelliteCount,
    hdop: gps.hdop,
    accuracy: gps.accuracy,
    timestamp: resolvedTimestamp.timestamp,
    deviceTimestamp,
    timeSource: resolvedTimestamp.timeSource,
    clockValid: resolvedTimestamp.clockValid,
    clockFallbackReason: resolvedTimestamp.clockFallbackReason,
    firmware: typeof data.firmware === "string" ? data.firmware : data.firmwareVersion ?? null,
    sensorHealth: cloneOptionalObject(data.sensorHealth),
    connectivity: cloneOptionalObject(data.connectivity),
    deviceOffline: data.deviceOffline === true,
    tamperDetected: data.tamperDetected === true,
    location: null,

    // ------------------------------------------------------
    // Offline-first transmission metadata
    // ------------------------------------------------------
    capturedAt: transmission.capturedAt,
    transmission: {
      ...cloneTransmission(data.transmission),
      source: transmission.source,
      storedOffline: transmission.storedOffline,
      syncStatus: transmission.syncStatus,
      queuedAt: transmission.queuedAt,
      capturedAt: transmission.capturedAt,
      syncedAt: transmission.syncedAt,
      offlineDurationMs: transmission.offlineDurationMs,
    },
  };
}
