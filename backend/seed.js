// ============================================================
// AgriTrace Database Seed Script
// For development/demo purposes only - populates MongoDB with
// sample data. Do NOT run in production with real user data.
// Run: node seed.js
// ============================================================

import "dotenv/config";
import { MongoClient } from "mongodb";
import { randomUUID } from "crypto";

// ============================================================
// MongoDB Configuration
// ============================================================

const MONGO_URI = process.env.MONGO_URI;

const MONGO_DB =
  process.env.MONGO_DB ||
  process.env.MONGO_DB_NAME ||
  "AgriTrace";

if (!MONGO_URI) {
  throw new Error(
    "MONGO_URI is missing. Add MONGO_URI to your .env file."
  );
}

const client = new MongoClient(MONGO_URI);

let db;

// ============================================================
// Constants
// ============================================================

const SHIPMENT_STATUS = {
  PENDING: "PENDING",
  READY_FOR_DISPATCH: "READY_FOR_DISPATCH",
  IN_TRANSIT: "IN_TRANSIT",
  AT_WAREHOUSE: "AT_WAREHOUSE",
  DELIVERED: "DELIVERED",
};

const TimelineEventType = {
  SHIPMENT_CREATED: "SHIPMENT_CREATED",
  DEVICE_ASSIGNED: "DEVICE_ASSIGNED",
  READY_FOR_DISPATCH: "READY_FOR_DISPATCH",
  SHIPMENT_DISPATCHED: "SHIPMENT_DISPATCHED",
  WAREHOUSE_RECEIVED: "WAREHOUSE_RECEIVED",
  DELIVERY_COMPLETED: "DELIVERY_COMPLETED",
  TEMPERATURE_EXCURSION: "TEMPERATURE_EXCURSION",
  DEVICE_OFFLINE: "DEVICE_OFFLINE",
};

// ============================================================
// Date Helpers
// ============================================================

const NOW = new Date().toISOString();

const PAST = (days) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

// ============================================================
// Check whether document already exists
// ============================================================

async function docExists(collectionName, field, value) {
  const document = await db.collection(collectionName).findOne(
    {
      [field]: value,
    },
    {
      projection: {
        _id: 1,
      },
    }
  );

  return Boolean(document);
}

// ============================================================
// Create MongoDB indexes
// ============================================================

async function createIndexes() {
  console.log("Using existing MongoDB indexes.\n");
}

// ============================================================
// Seed Users
// ============================================================

async function seedUsers() {
  const users = [
    {
      uid: "seeds-farmer-001",
      email: "farmer@agritrace.demo",
      role: "FARMER",
      name: "Kritika Gupta",
      phone: "+91 98765 43210",
      organisation: "AgriTrace Demo Network",
      orgType: "Multi-stakeholder Supply Chain",
      state: "Uttar Pradesh",
      district: "Lucknow",
      createdAt: PAST(30),
      updatedAt: NOW,
    },

    {
      uid: "seeds-transporter-001",
      email: "transporter@agritrace.demo",
      role: "TRANSPORTER",
      name: "Rajesh Kumar",
      phone: "+91 98765 43211",
      organisation: "QuickTrans Logistics",
      orgType: "Transport",
      state: "Uttar Pradesh",
      district: "Noida",
      createdAt: PAST(28),
      updatedAt: NOW,
    },

    {
      uid: "seeds-warehouse-001",
      email: "warehouse@agritrace.demo",
      role: "WAREHOUSE",
      name: "Sunita Devi",
      phone: "+91 98765 43212",
      organisation: "ColdStore Agri Hub",
      orgType: "Warehousing",
      state: "Rajasthan",
      district: "Jaipur",
      createdAt: PAST(25),
      updatedAt: NOW,
    },

    {
      uid: "seeds-admin-001",
      email: "admin@agritrace.demo",
      role: "ADMIN",
      name: "Admin User",
      phone: "+91 98765 43213",
      organisation: "AgriTrace Platform",
      orgType: "Platform",
      state: "Delhi",
      district: "New Delhi",
      createdAt: PAST(365),
      updatedAt: NOW,
    },
  ];

  for (const user of users) {
    const exists = await docExists(
      "users",
      "uid",
      user.uid
    );

    if (exists) {
      console.log(
        `  User skipped (exists): ${user.email}`
      );

      continue;
    }

    await db.collection("users").insertOne(user);

    console.log(
      `  User: ${user.email} (${user.role})`
    );
  }
}

// ============================================================
// Seed Devices
// ============================================================

async function seedDevices() {
  const devices = [
    {
      deviceId: "DEV-001",
      serialNumber: "SN-DEV-001",
      status: "ONLINE",
      battery: 87,
      firmwareVersion: "2.1.4",
      currentShipmentId: "seed-ship-001",
      location: "Lucknow, UP",
      type: "Sensor",
      lastSeenAt: NOW,
      createdAt: NOW,
    },

    {
      deviceId: "DEV-002",
      serialNumber: "SN-DEV-002",
      status: "ONLINE",
      battery: 64,
      firmwareVersion: "2.1.3",
      currentShipmentId: "seed-ship-002",
      location: "Noida, UP",
      type: "Sensor",
      lastSeenAt: NOW,
      createdAt: NOW,
    },

    {
      deviceId: "DEV-003",
      serialNumber: "SN-DEV-003",
      status: "OFFLINE",
      battery: 12,
      firmwareVersion: "2.0.1",
      currentShipmentId: "seed-ship-003",
      location: "Jaipur, RJ",
      type: "Gateway",
      lastSeenAt: PAST(2),
      createdAt: PAST(10),
    },

    {
      deviceId: "DEV-004",
      serialNumber: "SN-DEV-004",
      status: "ONLINE",
      battery: 92,
      firmwareVersion: "2.1.4",
      currentShipmentId: null,
      location: "Delhi, DL",
      type: "Tracker",
      lastSeenAt: NOW,
      createdAt: NOW,
    },

    {
      deviceId: "DEV-005",
      serialNumber: "SN-DEV-005",
      status: "ONLINE",
      battery: 45,
      firmwareVersion: "2.1.2",
      currentShipmentId: "seed-ship-005",
      location: "Mumbai, MH",
      type: "Sensor",
      lastSeenAt: NOW,
      createdAt: PAST(15),
    },
  ];

  for (const device of devices) {
    const exists = await docExists(
      "devices",
      "deviceId",
      device.deviceId
    );

    if (exists) {
      console.log(
        `  Device skipped (exists): ${device.deviceId}`
      );

      continue;
    }

    await db.collection("devices").insertOne(device);

    console.log(`  Device: ${device.deviceId}`);
  }
}

// ============================================================
// Seed Shipments
// ============================================================

async function seedShipments() {
  const shipments = [
    {
      shipmentId: "seed-ship-001",
      trackingId: "AGT-2026-00001",
      product: "Fresh Tomatoes",
      category: "Vegetables",

      batchId: "BATCH-001",

      quantity: 500,
      unit: "kg",
      grade: "Grade A",

      source: "Lucknow",
      sourceDistrict: "Lucknow",
      sourceState: "Uttar Pradesh",

      destination: "Delhi",
      destinationState: "Delhi",

      pickupLocation: "Farm A, Lucknow",

      receiverOrganization:
        "Delhi Retailers Assoc.",

      receiverName: "Vikash Singh",
      contactPerson: "Vikash Singh",

      phone: "+91 98765 43220",

      departureDate: PAST(2),
      departureTime: "08:00",

      deliveryDate: PAST(1),

      transportType: "Refrigerated Truck",

      vehicleNumber: "UP14-AB-1234",

      driverName: "Mohammad Ali",

      status: SHIPMENT_STATUS.IN_TRANSIT,

      assignedDevice: "DEV-001",

      farmerId: "seeds-farmer-001",
      createdBy: "seeds-farmer-001",

      transporterId: "seeds-transporter-001",

      thresholds: {
        temperature: {
          min: 8,
          max: 28,
        },

        humidity: {
          min: 40,
          max: 80,
        },

        gasLevel: {
          max: 50,
        },
      },

      temperature: 22.5,
      humidity: 65,

      gas: "Safe",

      battery: 87,

      device: "DEV-001",

      progress: 65,
      stage: 3,

      createdAt: PAST(5),
      updatedAt: PAST(1),
    },

    {
      shipmentId: "seed-ship-002",
      trackingId: "AGT-2026-00002",

      product: "Organic Bananas",
      category: "Fruits",

      batchId: "BATCH-002",

      quantity: 300,
      unit: "kg",

      grade: "Grade A",

      source: "Noida",
      sourceDistrict: "Noida",
      sourceState: "Uttar Pradesh",

      destination: "Mumbai",
      destinationState: "Maharashtra",

      pickupLocation: "Farm B, Noida",

      receiverOrganization: "Mumbai Grocers",

      receiverName: "Priya Sharma",
      contactPerson: "Priya Sharma",

      phone: "+91 98765 43221",

      departureDate: PAST(3),
      departureTime: "06:00",

      deliveryDate: PAST(0),

      transportType: "Refrigerated Truck",

      vehicleNumber: "UP14-CD-5678",

      driverName: "Rajesh Verma",

      status: SHIPMENT_STATUS.AT_WAREHOUSE,

      assignedDevice: "DEV-002",

      farmerId: "seeds-farmer-001",
      createdBy: "seeds-farmer-001",

      transporterId: "seeds-transporter-001",

      thresholds: {
        temperature: {
          min: 10,
          max: 25,
        },

        humidity: {
          min: 45,
          max: 85,
        },

        gasLevel: {
          max: 50,
        },
      },

      temperature: 18.2,
      humidity: 72,

      gas: "Safe",

      battery: 64,

      device: "DEV-002",

      progress: 85,
      stage: 4,

      createdAt: PAST(7),
      updatedAt: PAST(1),
    },

    {
      shipmentId: "seed-ship-003",
      trackingId: "AGT-2026-00003",

      product: "Basmati Rice",
      category: "Grains",

      batchId: "BATCH-003",

      quantity: 1000,
      unit: "kg",

      grade: "Grade B",

      source: "Jaipur",
      sourceDistrict: "Jaipur",
      sourceState: "Rajasthan",

      destination: "Delhi",
      destinationState: "Delhi",

      pickupLocation: "Warehouse A, Jaipur",

      receiverOrganization:
        "Delhi Distributors",

      receiverName: "Amit Patel",
      contactPerson: "Amit Patel",

      phone: "+91 98765 43222",

      departureDate: PAST(4),
      departureTime: "10:00",

      deliveryDate: PAST(2),

      transportType: "Open Truck",

      vehicleNumber: "RJ14-EF-9012",

      driverName: "Suresh Yadav",

      status: SHIPMENT_STATUS.DELIVERED,

      assignedDevice: "DEV-003",

      farmerId: "seeds-farmer-001",
      createdBy: "seeds-farmer-001",

      transporterId: "seeds-transporter-001",

      thresholds: {
        temperature: {
          min: 5,
          max: 30,
        },

        humidity: {
          min: 30,
          max: 70,
        },

        gasLevel: {
          max: 50,
        },
      },

      temperature: 25.1,
      humidity: 55,

      gas: "Safe",

      battery: 12,

      device: "DEV-003",

      progress: 100,
      stage: 5,

      createdAt: PAST(10),
      updatedAt: PAST(2),
    },

    {
      shipmentId: "seed-ship-004",
      trackingId: "AGT-2026-00004",

      product: "Dairy Milk",
      category: "Dairy",

      batchId: "BATCH-004",

      quantity: 200,
      unit: "litres",

      grade: "Grade A",

      source: "Meerut",
      sourceDistrict: "Meerut",
      sourceState: "Uttar Pradesh",

      destination: "Noida",
      destinationState: "Uttar Pradesh",

      pickupLocation: "Dairy Farm, Meerut",

      receiverOrganization:
        "Noida Supermarket",

      receiverName: "Neha Gupta",
      contactPerson: "Neha Gupta",

      phone: "+91 98765 43223",

      departureDate: PAST(1),
      departureTime: "05:00",

      deliveryDate: PAST(0),

      transportType: "Van",

      vehicleNumber: "UP14-GH-3456",

      driverName: "Ajay Kumar",

      status: SHIPMENT_STATUS.IN_TRANSIT,

      assignedDevice: "DEV-004",

      farmerId: "seeds-farmer-001",
      createdBy: "seeds-farmer-001",

      transporterId: "seeds-transporter-001",

      thresholds: {
        temperature: {
          min: 2,
          max: 8,
        },

        humidity: {
          min: 30,
          max: 60,
        },

        gasLevel: {
          max: 50,
        },
      },

      temperature: 6.5,
      humidity: 42,

      gas: "Safe",

      battery: 92,

      device: "DEV-004",

      progress: 50,
      stage: 3,

      createdAt: PAST(3),
      updatedAt: PAST(0),
    },

    {
      shipmentId: "seed-ship-005",
      trackingId: "AGT-2026-00005",

      product: "Mixed Spices",
      category: "Spices",

      batchId: "BATCH-005",

      quantity: 150,
      unit: "kg",

      grade: "Grade C",

      source: "Gwalior",
      sourceDistrict: "Gwalior",
      sourceState: "Madhya Pradesh",

      destination: "Pune",
      destinationState: "Maharashtra",

      pickupLocation:
        "Spice Market, Gwalior",

      receiverOrganization:
        "Pune Food Corp.",

      receiverName: "Deepak Joshi",
      contactPerson: "Deepak Joshi",

      phone: "+91 98765 43224",

      departureDate: PAST(6),
      departureTime: "12:00",

      deliveryDate: PAST(3),

      transportType: "Refrigerated Truck",

      vehicleNumber: "MP14-IJ-7890",

      driverName: "Sanjay Rathore",

      status: SHIPMENT_STATUS.DELIVERED,

      assignedDevice: "DEV-005",

      farmerId: "seeds-farmer-001",
      createdBy: "seeds-farmer-001",

      transporterId: "seeds-transporter-001",

      thresholds: {
        temperature: {
          min: 10,
          max: 25,
        },

        humidity: {
          min: 35,
          max: 75,
        },

        gasLevel: {
          max: 50,
        },
      },

      temperature: 20.8,
      humidity: 58,

      gas: "Safe",

      battery: 45,

      device: "DEV-005",

      progress: 100,
      stage: 5,

      createdAt: PAST(12),
      updatedAt: PAST(3),
    },
  ];

  for (const shipment of shipments) {
    const exists = await docExists(
      "shipments",
      "shipmentId",
      shipment.shipmentId
    );

    if (exists) {
      console.log(
        `  Shipment skipped (exists): ${shipment.trackingId}`
      );

      continue;
    }

    await db
      .collection("shipments")
      .insertOne(shipment);

    console.log(
      `  Shipment: ${shipment.trackingId} (${shipment.status})`
    );
  }
}

// ============================================================
// Seed Alerts
// ============================================================

async function seedAlerts() {
  const alerts = [
    {
      alertId: "DEV-001_HIGH_TEMP_1",

      deviceId: "DEV-001",
      shipmentId: "seed-ship-001",

      type: "HIGH_TEMP",
      severity: "CRITICAL",

      value: 31.5,
      actualValue: 31.5,

      threshold: {
        operator: ">",
        limit: 28,
        field: "temperature",
      },

      status: "OPEN",

      acknowledgedAt: null,
      resolvedAt: null,

      timestamp: PAST(6),
      createdAt: PAST(6),
    },

    {
      alertId: "DEV-003_LOW_BATTERY_1",

      deviceId: "DEV-003",
      shipmentId: "seed-ship-003",

      type: "LOW_BATTERY",
      severity: "WARNING",

      value: 12,
      actualValue: 12,

      threshold: {
        operator: "<",
        limit: 15,
        field: "battery",
      },

      status: "OPEN",

      acknowledgedAt: null,
      resolvedAt: null,

      timestamp: PAST(4),
      createdAt: PAST(4),
    },

    {
      alertId: "DEV-002_HIGH_HUMIDITY_1",

      deviceId: "DEV-002",
      shipmentId: "seed-ship-002",

      type: "HIGH_HUMIDITY",
      severity: "WARNING",

      value: 82,
      actualValue: 82,

      threshold: {
        operator: ">",
        limit: 80,
        field: "humidity",
      },

      status: "RESOLVED",

      acknowledgedAt: PAST(3),
      resolvedAt: PAST(2),

      resolvedBy: "seeds-admin-001",

      timestamp: PAST(5),
      createdAt: PAST(5),
    },

    {
      alertId: "DEV-001_DEVICE_OFFLINE_1",

      deviceId: "DEV-003",
      shipmentId: null,

      type: "DEVICE_OFFLINE",
      severity: "CRITICAL",

      value: true,
      actualValue: true,

      threshold: {
        operator: "===",
        limit: true,
        field: "deviceOffline",
      },

      status: "OPEN",

      acknowledgedAt: null,
      resolvedAt: null,

      timestamp: PAST(1),
      createdAt: PAST(1),
    },

    {
      alertId: "DEV-005_GAS_ALERT_1",

      deviceId: "DEV-005",
      shipmentId: "seed-ship-005",

      type: "GAS_ALERT",
      severity: "CRITICAL",

      value: 58,
      actualValue: 58,

      threshold: {
        operator: ">",
        limit: 50,
        field: "gasLevel",
      },

      status: "RESOLVED",

      acknowledgedAt: PAST(5),
      resolvedAt: PAST(4),

      resolvedBy: "seeds-transporter-001",

      timestamp: PAST(6),
      createdAt: PAST(6),
    },
  ];

  for (const alert of alerts) {
    const exists = await docExists(
      "alerts",
      "alertId",
      alert.alertId
    );

    if (exists) {
      console.log(
        `  Alert skipped (exists): ${alert.alertId}`
      );

      continue;
    }

    await db.collection("alerts").insertOne(alert);

    console.log(
      `  Alert: ${alert.alertId} (${alert.type}/${alert.status})`
    );
  }
}

// ============================================================
// Seed Timeline
// ============================================================

async function seedTimeline() {
  const events = [
    // --------------------------------------------------------
    // Shipment 001
    // --------------------------------------------------------

    {
      shipmentId: "seed-ship-001",

      type:
        TimelineEventType.SHIPMENT_CREATED,

      timestamp: PAST(5),

      actorId: "seeds-farmer-001",

      metadata: {
        status: "PENDING",
      },
    },

    {
      shipmentId: "seed-ship-001",

      type:
        TimelineEventType.DEVICE_ASSIGNED,

      timestamp: PAST(4),

      actorId: "seeds-farmer-001",

      metadata: {
        deviceId: "DEV-001",
      },
    },

    {
      shipmentId: "seed-ship-001",

      type:
        TimelineEventType.READY_FOR_DISPATCH,

      timestamp: PAST(3),

      actorId: "seeds-farmer-001",

      metadata: {
        status: "READY_FOR_DISPATCH",
      },
    },

    {
      shipmentId: "seed-ship-001",

      type:
        TimelineEventType.SHIPMENT_DISPATCHED,

      timestamp: PAST(2),

      actorId: "seeds-transporter-001",

      metadata: {
        status: "IN_TRANSIT",
      },
    },

    {
      shipmentId: "seed-ship-001",

      type:
        TimelineEventType.TEMPERATURE_EXCURSION,

      timestamp: PAST(1),

      actorId: "SYSTEM",

      metadata: {
        deviceId: "DEV-001",
        temperature: 31.5,
        threshold: 28,
        severity: "CRITICAL",
      },
    },

    // --------------------------------------------------------
    // Shipment 002
    // --------------------------------------------------------

    {
      shipmentId: "seed-ship-002",

      type:
        TimelineEventType.SHIPMENT_CREATED,

      timestamp: PAST(7),

      actorId: "seeds-farmer-001",

      metadata: {
        status: "PENDING",
      },
    },

    {
      shipmentId: "seed-ship-002",

      type:
        TimelineEventType.DEVICE_ASSIGNED,

      timestamp: PAST(6),

      actorId: "seeds-farmer-001",

      metadata: {
        deviceId: "DEV-002",
      },
    },

    {
      shipmentId: "seed-ship-002",

      type:
        TimelineEventType.READY_FOR_DISPATCH,

      timestamp: PAST(5),

      actorId: "seeds-farmer-001",

      metadata: {
        status: "READY_FOR_DISPATCH",
      },
    },

    {
      shipmentId: "seed-ship-002",

      type:
        TimelineEventType.SHIPMENT_DISPATCHED,

      timestamp: PAST(4),

      actorId: "seeds-transporter-001",

      metadata: {
        status: "IN_TRANSIT",
      },
    },

    {
      shipmentId: "seed-ship-002",

      type:
        TimelineEventType.WAREHOUSE_RECEIVED,

      timestamp: PAST(2),

      actorId: "seeds-warehouse-001",

      metadata: {
        status: "AT_WAREHOUSE",
      },
    },

    // --------------------------------------------------------
    // Shipment 003
    // --------------------------------------------------------

    {
      shipmentId: "seed-ship-003",

      type:
        TimelineEventType.SHIPMENT_CREATED,

      timestamp: PAST(10),

      actorId: "seeds-farmer-001",

      metadata: {
        status: "PENDING",
      },
    },

    {
      shipmentId: "seed-ship-003",

      type:
        TimelineEventType.DEVICE_ASSIGNED,

      timestamp: PAST(9),

      actorId: "seeds-farmer-001",

      metadata: {
        deviceId: "DEV-003",
      },
    },

    {
      shipmentId: "seed-ship-003",

      type:
        TimelineEventType.READY_FOR_DISPATCH,

      timestamp: PAST(8),

      actorId: "seeds-farmer-001",

      metadata: {
        status: "READY_FOR_DISPATCH",
      },
    },

    {
      shipmentId: "seed-ship-003",

      type:
        TimelineEventType.SHIPMENT_DISPATCHED,

      timestamp: PAST(7),

      actorId: "seeds-transporter-001",

      metadata: {
        status: "IN_TRANSIT",
      },
    },

    {
      shipmentId: "seed-ship-003",

      type:
        TimelineEventType.WAREHOUSE_RECEIVED,

      timestamp: PAST(5),

      actorId: "seeds-warehouse-001",

      metadata: {
        status: "AT_WAREHOUSE",
      },
    },

    {
      shipmentId: "seed-ship-003",

      type:
        TimelineEventType.DELIVERY_COMPLETED,

      timestamp: PAST(2),

      actorId: "seeds-warehouse-001",

      metadata: {
        status: "DELIVERED",
      },
    },

    // --------------------------------------------------------
    // Shipment 004
    // --------------------------------------------------------

    {
      shipmentId: "seed-ship-004",

      type:
        TimelineEventType.SHIPMENT_CREATED,

      timestamp: PAST(3),

      actorId: "seeds-farmer-001",

      metadata: {
        status: "PENDING",
      },
    },

    {
      shipmentId: "seed-ship-004",

      type:
        TimelineEventType.DEVICE_ASSIGNED,

      timestamp: PAST(2),

      actorId: "seeds-farmer-001",

      metadata: {
        deviceId: "DEV-004",
      },
    },

    {
      shipmentId: "seed-ship-004",

      type:
        TimelineEventType.SHIPMENT_DISPATCHED,

      timestamp: PAST(1),

      actorId: "seeds-transporter-001",

      metadata: {
        status: "IN_TRANSIT",
      },
    },

    // --------------------------------------------------------
    // Shipment 005
    // --------------------------------------------------------

    {
      shipmentId: "seed-ship-005",

      type:
        TimelineEventType.SHIPMENT_CREATED,

      timestamp: PAST(12),

      actorId: "seeds-farmer-001",

      metadata: {
        status: "PENDING",
      },
    },

    {
      shipmentId: "seed-ship-005",

      type:
        TimelineEventType.DEVICE_ASSIGNED,

      timestamp: PAST(11),

      actorId: "seeds-farmer-001",

      metadata: {
        deviceId: "DEV-005",
      },
    },

    {
      shipmentId: "seed-ship-005",

      type:
        TimelineEventType.READY_FOR_DISPATCH,

      timestamp: PAST(10),

      actorId: "seeds-farmer-001",

      metadata: {
        status: "READY_FOR_DISPATCH",
      },
    },

    {
      shipmentId: "seed-ship-005",

      type:
        TimelineEventType.SHIPMENT_DISPATCHED,

      timestamp: PAST(9),

      actorId: "seeds-transporter-001",

      metadata: {
        status: "IN_TRANSIT",
      },
    },

    {
      shipmentId: "seed-ship-005",

      type:
        TimelineEventType.WAREHOUSE_RECEIVED,

      timestamp: PAST(6),

      actorId: "seeds-warehouse-001",

      metadata: {
        status: "AT_WAREHOUSE",
      },
    },

    {
      shipmentId: "seed-ship-005",

      type:
        TimelineEventType.DELIVERY_COMPLETED,

      timestamp: PAST(3),

      actorId: "seeds-warehouse-001",

      metadata: {
        status: "DELIVERED",
      },
    },
  ];

  let count = 0;

  for (const event of events) {
    // Check using meaningful event fields instead
    // of randomUUID so repeated seed runs do not
    // create duplicate timeline entries.

    const existing =
      await db.collection("timeline").findOne({
        shipmentId: event.shipmentId,
        type: event.type,
        timestamp: event.timestamp,
        actorId: event.actorId,
      });

    if (existing) {
      continue;
    }

    const eventId = randomUUID();

    await db.collection("timeline").insertOne({
      ...event,
      eventId,
    });

    count++;
  }

  console.log(
    `  Timeline events: ${count} added`
  );
}

// ============================================================
// Main Seed
// ============================================================

async function seedDatabase() {
  console.log(
    "\nSeeding AgriTrace MongoDB demo data...\n"
  );

  await createIndexes();

  console.log("Users:");
  await seedUsers();

  console.log();

  console.log("Devices:");
  await seedDevices();

  console.log();

  console.log("Shipments:");
  await seedShipments();

  console.log();

  console.log("Alerts:");
  await seedAlerts();

  console.log();

  console.log("Timeline:");
  await seedTimeline();

  console.log();

  console.log(
    "Seed complete! MongoDB data ready for demo."
  );
}

// ============================================================
// MongoDB Connection
// ============================================================

async function run() {
  try {
    console.log("Connecting to MongoDB...");

    await client.connect();

    db = client.db(MONGO_DB);

    await db.command({
      ping: 1,
    });

    console.log(
      `MongoDB connected successfully: ${MONGO_DB}`
    );

    await seedDatabase();
  } catch (error) {
    console.error(
      "\nMongoDB seed failed:",
      error
    );

    process.exitCode = 1;
  } finally {
    try {
      await client.close();

      console.log(
        "\nMongoDB connection closed."
      );
    } catch (error) {
      console.error(
        "Error closing MongoDB:",
        error.message
      );
    }
  }
}

run();