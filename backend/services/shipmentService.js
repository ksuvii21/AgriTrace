import { randomUUID } from "crypto";
import { getCollection } from "../core/mongo.js";
import { Role } from "../core/roles.js";
import { SHIPMENT_STATUS, ALLOWED_STATUS_TRANSITIONS } from "../utils/constants.js";
import { addTimelineEvent } from "./timelineService.js";
import { buildShipmentAccessFilter, canAccessShipment } from "../core/accessControl.js";

export function validateThresholds(thresholds) {
  if (thresholds === undefined || thresholds === null) return;
  if (typeof thresholds !== "object" || Array.isArray(thresholds)) {
    const error = new Error("Invalid thresholds");
    error.code = "INVALID_THRESHOLDS";
    throw error;
  }

  const temperature = thresholds.temperature;
  if (temperature !== undefined && temperature !== null) {
    if (typeof temperature !== "object") {
      const error = new Error("Temperature thresholds must be an object");
      error.code = "INVALID_THRESHOLDS";
      throw error;
    }

    if (temperature.min != null && !isFiniteNumber(temperature.min)) {
      const error = new Error("Temperature minimum must be numeric");
      error.code = "INVALID_THRESHOLDS";
      throw error;
    }

    if (temperature.max != null && !isFiniteNumber(temperature.max)) {
      const error = new Error("Temperature maximum must be numeric");
      error.code = "INVALID_THRESHOLDS";
      throw error;
    }

    if (temperature.min != null && temperature.max != null && temperature.min >= temperature.max) {
      const error = new Error("Temperature minimum must be lower than maximum");
      error.code = "INVALID_THRESHOLDS";
      throw error;
    }
  }

  const humidity = thresholds.humidity;
  if (humidity !== undefined && humidity !== null) {
    if (typeof humidity !== "object") {
      const error = new Error("Humidity thresholds must be an object");
      error.code = "INVALID_THRESHOLDS";
      throw error;
    }

    if (humidity.min != null && (!isFiniteNumber(humidity.min) || humidity.min < 0 || humidity.min > 100)) {
      const error = new Error("Humidity minimum must be between 0 and 100");
      error.code = "INVALID_THRESHOLDS";
      throw error;
    }

    if (humidity.max != null && (!isFiniteNumber(humidity.max) || humidity.max < 0 || humidity.max > 100)) {
      const error = new Error("Humidity maximum must be between 0 and 100");
      error.code = "INVALID_THRESHOLDS";
      throw error;
    }

    if (humidity.min != null && humidity.max != null && humidity.min >= humidity.max) {
      const error = new Error("Humidity minimum must be lower than maximum");
      error.code = "INVALID_THRESHOLDS";
      throw error;
    }
  }

  const gasLevel = thresholds.gasLevel;
  if (gasLevel !== undefined && gasLevel !== null) {
    if (typeof gasLevel !== "object") {
      const error = new Error("Gas threshold must be an object");
      error.code = "INVALID_THRESHOLDS";
      throw error;
    }

    if (gasLevel.max != null && (!isFiniteNumber(gasLevel.max) || gasLevel.max < 0)) {
      const error = new Error("Gas threshold must be a non-negative number");
      error.code = "INVALID_THRESHOLDS";
      throw error;
    }
  }
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

const SHIPMENT_SENSOR_FIELDS = [
  "temperature",
  "humidity",
  "battery",
  "gas",
  "gasLevel",
  "latitude",
  "longitude",
  "progress",
  "stage",
  "temp",
  "device",
  "latestTelemetry",
];

function sanitizeShipment(shipment) {
  if (!shipment || typeof shipment !== "object") return shipment;
  const cleaned = { ...shipment };
  for (const field of SHIPMENT_SENSOR_FIELDS) {
    delete cleaned[field];
  }
  return cleaned;
}

export async function createShipment(data, createdBy, role) {
  const {
    thresholds: incomingThresholds,
    assignedDevice: _ignoredAssignedDevice,
    status: _ignoredStatus,
    shipmentId: _ignoredShipmentId,
    deviceId: _ignoredDeviceId,
    temperature: _t,
    humidity: _h,
    battery: _b,
    gas: _g,
    gasLevel: _gl,
    latitude: _lat,
    longitude: _lon,
    progress: _p,
    stage: _st,
    temp: _temp,
    device: _device,
    latestTelemetry: _lt,
    ...safeData
  } = data || {};

  const thresholds = incomingThresholds || {
    temperature: { min: null, max: null },
    humidity: { min: null, max: null },
    gasLevel: { max: null },
  };

  validateThresholds(thresholds);

  const shipmentId = randomUUID();

  const { randomBytes } = await import("crypto");
  let trackingId = data?.trackingId;
  if (!trackingId) {
    const shipments = getCollection("shipments");
    let exists = true;
    while (exists) {
      trackingId = `AGR-${randomBytes(4).toString("hex").toUpperCase()}`;
      const existing = await shipments.findOne({ trackingId });
      if (existing) {
        exists = true;
      } else {
        exists = false;
      }
    }
  }
  const now = new Date().toISOString();

  const shipmentData = {
    ...safeData,
    shipmentId,
    trackingId,
    createdBy,
    transporterId: null,
    warehouseId: null,
    retailerId: null,
    assignedDevice: null,
    status: SHIPMENT_STATUS.PENDING,
    thresholds,
    createdAt: now,
    updatedAt: now,
  };

  if (role === Role.FARMER) {
    shipmentData.farmerId = createdBy;
  }

  const shipments = getCollection("shipments");
  try {
    await shipments.insertOne(shipmentData);
  } catch (error) {
    if (error.code === 11000) {
      const dupError = new Error("Shipment ID conflict");
      dupError.code = "SHIPMENT_CONFLICT";
      throw dupError;
    }
    throw error;
  }

  try {
    const { TimelineEventType } = await import("../core/timelineEvents.js");
    await addTimelineEvent(
      shipmentId,
      TimelineEventType.SHIPMENT_CREATED,
      createdBy,
      { status: shipmentData.status }
    );
  } catch (error) {
    console.error("Shipment creation timeline error:", error.message);
  }

  return shipmentData;
}

export async function updateShipmentName(shipmentId, name, actorId = null) {
  if (!name || typeof name !== "string" || !name.trim()) {
    throw new Error("Name is required");
  }

  const shipments = getCollection("shipments");
  const shipment = await shipments.findOne({ shipmentId });

  if (!shipment) return null;

  const trimmedName = name.trim();
  const result = await shipments.updateOne(
    { shipmentId },
    { $set: { name: trimmedName, updatedAt: new Date().toISOString() } }
  );

  if (result.matchedCount === 0) return null;

  if (actorId) {
    await addTimelineEvent(shipmentId, "SHIPMENT_NAME_UPDATED", actorId, { name: trimmedName });
  }

  return sanitizeShipment(await shipments.findOne({ shipmentId }));
}

export async function updateShipmentThresholds(shipmentId, thresholds, actorId = null) {
  validateThresholds(thresholds);

  const shipments = getCollection("shipments");
  const result = await shipments.updateOne(
    { shipmentId },
    { $set: { thresholds, updatedAt: new Date().toISOString() } }
  );

  if (result.matchedCount === 0) return null;

  if (actorId) {
    await addTimelineEvent(shipmentId, "THRESHOLDS_UPDATED", actorId, { thresholds });
  }

  return sanitizeShipment(await shipments.findOne({ shipmentId }));
}

export async function updateShipmentStatus(shipmentId, status, actorId, actorRole = null) {
  if (!Object.values(SHIPMENT_STATUS).includes(status)) {
    throw new Error("Invalid shipment status");
  }

  const shipments = getCollection("shipments");
  const shipment = await shipments.findOne({ shipmentId });

  if (!shipment) return null;

  const access = buildShipmentAccessFilter({ uid: actorId, role: actorRole });
  const shipmentWithAccess = await shipments.findOne({ shipmentId, ...access });
  if (!shipmentWithAccess) return null;

  const currentStatus = shipment.status;
  if (currentStatus === status) {
    return sanitizeShipment(shipment);
  }

  const allowedNextStatuses = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
  if (!allowedNextStatuses.includes(status)) {
    throw new Error(`Invalid shipment transition from ${currentStatus} to ${status}`);
  }

  if (actorRole && actorRole !== Role.ADMIN) {
    const roleMap = {
      [Role.FARMER]: [SHIPMENT_STATUS.PENDING, SHIPMENT_STATUS.DEVICE_ASSIGNED, SHIPMENT_STATUS.READY_FOR_DISPATCH],
      [Role.TRANSPORTER]: [SHIPMENT_STATUS.IN_TRANSIT, SHIPMENT_STATUS.AT_WAREHOUSE],
      [Role.WAREHOUSE]: [SHIPMENT_STATUS.AT_WAREHOUSE, SHIPMENT_STATUS.DELIVERED],
      [Role.RETAILER]: [SHIPMENT_STATUS.DELIVERED],
    };

    const permittedStatuses = roleMap[actorRole] || [];
    if (!permittedStatuses.includes(status)) {
      throw new Error(`Role ${actorRole} is not allowed to update shipment to ${status}`);
    }
  }

  await shipments.updateOne(
    { shipmentId },
    { $set: { status, updatedAt: new Date().toISOString() } }
  );

  const timelineMap = {
    [SHIPMENT_STATUS.PENDING]: "SHIPMENT_PENDING",
    [SHIPMENT_STATUS.DEVICE_ASSIGNED]: "DEVICE_ASSIGNED",
    [SHIPMENT_STATUS.READY_FOR_DISPATCH]: "READY_FOR_DISPATCH",
    [SHIPMENT_STATUS.IN_TRANSIT]: "SHIPMENT_DISPATCHED",
    [SHIPMENT_STATUS.AT_WAREHOUSE]: "WAREHOUSE_RECEIVED",
    [SHIPMENT_STATUS.DELIVERED]: "DELIVERY_COMPLETED",
    [SHIPMENT_STATUS.CANCELLED]: "SHIPMENT_CANCELLED",
  };

  await addTimelineEvent(shipmentId, timelineMap[status], actorId, { status });

  return sanitizeShipment(await shipments.findOne({ shipmentId }));
}

async function validateAssignedUser(targetId, expectedRole) {
  const users = getCollection("users");
  const userDoc = await users.findOne({ uid: targetId });
  if (!userDoc || userDoc.role !== expectedRole) {
    const error = new Error(`Invalid ${expectedRole.toLowerCase()} user`);
    error.code = "INVALID_ASSIGNMENT";
    throw error;
  }
}

export async function assignTransporter(shipmentId, transporterId, actorId, actorRole = null) {
  const shipments = getCollection("shipments");

  const access = buildShipmentAccessFilter({ uid: actorId, role: actorRole });
  const shipment = await shipments.findOne({ shipmentId, ...access });
  if (!shipment) {
    const error = new Error("Shipment not found");
    error.code = "SHIPMENT_NOT_FOUND";
    throw error;
  }

  await validateAssignedUser(transporterId, Role.TRANSPORTER);

  const result = await shipments.updateOne(
    { shipmentId },
    { $set: { transporterId, updatedAt: new Date().toISOString() } }
  );

  if (result.matchedCount === 0) {
    const error = new Error("Shipment not found");
    error.code = "SHIPMENT_NOT_FOUND";
    throw error;
  }

  await addTimelineEvent(shipmentId, "TRANSPORTER_ASSIGNED", actorId, { transporterId });

  return sanitizeShipment(await shipments.findOne({ shipmentId }));
}

export async function assignWarehouse(shipmentId, warehouseId, actorId, actorRole = null) {
  const shipments = getCollection("shipments");

  const access = buildShipmentAccessFilter({ uid: actorId, role: actorRole });
  const shipment = await shipments.findOne({ shipmentId, ...access });
  if (!shipment) {
    const error = new Error("Shipment not found");
    error.code = "SHIPMENT_NOT_FOUND";
    throw error;
  }

  await validateAssignedUser(warehouseId, Role.WAREHOUSE);

  const result = await shipments.updateOne(
    { shipmentId },
    { $set: { warehouseId, updatedAt: new Date().toISOString() } }
  );

  if (result.matchedCount === 0) {
    const error = new Error("Shipment not found");
    error.code = "SHIPMENT_NOT_FOUND";
    throw error;
  }

  await addTimelineEvent(shipmentId, "WAREHOUSE_ASSIGNED", actorId, { warehouseId });

  return sanitizeShipment(await shipments.findOne({ shipmentId }));
}

export async function assignRetailer(shipmentId, retailerId, actorId, actorRole = null) {
  const shipments = getCollection("shipments");

  const access = buildShipmentAccessFilter({ uid: actorId, role: actorRole });
  const shipment = await shipments.findOne({ shipmentId, ...access });
  if (!shipment) {
    const error = new Error("Shipment not found");
    error.code = "SHIPMENT_NOT_FOUND";
    throw error;
  }

  await validateAssignedUser(retailerId, Role.RETAILER);

  const result = await shipments.updateOne(
    { shipmentId },
    { $set: { retailerId, updatedAt: new Date().toISOString() } }
  );

  if (result.matchedCount === 0) {
    const error = new Error("Shipment not found");
    error.code = "SHIPMENT_NOT_FOUND";
    throw error;
  }

  await addTimelineEvent(shipmentId, "RETAILER_ASSIGNED", actorId, { retailerId });

  return sanitizeShipment(await shipments.findOne({ shipmentId }));
}

export { canAccessShipment, buildShipmentAccessFilter };

export async function listShipments(uid, role) {
  const shipments = getCollection("shipments");

  const filter = buildShipmentAccessFilter({ uid, role });

  const docs = await shipments.find(filter).sort({ createdAt: -1 }).toArray();
  return docs.map(sanitizeShipment);
}

export async function getShipmentForUser(shipmentId, uid, role) {
  const access = buildShipmentAccessFilter({ uid, role });

  let shipment = await getCollection("shipments").findOne({
    shipmentId,
    ...access,
  });

  if (!shipment) {
    shipment = await getCollection("shipments").findOne({
      name: shipmentId,
      ...access,
    });
  }

  if (!shipment) return null;

  return sanitizeShipment(shipment);
}

export async function getShipment(shipmentId, uid = null, role = null) {
  const access = buildShipmentAccessFilter({ uid, role });
  let shipment = await getCollection("shipments").findOne({
    shipmentId,
    ...access,
  });
  if (!shipment) {
    shipment = await getCollection("shipments").findOne({
      name: shipmentId,
      ...access,
    });
  }
  return sanitizeShipment(shipment);
}
