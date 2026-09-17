export function validateReading(data) {
  const errors = [];

  // ========================================================
  // Identity
  // ========================================================

  if (
    typeof data.deviceId !== "string" ||
    !data.deviceId.trim()
  ) {
    errors.push("deviceId required");
  }

  // ========================================================
  // Sequence
  // ========================================================

  if (
    !Number.isInteger(data.sequenceNumber) ||
    data.sequenceNumber < 1
  ) {
    errors.push(
      "sequenceNumber must be a positive integer"
    );
  }

  // ========================================================
  // Temperature
  // ========================================================

  if (
    typeof data.temperature !== "number" ||
    !Number.isFinite(data.temperature)
  ) {
    errors.push(
      "temperature must be a number"
    );
  }

  // ========================================================
  // Humidity
  // ========================================================

  if (
    typeof data.humidity !== "number" ||
    !Number.isFinite(data.humidity) ||
    data.humidity < 0 ||
    data.humidity > 100
  ) {
    errors.push(
      "humidity must be 0-100"
    );
  }

  // ========================================================
  // Gas
  // ========================================================

  if (
    data.gasLevel !== undefined &&
    (
      typeof data.gasLevel !== "number" ||
      !Number.isFinite(data.gasLevel) ||
      data.gasLevel < 0
    )
  ) {
    errors.push(
      "gasLevel must be a non-negative number"
    );
  }

  // ========================================================
  // Battery
  // ========================================================

  if (
    typeof data.battery !== "number" ||
    !Number.isFinite(data.battery) ||
    data.battery < 0 ||
    data.battery > 100
  ) {
    errors.push(
      "battery must be 0-100"
    );
  }

  // ========================================================
  // GPS
  // ========================================================

  if (
    data.latitude !== undefined &&
    (
      typeof data.latitude !== "number" ||
      data.latitude < -90 ||
      data.latitude > 90
    )
  ) {
    errors.push(
      "invalid latitude"
    );
  }

  if (
    data.longitude !== undefined &&
    (
      typeof data.longitude !== "number" ||
      data.longitude < -180 ||
      data.longitude > 180
    )
  ) {
    errors.push(
      "invalid longitude"
    );
  }

  if (
    (
      data.latitude !== undefined &&
      data.longitude === undefined
    ) ||
    (
      data.longitude !== undefined &&
      data.latitude === undefined
    )
  ) {
    errors.push(
      "latitude and longitude must be provided together"
    );
  }

  // ========================================================
  // Timestamp
  // ========================================================

  if (
    !data.timestamp ||
    Number.isNaN(
      Date.parse(data.timestamp)
    )
  ) {
    errors.push(
      "invalid timestamp"
    );
  }

  // ========================================================
  // Optional health structures
  // ========================================================

  if (
    data.sensorHealth !== undefined &&
    (
      typeof data.sensorHealth !== "object" ||
      Array.isArray(data.sensorHealth)
    )
  ) {
    errors.push(
      "sensorHealth must be an object"
    );
  }

  if (
    data.connectivity !== undefined &&
    (
      typeof data.connectivity !== "object" ||
      Array.isArray(data.connectivity)
    )
  ) {
    errors.push(
      "connectivity must be an object"
    );
  }

  return errors;
}

export function normalizeTelemetry(
  data,
  authoritativeDeviceId = data.deviceId,
  authoritativeShipmentId = data.shipmentId ?? null
) {
  return {
    deviceId: authoritativeDeviceId,

    // IMPORTANT
    sequenceNumber: Number(data.sequenceNumber),

    shipmentId: authoritativeShipmentId,

    temperature:
      data.temperature != null
        ? Number(data.temperature)
        : null,

    humidity:
      data.humidity != null
        ? Number(data.humidity)
        : null,

    gasLevel:
      data.gasLevel != null
        ? Number(data.gasLevel)
        : null,

    battery:
      data.battery != null
        ? Number(data.battery)
        : null,

    latitude:
      data.latitude != null
        ? Number(data.latitude)
        : null,

    longitude:
      data.longitude != null
        ? Number(data.longitude)
        : null,

    timestamp:
      data.timestamp
        ? new Date(data.timestamp)
        : new Date(),
  };
}