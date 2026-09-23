import { MongoClient } from "mongodb";
import { config } from "./config.js";

const client = new MongoClient(config.mongoUri);

let mongoDb = null;

let collections = {};

export async function connectMongo() {
  await client.connect();
  mongoDb = client.db(config.mongoDbName);

  collections.telemetry = mongoDb.collection("telemetry");
  collections.users = mongoDb.collection("users");
  collections.devices = mongoDb.collection("devices");
  collections.shipments = mongoDb.collection("shipments");
  collections.alerts = mongoDb.collection("alerts");
   collections.timeline = mongoDb.collection("timeline");
  collections.integrityCheckpoints = mongoDb.collection("integrityCheckpoints");
  collections.listings = mongoDb.collection("listings");
  collections.routePlans = mongoDb.collection("routePlans");

// Telemetry indexes

await collections.telemetry.createIndex({ deviceId: 1 });

await collections.telemetry.createIndex({ shipmentId: 1 });

await collections.telemetry.createIndex({ timestamp: 1 });

// IMPORTANT: prevents duplicate ESP32 telemetry
await collections.telemetry.createIndex(
  { deviceId: 1, sequenceNumber: 1 },
  {
    unique: true,
    name: "unique_device_sequence",
  }
);

await collections.telemetry.createIndex({
  shipmentId: 1,
  deviceId: 1,
  checkpointed: 1,
  timestamp: 1,
});

await collections.telemetry.createIndex({
  deviceId: 1,
  timestamp: -1,
});

await collections.telemetry.createIndex({
  shipmentId: 1,
  timestamp: -1,
});

await collections.telemetry.createIndex({
  shipmentId: 1,
  deviceId: 1,
  checkpointId: 1,
});

// Offline-first / SD-sync indexes
await collections.telemetry.createIndex({
  deviceId: 1,
  "transmission.source": 1,
});

await collections.telemetry.createIndex({
  "transmission.storedOffline": 1,
});

await collections.telemetry.createIndex({
  deviceId: 1,
  sequenceNumber: -1,
});

  // users indexes
  await collections.users.createIndex({ uid: 1 }, { unique: true });
  await collections.users.createIndex({ email: 1 }, { unique: true, sparse: true });
  await collections.users.createIndex({ role: 1 });

  // devices indexes
  await collections.devices.createIndex({ deviceId: 1 }, { unique: true });
  await collections.devices.createIndex({ serialNumber: 1 }, { unique: true, sparse: true });
  await collections.devices.createIndex({ ownerId: 1 });
  await collections.devices.createIndex({ currentShipmentId: 1 });
  await collections.devices.createIndex({ status: 1 });
  await collections.devices.createIndex({ lastSeenAt: -1 });
  await collections.devices.createIndex({ lastSuccessfulSyncAt: -1 });

  // shipments indexes
  await collections.shipments.createIndex({ shipmentId: 1 }, { unique: true });
  await collections.shipments.createIndex({ trackingId: 1 }, { unique: true, sparse: true });
  await collections.shipments.createIndex({ createdBy: 1 });
  await collections.shipments.createIndex({ transporterId: 1 });
  await collections.shipments.createIndex({ warehouseId: 1 });
  await collections.shipments.createIndex({ retailerId: 1 });
  await collections.shipments.createIndex({ assignedDevice: 1 });
  await collections.shipments.createIndex({ status: 1 });
  await collections.shipments.createIndex({ createdAt: -1 });

  // alerts indexes
  await collections.alerts.createIndex({ alertId: 1 }, { unique: true });
  await collections.alerts.createIndex({ shipmentId: 1 });
  await collections.alerts.createIndex({ deviceId: 1 });
  await collections.alerts.createIndex({ status: 1 });
  await collections.alerts.createIndex({ severity: 1 });
  await collections.alerts.createIndex({ createdAt: -1 });

  // timeline indexes
  await collections.timeline.createIndex({ eventId: 1 }, { unique: true });
  await collections.timeline.createIndex({ shipmentId: 1, createdAt: 1 });

  // integrityCheckpoints indexes
  await collections.integrityCheckpoints.createIndex({ checkpointId: 1 }, { unique: true });
  await collections.integrityCheckpoints.createIndex({ shipmentId: 1 });
   await collections.integrityCheckpoints.createIndex({ createdAt: -1 });

  // listings indexes
  await collections.listings.createIndex({ listingId: 1 }, { unique: true });
  await collections.listings.createIndex({ farmerId: 1 });
  await collections.listings.createIndex({ buyerId: 1 });
  await collections.listings.createIndex({ status: 1 });
  await collections.listings.createIndex({ product: 1 });
  await collections.listings.createIndex({ createdAt: -1 });

  // routePlans indexes
  await collections.routePlans.createIndex({ routePlanId: 1 }, { unique: true });
  await collections.routePlans.createIndex({ shipmentId: 1 });
  await collections.routePlans.createIndex({ transporterId: 1 });
  await collections.routePlans.createIndex({ createdAt: -1 });

  console.log("MongoDB connected and indexes created");
}

export function getDb() {
  if (!mongoDb) {
    throw new Error("MongoDB not connected. Call connectMongo() first.");
  }
  return mongoDb;
}

export function getCollection(name) {
  if (!collections[name]) {
    if (!mongoDb) {
      throw new Error("MongoDB not connected. Call connectMongo() first.");
    }
    collections[name] = mongoDb.collection(name);
  }
  return collections[name];
}

export function getTelemetryCollection() {
  return getCollection("telemetry");
}
