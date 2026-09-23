import { getCollection } from "../core/mongo.js";
import { getTelemetryCollection } from "../core/mongo.js";
import { buildDeviceAccessFilter, canAccessDevice, getAccessibleShipmentIds } from "../core/accessControl.js";
import { buildShipmentAccessFilter, canAccessShipment } from "../core/accessControl.js";
import { Role } from "../core/roles.js";

export async function registerDevice(data, user) {
  const devices = getCollection("devices");
  const deviceData = {
    deviceId: data.deviceId,
    serialNumber: data.serialNumber || data.deviceId,
    location: data.location || null,
    type: data.type || "Sensor",
    ownerId: user.uid,
    status: "OFFLINE",
    currentShipmentId: null,
    battery: null,
    firmwareVersion: data.firmwareVersion || null,
    lastSeenAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await devices.insertOne(deviceData);
  } catch (error) {
    if (error.code === 11000 || error.code === "MongoServerError") {
      const dupError = new Error("Device already registered");
      dupError.code = "DEVICE_ALREADY_REGISTERED";
      throw dupError;
    }
    throw error;
  }
  return deviceData;
}

export async function listDevicesForUser(user) {
  const devices = getCollection("devices");
  const filter = await buildDeviceAccessFilter(user);
  const rawDevices = await devices.find(filter).sort({ createdAt: -1 }).toArray();
  return Promise.all(rawDevices.map(async (device) => {
    const health = await buildDeviceHealthResponse(device);
    return { ...device, ...health };
  }));
}

export async function listDevices() {
  const devices = getCollection("devices");
  const rawDevices = await devices.find({}).toArray();
  return Promise.all(rawDevices.map(async (device) => {
    const health = await buildDeviceHealthResponse(device);
    return { ...device, ...health };
  }));
}

export async function getDeviceForUser(deviceId, user) {
  const filter = await buildDeviceAccessFilter(user);
  return getCollection("devices").findOne({ deviceId, ...filter });
}

export async function getDevice(deviceId) {
  return getCollection("devices").findOne({ deviceId });
}

export async function getDeviceHealthForUser(deviceId, user) {
  const device = await getDeviceForUser(deviceId, user);
  if (!device) return null;
  return buildDeviceHealthResponse(device);
}

export async function getDeviceHealth(deviceId) {
  const device = await getDevice(deviceId);
  if (!device) return null;
  return buildDeviceHealthResponse(device);
}

async function buildDeviceHealthResponse(device) {
  const telemetryCollection = getTelemetryCollection();
  const latestTelemetry = await telemetryCollection.findOne(
    { deviceId: device.deviceId },
    { sort: { timestamp: -1 } }
  );

  // Backlog count: SD records the backend knows are still pending, OR the
  // number of SD_SYNC readings we have stored for this device. Either way it
  // is a useful "is this device caught up?" signal.
  const sdSyncedCount = await telemetryCollection.countDocuments({
    deviceId: device.deviceId,
    "transmission.storedOffline": true,
  });

  const syncHealth = {
    lastTelemetrySequence: device.lastTelemetrySequence ?? null,
    lastSyncedSequence: device.lastSyncedSequence ?? null,
    lastSuccessfulSyncAt: device.lastSuccessfulSyncAt ?? null,
    lastSyncSource: device.lastSyncSource ?? null,
    pendingOfflineRecords:
      Number.isInteger(device.pendingOfflineRecords)
        ? device.pendingOfflineRecords
        : null,
    sdSyncedReadings: sdSyncedCount,
    connectivityState: device.connectivityState ?? null,
    mqttStatus:
      device.mqttStatus ??
      (device.status === "ONLINE" ? "CONNECTED" : "UNKNOWN"),
    sdCardStatus:
      device.sdCardStatus ??
      device.sdStatus ??
      null,
    firmwareVersion:
      device.firmwareVersion ??
      device.firmware ??
      null,
  };

  if (!latestTelemetry) {
    return {
      deviceId: device.deviceId,
      status: "UNKNOWN",
      battery: null,
      lastSeenAt: null,
      firmwareVersion: device.firmwareVersion ?? null,
      currentShipmentId: device.currentShipmentId ?? null,
      latestTelemetry: null,
      sync: syncHealth,
    };
  }

  let status = "OFFLINE";
  const lastSeenAt = device.lastSeenAt || latestTelemetry.timestamp || null;
  if (lastSeenAt) {
    const lastSeen = new Date(lastSeenAt).getTime();
    const difference = Date.now() - lastSeen;
    if (Number.isFinite(lastSeen) && difference <= 5 * 60 * 1000) {
      status = "ONLINE";
    }
  }

  return {
    deviceId: device.deviceId,
    status,
    battery: Number.isFinite(latestTelemetry.battery)
      ? Number(latestTelemetry.battery)
      : null,
    lastSeenAt: lastSeenAt ?? null,
    firmwareVersion: device.firmwareVersion ?? null,
    currentShipmentId: device.currentShipmentId ?? null,
    latestTelemetry,
    sync: syncHealth,
  };
}

export async function assignDevice(deviceId, shipmentId, actorId, actorRole = null) {
  const devices = getCollection("devices");
  const shipments = getCollection("shipments");

  const device = await devices.findOne({ deviceId });
  if (!device) {
    const error = new Error("Device not found");
    error.code = "DEVICE_NOT_FOUND";
    throw error;
  }

  const shipmentAccess = buildShipmentAccessFilter({ uid: actorId, role: actorRole });
  const shipment = await shipments.findOne({ shipmentId, ...shipmentAccess });
  if (!shipment) {
    const error = new Error("Shipment not found");
    error.code = "SHIPMENT_NOT_FOUND";
    throw error;
  }

  const currentShipmentId = device.currentShipmentId;
  const assignedDevice = shipment.assignedDevice;

  if (currentShipmentId === shipmentId && assignedDevice === deviceId) {
    return {
      deviceId,
      shipmentId,
      status: "ASSIGNED",
      idempotent: true,
    };
  }

  if (currentShipmentId && currentShipmentId !== shipmentId) {
    const error = new Error("Device is already assigned");
    error.code = "DEVICE_ALREADY_ASSIGNED";
    throw error;
  }

  if (assignedDevice && assignedDevice !== deviceId) {
    const error = new Error("Shipment already has a device");
    error.code = "SHIPMENT_ALREADY_HAS_DEVICE";
    throw error;
  }

  await devices.updateOne(
    { deviceId },
    { $set: { currentShipmentId: shipmentId, updatedAt: new Date().toISOString() } }
  );
  await shipments.updateOne(
    { shipmentId },
    { $set: { assignedDevice: deviceId, updatedAt: new Date().toISOString() } }
  );

  try {
    const { addTimelineEvent } = await import("./timelineService.js");
    const { TimelineEventType } = await import("../core/timelineEvents.js");
    await addTimelineEvent(
      shipmentId,
      TimelineEventType.DEVICE_ASSIGNED,
      actorId,
      { deviceId }
    );
  } catch (error) {
    console.error("Device assignment timeline error:", error.message);
  }

  return {
    deviceId,
    shipmentId,
    status: "ASSIGNED",
    idempotent: false,
  };
}
