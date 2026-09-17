// ============================================================
// AgriTrace Database Seed Script
//
// IMPORTANT:
// Users are NOT created here.
//
// First create/register real users through AgriTrace/Firebase.
// This script finds those users in MongoDB using their emails
// and uses their REAL Firebase UID for shipment relationships.
//
// Run:
//    node seed.js
// ============================================================

import "dotenv/config";
import { MongoClient } from "mongodb";
import { randomUUID } from "crypto";

// ============================================================
// DATABASE CONFIG
// ============================================================

const MONGO_URI = process.env.MONGO_URI;

const MONGO_DB =
  process.env.MONGO_DB ||
  process.env.MONGO_DB_NAME ||
  "AgriTrace";

if (!MONGO_URI) {
  throw new Error(
    "MONGO_URI is missing from .env"
  );
}

// ============================================================
// REAL REGISTERED USER EMAILS
// ============================================================

const FARMER_EMAIL =
  process.env.SEED_FARMER_EMAIL || 'farmer@agritrace.demo';

const TRANSPORTER_EMAIL =
  process.env.SEED_TRANSPORTER_EMAIL || 'transporter@agritrace.demo';

const WAREHOUSE_EMAIL =
  process.env.SEED_WAREHOUSE_EMAIL || 'warehouse@agritrace.demo';

if (!FARMER_EMAIL) {
  throw new Error(
    "SEED_FARMER_EMAIL is missing from .env"
  );
}

if (!TRANSPORTER_EMAIL) {
  throw new Error(
    "SEED_TRANSPORTER_EMAIL is missing from .env"
  );
}

if (!WAREHOUSE_EMAIL) {
  throw new Error(
    "SEED_WAREHOUSE_EMAIL is missing from .env"
  );
}

const client =
  new MongoClient(MONGO_URI);

let db;

// ============================================================
// STATUS
// ============================================================

const SHIPMENT_STATUS = {
  PENDING:
    "PENDING",

  DEVICE_ASSIGNED:
    "DEVICE_ASSIGNED",

  READY_FOR_DISPATCH:
    "READY_FOR_DISPATCH",

  IN_TRANSIT:
    "IN_TRANSIT",

  AT_WAREHOUSE:
    "AT_WAREHOUSE",

  DELIVERED:
    "DELIVERED",

  CANCELLED:
    "CANCELLED",
};

// ============================================================
// TIMELINE TYPES
// ============================================================

const TimelineEventType = {
  SHIPMENT_CREATED:
    "SHIPMENT_CREATED",

  DEVICE_ASSIGNED:
    "DEVICE_ASSIGNED",

  TRANSPORTER_ASSIGNED:
    "TRANSPORTER_ASSIGNED",

  WAREHOUSE_ASSIGNED:
    "WAREHOUSE_ASSIGNED",

  READY_FOR_DISPATCH:
    "READY_FOR_DISPATCH",

  SHIPMENT_DISPATCHED:
    "SHIPMENT_DISPATCHED",

  WAREHOUSE_RECEIVED:
    "WAREHOUSE_RECEIVED",

  DELIVERY_COMPLETED:
    "DELIVERY_COMPLETED",

  TEMPERATURE_EXCURSION:
    "TEMPERATURE_EXCURSION",

  DEVICE_OFFLINE:
    "DEVICE_OFFLINE",
};

// ============================================================
// SHIPMENT IDS
// ============================================================

const SHIPMENTS = {
  PENDING:
    "SHP-DEMO-001",

  DEVICE_ASSIGNED:
    "SHP-DEMO-002",

  READY:
    "SHP-DEMO-003",

  TRANSIT:
    "SHP-DEMO-004",

  WAREHOUSE:
    "SHP-DEMO-005",

  DELIVERED:
    "SHP-DEMO-006",
};

// ============================================================
// DATE HELPERS
// ============================================================

const NOW =
  new Date().toISOString();

const PAST = (
  days,
  hours = 0
) =>
  new Date(
    Date.now() -
      days * 24 * 60 * 60 * 1000 -
      hours * 60 * 60 * 1000
  ).toISOString();

// ============================================================
// FIND REAL REGISTERED USERS
// ============================================================

async function findRegisteredUser(
  email,
  expectedRole
) {
  const user =
    await db
      .collection("users")
      .findOne({
        email: {
          $regex:
            `^${email.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}$`,
          $options: "i",
        },
      });

  if (!user) {
    throw new Error(
      `No registered user found for ${email}. ` +
      `Register this account through AgriTrace first.`
    );
  }

  if (!user.uid) {
    throw new Error(
      `User ${email} does not contain a Firebase uid.`
    );
  }

  if (
    String(user.role).toUpperCase() !==
    expectedRole
  ) {
    throw new Error(
      `${email} has role ${user.role}, ` +
      `but ${expectedRole} was expected.`
    );
  }

  return user;
}

// ============================================================
// LOAD REAL USERS
// ============================================================

async function loadUsers() {
  const farmer =
    await findRegisteredUser(
      FARMER_EMAIL,
      "FARMER"
    );

  const transporter =
    await findRegisteredUser(
      TRANSPORTER_EMAIL,
      "TRANSPORTER"
    );

  const warehouse =
    await findRegisteredUser(
      WAREHOUSE_EMAIL,
      "WAREHOUSE"
    );

  console.log(
    "\nRegistered users found:"
  );

  console.log(
    `  FARMER      : ${farmer.email}`
  );

  console.log(
    `  UID         : ${farmer.uid}`
  );

  console.log(
    `  TRANSPORTER : ${transporter.email}`
  );

  console.log(
    `  UID         : ${transporter.uid}`
  );

  console.log(
    `  WAREHOUSE   : ${warehouse.email}`
  );

  console.log(
    `  UID         : ${warehouse.uid}`
  );

  return {
    farmer,
    transporter,
    warehouse,
  };
}

// ============================================================
// INDEXES
// ============================================================

async function createIndexes() {
  const indexes = [
    [
      "devices",
      { deviceId: 1 },
      { unique: true },
    ],

    [
      "shipments",
      { shipmentId: 1 },
      { unique: true },
    ],

    [
      "shipments",
      { trackingId: 1 },
      { unique: true },
    ],

    [
      "shipments",
      { farmerId: 1 },
      {},
    ],

    [
      "shipments",
      { transporterId: 1 },
      {},
    ],

    [
      "shipments",
      { warehouseId: 1 },
      {},
    ],

    [
      "alerts",
      { alertId: 1 },
      { unique: true },
    ],

    [
      "timeline",
      {
        shipmentId: 1,
        timestamp: 1,
      },
      {},
    ],
  ];

  for (
    const [
      collection,
      keys,
      options,
    ] of indexes
  ) {
    try {
      await db
        .collection(collection)
        .createIndex(
          keys,
          options
        );
    } catch (error) {
      console.warn(
        `Index warning (${collection}):`,
        error.message
      );
    }
  }

  console.log(
    "Database indexes checked."
  );
}

// ============================================================
// UPSERT HELPER
// ============================================================

async function upsertMany(
  collection,
  documents,
  key
) {
  for (
    const document of documents
  ) {
    await db
      .collection(collection)
      .updateOne(
        {
          [key]:
            document[key],
        },

        {
          $set:
            document,
        },

        {
          upsert:
            true,
        }
      );
  }
}

// ============================================================
// THRESHOLDS
// ============================================================

const produceThresholds = {
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
};

const dairyThresholds = {
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
};

// ============================================================
// SEED DEVICES
// ============================================================

async function seedDevices() {
  const devices = [
    {
      deviceId:
        "DEV-001",

      serialNumber:
        "AGRITRACE-NODE-001",

      status:
        "ONLINE",

      battery:
        87,

      firmwareVersion:
        "1.0.0",

      currentShipmentId:
        SHIPMENTS.TRANSIT,

      location:
        "In Transit",

      type:
        "AgriTrace Sensor Node",

      lastSeenAt:
        NOW,

      createdAt:
        PAST(20),

      updatedAt:
        NOW,
    },

    {
      deviceId:
        "DEV-002",

      serialNumber:
        "AGRITRACE-NODE-002",

      status:
        "ONLINE",

      battery:
        76,

      firmwareVersion:
        "1.0.0",

      currentShipmentId:
        SHIPMENTS.DEVICE_ASSIGNED,

      location:
        "Noida, Uttar Pradesh",

      type:
        "AgriTrace Sensor Node",

      lastSeenAt:
        NOW,

      createdAt:
        PAST(18),

      updatedAt:
        NOW,
    },

    {
      deviceId:
        "DEV-003",

      serialNumber:
        "AGRITRACE-NODE-003",

      status:
        "ONLINE",

      battery:
        81,

      firmwareVersion:
        "1.0.0",

      currentShipmentId:
        SHIPMENTS.READY,

      location:
        "Lucknow, Uttar Pradesh",

      type:
        "AgriTrace Sensor Node",

      lastSeenAt:
        NOW,

      createdAt:
        PAST(16),

      updatedAt:
        NOW,
    },

    {
      deviceId:
        "DEV-004",

      serialNumber:
        "AGRITRACE-NODE-004",

      status:
        "ONLINE",

      battery:
        68,

      firmwareVersion:
        "1.0.0",

      // Delivered shipment means
      // the device is available again.

      currentShipmentId:
        null,

      location:
        "Delhi",

      type:
        "AgriTrace Sensor Node",

      lastSeenAt:
        NOW,

      createdAt:
        PAST(14),

      updatedAt:
        NOW,
    },

    {
      deviceId:
        "DEV-005",

      serialNumber:
        "AGRITRACE-NODE-005",

      status:
        "ONLINE",

      battery:
        72,

      firmwareVersion:
        "1.0.0",

      currentShipmentId:
        SHIPMENTS.WAREHOUSE,

      location:
        "Noida, Uttar Pradesh",

      type:
        "AgriTrace Sensor Node",

      lastSeenAt:
        NOW,

      createdAt:
        PAST(12),

      updatedAt:
        NOW,
    },

    {
      deviceId:
        "DEV-006",

      serialNumber:
        "AGRITRACE-NODE-006",

      status:
        "OFFLINE",

      battery:
        14,

      firmwareVersion:
        "1.0.0",

      currentShipmentId:
        null,

      location:
        "Lucknow, Uttar Pradesh",

      type:
        "AgriTrace Sensor Node",

      lastSeenAt:
        PAST(1),

      createdAt:
        PAST(10),

      updatedAt:
        PAST(1),
    },
  ];

  await upsertMany(
    "devices",
    devices,
    "deviceId"
  );

  console.log(
    `Devices: ${devices.length} upserted`
  );
}

// ============================================================
// SEED SHIPMENTS
// ============================================================

async function seedShipments(
  users
) {
  const {
    farmer,
    transporter,
    warehouse,
  } = users;

  // IMPORTANT:
  // These are REAL Firebase UIDs obtained
  // from already registered MongoDB users.

  const FARMER_ID =
    farmer.uid;

  const TRANSPORTER_ID =
    transporter.uid;

  const WAREHOUSE_ID =
    warehouse.uid;

  const shipments = [
    // ========================================================
    // 001 - PENDING
    // Only Farmer
    // ========================================================

    {
      shipmentId:
        SHIPMENTS.PENDING,

      name:
        "Lucknow Tomato Shipment",

      trackingId:
        "AGT-2026-00001",

      product:
        "Fresh Tomatoes",

      category:
        "Vegetables",

      batchId:
        "BATCH-TOMATO-001",

      quantity:
        500,

      unit:
        "kg",

      grade:
        "Grade A",

      source:
        "Lucknow",

      sourceDistrict:
        "Lucknow",

      sourceState:
        "Uttar Pradesh",

      destination:
        "Delhi",

      destinationState:
        "Delhi",

      pickupLocation:
        "Farm Collection Centre, Lucknow",

      receiverOrganization:
        "Delhi Fresh Produce Market",

      receiverName:
        "Vikash Singh",

      contactPerson:
        "Vikash Singh",

      phone:
        "+91 98765 43220",

      departureDate:
        null,

      departureTime:
        null,

      deliveryDate:
        null,

      transportType:
        null,

      vehicleNumber:
        null,

      driverName:
        null,

      status:
        SHIPMENT_STATUS.PENDING,

      assignedDevice:
        null,

      device:
        null,

      farmerId:
        FARMER_ID,

      createdBy:
        FARMER_ID,

      transporterId:
        null,

      warehouseId:
        null,

      thresholds:
        produceThresholds,

      progress:
        0,

      stage:
        1,

      createdAt:
        PAST(1),

      updatedAt:
        NOW,
    },

    // ========================================================
    // 002 - DEVICE ASSIGNED
    // Farmer + Device
    // ========================================================

    {
      shipmentId:
        SHIPMENTS.DEVICE_ASSIGNED,

      name:
        "Noida Banana Shipment",

      trackingId:
        "AGT-2026-00002",

      product:
        "Organic Bananas",

      category:
        "Fruits",

      batchId:
        "BATCH-BANANA-002",

      quantity:
        300,

      unit:
        "kg",

      grade:
        "Grade A",

      source:
        "Noida",

      sourceDistrict:
        "Noida",

      sourceState:
        "Uttar Pradesh",

      destination:
        "Mumbai",

      destinationState:
        "Maharashtra",

      pickupLocation:
        "Farm Collection Centre, Noida",

      receiverOrganization:
        "Mumbai Grocers",

      receiverName:
        "Priya Sharma",

      contactPerson:
        "Priya Sharma",

      phone:
        "+91 98765 43221",

      departureDate:
        null,

      departureTime:
        null,

      deliveryDate:
        null,

      transportType:
        null,

      vehicleNumber:
        null,

      driverName:
        null,

      status:
        SHIPMENT_STATUS.DEVICE_ASSIGNED,

      assignedDevice:
        "DEV-002",

      device:
        "DEV-002",

      farmerId:
        FARMER_ID,

      createdBy:
        FARMER_ID,

      transporterId:
        null,

      warehouseId:
        null,

      thresholds:
        produceThresholds,

      progress:
        20,

      stage:
        2,

      createdAt:
        PAST(2),

      updatedAt:
        NOW,
    },

    // ========================================================
    // 003 - READY FOR DISPATCH
    // Farmer + Device + Transporter
    //
    // Transporter can see this.
    // ========================================================

    {
      shipmentId:
        SHIPMENTS.READY,

      name:
        "Lucknow Vegetable Dispatch",

      trackingId:
        "AGT-2026-00003",

      product:
        "Mixed Vegetables",

      category:
        "Vegetables",

      batchId:
        "BATCH-VEG-003",

      quantity:
        750,

      unit:
        "kg",

      grade:
        "Grade A",

      source:
        "Lucknow",

      sourceDistrict:
        "Lucknow",

      sourceState:
        "Uttar Pradesh",

      destination:
        "Noida",

      destinationState:
        "Uttar Pradesh",

      pickupLocation:
        "Agri Collection Hub, Lucknow",

      receiverOrganization:
        "Noida Fresh Foods",

      receiverName:
        "Amit Patel",

      contactPerson:
        "Amit Patel",

      phone:
        "+91 98765 43222",

      departureDate:
        null,

      departureTime:
        null,

      deliveryDate:
        null,

      transportType:
        "Refrigerated Truck",

      vehicleNumber:
        "UP32-AB-1234",

      driverName:
        "Rajesh Kumar",

      status:
        SHIPMENT_STATUS.READY_FOR_DISPATCH,

      assignedDevice:
        "DEV-003",

      device:
        "DEV-003",

      farmerId:
        FARMER_ID,

      createdBy:
        FARMER_ID,

      transporterId:
        TRANSPORTER_ID,

      warehouseId:
        null,

      thresholds:
        produceThresholds,

      progress:
        35,

      stage:
        2,

      createdAt:
        PAST(3),

      updatedAt:
        NOW,
    },

    // ========================================================
    // 004 - IN TRANSIT
    // Farmer + Transporter + Device
    // ========================================================

    {
      shipmentId:
        SHIPMENTS.TRANSIT,

      name:
        "Agra Potato Transit",

      trackingId:
        "AGT-2026-00004",

      product:
        "Fresh Potatoes",

      category:
        "Vegetables",

      batchId:
        "BATCH-POTATO-004",

      quantity:
        1000,

      unit:
        "kg",

      grade:
        "Grade A",

      source:
        "Agra",

      sourceDistrict:
        "Agra",

      sourceState:
        "Uttar Pradesh",

      destination:
        "Delhi",

      destinationState:
        "Delhi",

      pickupLocation:
        "Agra Farm Collection Hub",

      receiverOrganization:
        "Delhi Food Distribution Centre",

      receiverName:
        "Neha Gupta",

      contactPerson:
        "Neha Gupta",

      phone:
        "+91 98765 43223",

      departureDate:
        PAST(1),

      departureTime:
        "06:30",

      deliveryDate:
        null,

      transportType:
        "Refrigerated Truck",

      vehicleNumber:
        "UP80-CD-5678",

      driverName:
        "Rajesh Kumar",

      status:
        SHIPMENT_STATUS.IN_TRANSIT,

      assignedDevice:
        "DEV-001",

      device:
        "DEV-001",

      farmerId:
        FARMER_ID,

      createdBy:
        FARMER_ID,

      transporterId:
        TRANSPORTER_ID,

      warehouseId:
        null,

      thresholds:
        produceThresholds,

      latestTelemetry: {
        temperature:
          22.5,

        humidity:
          65,

        // Prototype MQ-3 response value.
        // NOT calibrated ethylene ppm.

        gasLevel:
          31,

        battery:
          87,

        timestamp:
          NOW,
      },

      temperature:
        22.5,

      humidity:
        65,

      gasLevel:
        31,

      battery:
        87,

      progress:
        65,

      stage:
        3,

      createdAt:
        PAST(4),

      updatedAt:
        NOW,
    },

    // ========================================================
    // 005 - AT WAREHOUSE
    // Farmer + Transporter + Warehouse
    // ========================================================

    {
      shipmentId:
        SHIPMENTS.WAREHOUSE,

      name:
        "Meerut Dairy Shipment",

      trackingId:
        "AGT-2026-00005",

      product:
        "Fresh Dairy Milk",

      category:
        "Dairy",

      batchId:
        "BATCH-DAIRY-005",

      quantity:
        200,

      unit:
        "litres",

      grade:
        "Grade A",

      source:
        "Meerut",

      sourceDistrict:
        "Meerut",

      sourceState:
        "Uttar Pradesh",

      destination:
        "Noida",

      destinationState:
        "Uttar Pradesh",

      pickupLocation:
        "Dairy Collection Centre, Meerut",

      receiverOrganization:
        "FreshChain Cold Storage",

      receiverName:
        "Sunita Devi",

      contactPerson:
        "Sunita Devi",

      phone:
        "+91 98765 43224",

      departureDate:
        PAST(2),

      departureTime:
        "05:00",

      deliveryDate:
        null,

      transportType:
        "Refrigerated Van",

      vehicleNumber:
        "UP15-EF-9012",

      driverName:
        "Rajesh Kumar",

      status:
        SHIPMENT_STATUS.AT_WAREHOUSE,

      assignedDevice:
        "DEV-005",

      device:
        "DEV-005",

      farmerId:
        FARMER_ID,

      createdBy:
        FARMER_ID,

      transporterId:
        TRANSPORTER_ID,

      warehouseId:
        WAREHOUSE_ID,

      thresholds:
        dairyThresholds,

      latestTelemetry: {
        temperature:
          6.2,

        humidity:
          44,

        gasLevel:
          20,

        battery:
          72,

        timestamp:
          NOW,
      },

      temperature:
        6.2,

      humidity:
        44,

      gasLevel:
        20,

      battery:
        72,

      progress:
        85,

      stage:
        4,

      createdAt:
        PAST(5),

      updatedAt:
        NOW,
    },

    // ========================================================
    // 006 - DELIVERED
    // Complete Farm -> Transport -> Warehouse journey
    // ========================================================

    {
      shipmentId:
        SHIPMENTS.DELIVERED,

      name:
        "Jaipur Rice Delivery",

      trackingId:
        "AGT-2026-00006",

      product:
        "Basmati Rice",

      category:
        "Grains",

      batchId:
        "BATCH-RICE-006",

      quantity:
        1000,

      unit:
        "kg",

      grade:
        "Grade A",

      source:
        "Jaipur",

      sourceDistrict:
        "Jaipur",

      sourceState:
        "Rajasthan",

      destination:
        "Delhi",

      destinationState:
        "Delhi",

      pickupLocation:
        "Jaipur Grain Warehouse",

      receiverOrganization:
        "Delhi Distributors",

      receiverName:
        "Deepak Joshi",

      contactPerson:
        "Deepak Joshi",

      phone:
        "+91 98765 43225",

      departureDate:
        PAST(6),

      departureTime:
        "07:00",

      deliveryDate:
        PAST(2),

      transportType:
        "Truck",

      vehicleNumber:
        "RJ14-GH-3456",

      driverName:
        "Rajesh Kumar",

      status:
        SHIPMENT_STATUS.DELIVERED,

      assignedDevice:
        "DEV-004",

      device:
        "DEV-004",

      farmerId:
        FARMER_ID,

      createdBy:
        FARMER_ID,

      transporterId:
        TRANSPORTER_ID,

      warehouseId:
        WAREHOUSE_ID,

      thresholds:
        produceThresholds,

      latestTelemetry: {
        temperature:
          24.1,

        humidity:
          54,

        gasLevel:
          18,

        battery:
          68,

        timestamp:
          PAST(2),
      },

      temperature:
        24.1,

      humidity:
        54,

      gasLevel:
        18,

      battery:
        68,

      progress:
        100,

      stage:
        5,

      createdAt:
        PAST(8),

      updatedAt:
        PAST(2),
    },
  ];

  await upsertMany(
    "shipments",
    shipments,
    "shipmentId"
  );

  console.log(
    `Shipments: ${shipments.length} upserted`
  );
}

// ============================================================
// SEED ALERTS
// ============================================================

async function seedAlerts() {
  const alerts = [
    {
      alertId:
        "ALERT-TEMP-001",

      deviceId:
        "DEV-001",

      shipmentId:
        SHIPMENTS.TRANSIT,

      type:
        "HIGH_TEMP",

      severity:
        "CRITICAL",

      value:
        31.5,

      actualValue:
        31.5,

      threshold: {
        operator:
          ">",

        limit:
          28,

        field:
          "temperature",
      },

      status:
        "OPEN",

      acknowledgedAt:
        null,

      resolvedAt:
        null,

      timestamp:
        PAST(0, 6),

      createdAt:
        PAST(0, 6),

      updatedAt:
        PAST(0, 6),
    },

    {
      alertId:
        "ALERT-GAS-001",

      deviceId:
        "DEV-001",

      shipmentId:
        SHIPMENTS.TRANSIT,

      type:
        "GAS_ALERT",

      severity:
        "WARNING",

      value:
        56,

      actualValue:
        56,

      threshold: {
        operator:
          ">",

        limit:
          50,

        field:
          "gasLevel",
      },

      status:
        "RESOLVED",

      acknowledgedAt:
        PAST(0, 10),

      resolvedAt:
        PAST(0, 9),

      timestamp:
        PAST(0, 12),

      createdAt:
        PAST(0, 12),

      updatedAt:
        PAST(0, 9),
    },

    {
      alertId:
        "ALERT-BATTERY-001",

      deviceId:
        "DEV-006",

      shipmentId:
        null,

      type:
        "LOW_BATTERY",

      severity:
        "WARNING",

      value:
        14,

      actualValue:
        14,

      threshold: {
        operator:
          "<",

        limit:
          15,

        field:
          "battery",
      },

      status:
        "OPEN",

      acknowledgedAt:
        null,

      resolvedAt:
        null,

      timestamp:
        PAST(1),

      createdAt:
        PAST(1),

      updatedAt:
        PAST(1),
    },

    {
      alertId:
        "ALERT-OFFLINE-001",

      deviceId:
        "DEV-006",

      shipmentId:
        null,

      type:
        "DEVICE_OFFLINE",

      severity:
        "CRITICAL",

      value:
        true,

      actualValue:
        true,

      threshold: {
        operator:
          "===",

        limit:
          true,

        field:
          "deviceOffline",
      },

      status:
        "OPEN",

      acknowledgedAt:
        null,

      resolvedAt:
        null,

      timestamp:
        PAST(1),

      createdAt:
        PAST(1),

      updatedAt:
        PAST(1),
    },
  ];

  await upsertMany(
    "alerts",
    alerts,
    "alertId"
  );

  console.log(
    `Alerts: ${alerts.length} upserted`
  );
}

// ============================================================
// TIMELINE HELPER
// ============================================================

function makeTimelineEvent({
  shipmentId,
  type,
  timestamp,
  actorId,
  metadata = {},
}) {
  return {
    eventId:
      randomUUID(),

    shipmentId,

    type,

    timestamp,

    actorId,

    metadata,
  };
}

// ============================================================
// SEED TIMELINE
// ============================================================

async function seedTimeline(
  users
) {
  const FARMER_ID =
    users.farmer.uid;

  const TRANSPORTER_ID =
    users.transporter.uid;

  const WAREHOUSE_ID =
    users.warehouse.uid;

  // Remove only timeline belonging to
  // our six demo shipments before rebuilding it.

  await db
    .collection("timeline")
    .deleteMany({
      shipmentId: {
        $in:
          Object.values(
            SHIPMENTS
          ),
      },
    });

  const events = [
    // --------------------------------------------------------
    // 001
    // --------------------------------------------------------

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.PENDING,

      type:
        TimelineEventType
          .SHIPMENT_CREATED,

      timestamp:
        PAST(1),

      actorId:
        FARMER_ID,

      metadata: {
        status:
          SHIPMENT_STATUS.PENDING,
      },
    }),

    // --------------------------------------------------------
    // 002
    // --------------------------------------------------------

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.DEVICE_ASSIGNED,

      type:
        TimelineEventType
          .SHIPMENT_CREATED,

      timestamp:
        PAST(2),

      actorId:
        FARMER_ID,

      metadata: {
        status:
          SHIPMENT_STATUS.PENDING,
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.DEVICE_ASSIGNED,

      type:
        TimelineEventType
          .DEVICE_ASSIGNED,

      timestamp:
        PAST(1),

      actorId:
        FARMER_ID,

      metadata: {
        deviceId:
          "DEV-002",

        status:
          SHIPMENT_STATUS.DEVICE_ASSIGNED,
      },
    }),

    // --------------------------------------------------------
    // 003
    // --------------------------------------------------------

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.READY,

      type:
        TimelineEventType
          .SHIPMENT_CREATED,

      timestamp:
        PAST(3),

      actorId:
        FARMER_ID,

      metadata: {
        status:
          SHIPMENT_STATUS.PENDING,
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.READY,

      type:
        TimelineEventType
          .DEVICE_ASSIGNED,

      timestamp:
        PAST(2, 12),

      actorId:
        FARMER_ID,

      metadata: {
        deviceId:
          "DEV-003",
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.READY,

      type:
        TimelineEventType
          .TRANSPORTER_ASSIGNED,

      timestamp:
        PAST(2),

      actorId:
        FARMER_ID,

      metadata: {
        transporterId:
          TRANSPORTER_ID,
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.READY,

      type:
        TimelineEventType
          .READY_FOR_DISPATCH,

      timestamp:
        PAST(1),

      actorId:
        FARMER_ID,

      metadata: {
        status:
          SHIPMENT_STATUS.READY_FOR_DISPATCH,
      },
    }),

    // --------------------------------------------------------
    // 004
    // --------------------------------------------------------

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.TRANSIT,

      type:
        TimelineEventType
          .SHIPMENT_CREATED,

      timestamp:
        PAST(4),

      actorId:
        FARMER_ID,

      metadata: {
        status:
          SHIPMENT_STATUS.PENDING,
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.TRANSIT,

      type:
        TimelineEventType
          .DEVICE_ASSIGNED,

      timestamp:
        PAST(3, 12),

      actorId:
        FARMER_ID,

      metadata: {
        deviceId:
          "DEV-001",
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.TRANSIT,

      type:
        TimelineEventType
          .TRANSPORTER_ASSIGNED,

      timestamp:
        PAST(3),

      actorId:
        FARMER_ID,

      metadata: {
        transporterId:
          TRANSPORTER_ID,
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.TRANSIT,

      type:
        TimelineEventType
          .READY_FOR_DISPATCH,

      timestamp:
        PAST(2),

      actorId:
        FARMER_ID,

      metadata: {
        status:
          SHIPMENT_STATUS.READY_FOR_DISPATCH,
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.TRANSIT,

      type:
        TimelineEventType
          .SHIPMENT_DISPATCHED,

      timestamp:
        PAST(1),

      actorId:
        TRANSPORTER_ID,

      metadata: {
        status:
          SHIPMENT_STATUS.IN_TRANSIT,
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.TRANSIT,

      type:
        TimelineEventType
          .TEMPERATURE_EXCURSION,

      timestamp:
        PAST(0, 6),

      actorId:
        "SYSTEM",

      metadata: {
        deviceId:
          "DEV-001",

        temperature:
          31.5,

        threshold:
          28,

        severity:
          "CRITICAL",
      },
    }),

    // --------------------------------------------------------
    // 005
    // --------------------------------------------------------

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.WAREHOUSE,

      type:
        TimelineEventType
          .SHIPMENT_CREATED,

      timestamp:
        PAST(5),

      actorId:
        FARMER_ID,

      metadata: {
        status:
          SHIPMENT_STATUS.PENDING,
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.WAREHOUSE,

      type:
        TimelineEventType
          .DEVICE_ASSIGNED,

      timestamp:
        PAST(4, 12),

      actorId:
        FARMER_ID,

      metadata: {
        deviceId:
          "DEV-005",
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.WAREHOUSE,

      type:
        TimelineEventType
          .TRANSPORTER_ASSIGNED,

      timestamp:
        PAST(4),

      actorId:
        FARMER_ID,

      metadata: {
        transporterId:
          TRANSPORTER_ID,
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.WAREHOUSE,

      type:
        TimelineEventType
          .WAREHOUSE_ASSIGNED,

      timestamp:
        PAST(3, 12),

      actorId:
        FARMER_ID,

      metadata: {
        warehouseId:
          WAREHOUSE_ID,
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.WAREHOUSE,

      type:
        TimelineEventType
          .READY_FOR_DISPATCH,

      timestamp:
        PAST(3),

      actorId:
        FARMER_ID,

      metadata: {
        status:
          SHIPMENT_STATUS.READY_FOR_DISPATCH,
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.WAREHOUSE,

      type:
        TimelineEventType
          .SHIPMENT_DISPATCHED,

      timestamp:
        PAST(2),

      actorId:
        TRANSPORTER_ID,

      metadata: {
        status:
          SHIPMENT_STATUS.IN_TRANSIT,
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.WAREHOUSE,

      type:
        TimelineEventType
          .WAREHOUSE_RECEIVED,

      timestamp:
        PAST(1),

      actorId:
        WAREHOUSE_ID,

      metadata: {
        status:
          SHIPMENT_STATUS.AT_WAREHOUSE,
      },
    }),

    // --------------------------------------------------------
    // 006
    // --------------------------------------------------------

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.DELIVERED,

      type:
        TimelineEventType
          .SHIPMENT_CREATED,

      timestamp:
        PAST(8),

      actorId:
        FARMER_ID,

      metadata: {
        status:
          SHIPMENT_STATUS.PENDING,
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.DELIVERED,

      type:
        TimelineEventType
          .DEVICE_ASSIGNED,

      timestamp:
        PAST(7, 12),

      actorId:
        FARMER_ID,

      metadata: {
        deviceId:
          "DEV-004",
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.DELIVERED,

      type:
        TimelineEventType
          .TRANSPORTER_ASSIGNED,

      timestamp:
        PAST(7),

      actorId:
        FARMER_ID,

      metadata: {
        transporterId:
          TRANSPORTER_ID,
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.DELIVERED,

      type:
        TimelineEventType
          .WAREHOUSE_ASSIGNED,

      timestamp:
        PAST(6, 12),

      actorId:
        FARMER_ID,

      metadata: {
        warehouseId:
          WAREHOUSE_ID,
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.DELIVERED,

      type:
        TimelineEventType
          .READY_FOR_DISPATCH,

      timestamp:
        PAST(6),

      actorId:
        FARMER_ID,

      metadata: {
        status:
          SHIPMENT_STATUS.READY_FOR_DISPATCH,
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.DELIVERED,

      type:
        TimelineEventType
          .SHIPMENT_DISPATCHED,

      timestamp:
        PAST(5),

      actorId:
        TRANSPORTER_ID,

      metadata: {
        status:
          SHIPMENT_STATUS.IN_TRANSIT,
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.DELIVERED,

      type:
        TimelineEventType
          .WAREHOUSE_RECEIVED,

      timestamp:
        PAST(3),

      actorId:
        WAREHOUSE_ID,

      metadata: {
        status:
          SHIPMENT_STATUS.AT_WAREHOUSE,
      },
    }),

    makeTimelineEvent({
      shipmentId:
        SHIPMENTS.DELIVERED,

      type:
        TimelineEventType
          .DELIVERY_COMPLETED,

      timestamp:
        PAST(2),

      actorId:
        WAREHOUSE_ID,

      metadata: {
        status:
          SHIPMENT_STATUS.DELIVERED,
      },
    }),
  ];

  if (events.length) {
    await db
      .collection("timeline")
      .insertMany(events);
  }

  console.log(
    `Timeline: ${events.length} events created`
  );
}

// ============================================================
// REMOVE OLD FAKE SEED DATA
// ============================================================

async function removeLegacySeedData() {
  const oldIds = [
    "seed-ship-001",
    "seed-ship-002",
    "seed-ship-003",
    "seed-ship-004",
    "seed-ship-005",
  ];

  await db
    .collection("shipments")
    .deleteMany({
      shipmentId: {
        $in:
          oldIds,
      },
    });

  await db
    .collection("timeline")
    .deleteMany({
      shipmentId: {
        $in:
          oldIds,
      },
    });

  await db
    .collection("alerts")
    .deleteMany({
      shipmentId: {
        $in:
          oldIds,
      },
    });

  console.log(
    "Old fake seed shipments cleaned."
  );
}

// ============================================================
// VERIFY EVERYTHING
// ============================================================

async function verifySeed(
  users
) {
  const farmerShipments =
    await db
      .collection("shipments")
      .find({
        farmerId:
          users.farmer.uid,
      })
      .toArray();

  const transporterShipments =
    await db
      .collection("shipments")
      .find({
        transporterId:
          users.transporter.uid,
      })
      .toArray();

  const warehouseShipments =
    await db
      .collection("shipments")
      .find({
        warehouseId:
          users.warehouse.uid,
      })
      .toArray();

  console.log(
    "\n======================================"
  );

  console.log(
    "AGRITRACE ROLE VERIFICATION"
  );

  console.log(
    "======================================"
  );

  console.log(
    `\nFarmer: ${users.farmer.email}`
  );

  console.log(
    `UID: ${users.farmer.uid}`
  );

  console.log(
    `Shipments: ${farmerShipments.length}`
  );

  console.log(
    `\nTransporter: ${users.transporter.email}`
  );

  console.log(
    `UID: ${users.transporter.uid}`
  );

  console.log(
    `Shipments: ${transporterShipments.length}`
  );

  console.log(
    `\nWarehouse: ${users.warehouse.email}`
  );

  console.log(
    `UID: ${users.warehouse.uid}`
  );

  console.log(
    `Shipments: ${warehouseShipments.length}`
  );

  console.log(
    "\n======================================"
  );
}

// ============================================================
// MAIN
// ============================================================

async function seedDatabase() {
  console.log(
    "\n======================================"
  );

  console.log(
    "       AGRITRACE DATABASE SEED"
  );

  console.log(
    "======================================\n"
  );

  // ----------------------------------------------------------
  // STEP 1
  // Find REAL Firebase-authenticated users from MongoDB
  // ----------------------------------------------------------

  const users =
    await loadUsers();

  // ----------------------------------------------------------
  // STEP 2
  // Database indexes
  // ----------------------------------------------------------

  await createIndexes();

  // ----------------------------------------------------------
  // STEP 3
  // Remove previous fake seed shipments
  // ----------------------------------------------------------

  await removeLegacySeedData();

  // ----------------------------------------------------------
  // STEP 4
  // Devices
  // ----------------------------------------------------------

  await seedDevices();

  // ----------------------------------------------------------
  // STEP 5
  // Shipments linked using REAL user UIDs
  // ----------------------------------------------------------

  await seedShipments(
    users
  );

  // ----------------------------------------------------------
  // STEP 6
  // Alerts
  // ----------------------------------------------------------

  await seedAlerts();

  // ----------------------------------------------------------
  // STEP 7
  // Timeline linked using REAL user UIDs
  // ----------------------------------------------------------

  await seedTimeline(
    users
  );

  // ----------------------------------------------------------
  // STEP 8
  // Verify relationships
  // ----------------------------------------------------------

  await verifySeed(
    users
  );

  console.log(
    "\nAgriTrace seed completed successfully.\n"
  );
}

// ============================================================
// CONNECT DATABASE
// ============================================================

async function run() {
  try {
    console.log(
      "Connecting to MongoDB..."
    );

    await client.connect();

    db =
      client.db(
        MONGO_DB
      );

    await db.command({
      ping: 1,
    });

    console.log(
      `MongoDB connected: ${MONGO_DB}`
    );

    await seedDatabase();

  } catch (error) {
    console.error(
      "\nAgriTrace seed failed:"
    );

    console.error(
      error.message
    );

    console.error(
      error
    );

    process.exitCode =
      1;

  } finally {
    try {
      await client.close();

      console.log(
        "MongoDB connection closed."
      );

    } catch (error) {
      console.error(
        "Error closing MongoDB:",
        error.message
      );
    }
  }
}

// ============================================================
// START
// ============================================================

run();