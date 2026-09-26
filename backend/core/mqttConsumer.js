import mqtt from "mqtt";

import {getTelemetryCollection, getCollection,} from "./mongo.js";

import {normalizeTelemetry, validateReading,} from "../models/telemetry.js";

import {parseTelemetryTopic,} from "../models/mqttTopic.js";

import {evaluateAlerts, resolveSystemAlert,} from "../services/alertService.js";

import {broadcastToShipment,broadcastToAll,} from "./websocket.js";

import { config } from "./config.js";

import {generateTelemetryHash,}
  from "../services/integrityService.js";

import {resolvePreviousHash,}
  from "../services/integrityService.js";

import {reverseGeocodeLocation,} from "../services/geocodingService.js";


let client = null;

let lastShipmentMismatchWarning = "";


// ==========================================================
// ACK TOPIC
// ==========================================================

function getAckTopic(deviceId) {
  return `agr/devices/${deviceId}/ack`;
}


// ==========================================================
// PARSE OPTIONAL PAYLOAD DATE
// ==========================================================

// Returns a Date for a valid timestamp-ish value, otherwise null.
// Used for optional firmware fields (transmittedAt, queuedAt) without
// throwing on malformed input.

function parsePayloadDate(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date
      : null;
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date
      : null;
  }

  return null;
}


// ==========================================================
// PUBLISH TELEMETRY ACK
// ==========================================================

function publishTelemetryAck(
  deviceId,
  sequenceNumber,
  {
    accepted = true,
    duplicate = false,
    reason = null,
  } = {}
) {
  if (!client) {
    console.warn(
      `[MQTT] Cannot send ACK: client not initialized`
    );

    return;
  }


  if (!client.connected) {
    console.warn(
      `[MQTT] Cannot send ACK for ${deviceId} #${sequenceNumber}: broker disconnected`
    );

    return;
  }


  const ackPayload = {
    deviceId,
    sequenceNumber,
    accepted,
    duplicate,
    acknowledgedAt:
      new Date().toISOString(),
  };


  if (reason) {
    ackPayload.reason = reason;
  }


  const ackTopic =
    getAckTopic(deviceId);


  client.publish(
    ackTopic,
    JSON.stringify(ackPayload),
    {
      qos: 1,
      retain: false,
    },
    (error) => {
      if (error) {
        console.error(
          `[MQTT] Failed ACK ${deviceId} #${sequenceNumber}:`,
          error.message
        );

        return;
      }


      console.log(
        `[MQTT] ACK sent ${deviceId} #${sequenceNumber}` +
          (duplicate
            ? " (duplicate)"
            : "")
      );
    }
  );
}


// ==========================================================
// HANDLE TELEMETRY MESSAGE
// ==========================================================

async function handleMessage(
  topic,
  message
) {
  const receivedAt =
    new Date();

  // --------------------------------------------------------
  // Parse JSON
  // --------------------------------------------------------

  let data;

  try {
    data =
      JSON.parse(
        message.toString()
      );
  } catch {
    console.warn(
      "Rejected telemetry: malformed JSON"
    );

    return;
  }


  // --------------------------------------------------------
  // Validate MQTT topic
  // --------------------------------------------------------

  const parsedTopic =
    parseTelemetryTopic(topic);


  if (!parsedTopic) {
    console.warn(
      `Rejected telemetry: invalid topic format ${topic}`
    );

    return;
  }


  const {
    deviceId: topicDeviceId,
  } = parsedTopic;


  // --------------------------------------------------------
  // Validate payload structure
  // --------------------------------------------------------

  const errors =
    validateReading(data);


  if (errors.length > 0) {
    console.log(
      "Rejected reading:",
      errors
    );


    if (
      typeof data?.deviceId === "string" &&
      Number.isInteger(
        data?.sequenceNumber
      )
    ) {
      publishTelemetryAck(
        data.deviceId,
        data.sequenceNumber,
        {
          accepted: false,
          duplicate: false,
          reason:
            errors.join(", "),
        }
      );
    }


    return;
  }


  // --------------------------------------------------------
  // Topic device must match payload device
  // --------------------------------------------------------

  if (
    topicDeviceId !==
    data.deviceId
  ) {
    console.warn(
      `Rejected telemetry: topic device ${topicDeviceId} does not match payload ${data.deviceId}`
    );


    publishTelemetryAck(
      topicDeviceId,
      data.sequenceNumber,
      {
        accepted: false,
        reason:
          "topic_device_mismatch",
      }
    );


    return;
  }


  // --------------------------------------------------------
  // Find registered device
  // --------------------------------------------------------

  const device =
    await getCollection(
      "devices"
    ).findOne({
      deviceId:
        topicDeviceId,
    });


  if (!device) {
    console.log(
      "Rejected: unknown device",
      topicDeviceId
    );


    publishTelemetryAck(
      topicDeviceId,
      data.sequenceNumber,
      {
        accepted: false,
        reason:
          "unknown_device",
      }
    );


    return;
  }


  // ========================================================
  // BACKEND-AUTHORITATIVE SHIPMENT
  // ========================================================

  const assignedShipmentId =
    device.currentShipmentId ||
    null;


  // Firmware may optionally report shipmentId,
  // but backend assignment is authoritative.

  if (
    data.shipmentId !==
      undefined &&
    data.shipmentId !==
      assignedShipmentId
  ) {
    const warningKey =
      `${topicDeviceId}:${data.shipmentId}:${assignedShipmentId}`;


    if (
      warningKey !==
      lastShipmentMismatchWarning
    ) {
      console.warn(
        `MQTT shipment mismatch for ${topicDeviceId}: payload=${data.shipmentId} backend=${assignedShipmentId}. Using backend assignment.`
      );


      lastShipmentMismatchWarning =
        warningKey;
    }
  }


  // --------------------------------------------------------
  // Fetch shipment for threshold/alert evaluation
  // --------------------------------------------------------

  const assignedShipment =
    assignedShipmentId
      ? await getCollection(
          "shipments"
        ).findOne({
          shipmentId:
            assignedShipmentId,
        })
      : null;


  // ========================================================
  // NORMALIZE TELEMETRY
  // ========================================================

  const normalizedTelemetry =
    normalizeTelemetry(
      data,
      topicDeviceId,
      assignedShipmentId,
      receivedAt
    );


  if (
    normalizedTelemetry.gpsValid
  ) {
    try {
      normalizedTelemetry.location =
        await reverseGeocodeLocation({
          latitude:
            normalizedTelemetry.latitude,
          longitude:
            normalizedTelemetry.longitude,
          previousLocation:
            device.lastLocation,
          receivedAt,
        });
    } catch (error) {
      console.warn(
        `[MQTT] Reverse geocoding failed for ${topicDeviceId} #${normalizedTelemetry.sequenceNumber}:`,
        error.message
      );
    }
  }


  // --------------------------------------------------------
  // Integrity metadata (SHA-256 + tamper-evident chain)
  // --------------------------------------------------------

  const telemetryCollection =
    getTelemetryCollection();

  normalizedTelemetry.dataHash =
    generateTelemetryHash(
      normalizedTelemetry
    );

  // Hash chaining: link this reading to the previous reading for the same
  // device (by sequenceNumber). This is a normal DB hash chain used to make
  // gaps/mutations detectable. It is NOT a blockchain; the periodic shipment
  // checkpoints remain the actual anchor committed via blockchainService.

  const previousReading =
    await telemetryCollection
      .findOne(
        {
          deviceId: topicDeviceId,
          sequenceNumber: {
            $lt:
              normalizedTelemetry.sequenceNumber,
          },
        },
        {
          sort: {
            sequenceNumber: -1,
          },
        }
      );


  normalizedTelemetry.previousHash =
    resolvePreviousHash(
      previousReading
    );


  normalizedTelemetry.previousSequenceNumber =
    Number.isInteger(
      previousReading?.sequenceNumber
    )
      ? previousReading.sequenceNumber
      : null;


  normalizedTelemetry.checkpointId =
    null;


  normalizedTelemetry.checkpointed =
    false;


  // Useful backend ingestion metadata

  normalizedTelemetry.receivedAt =
    receivedAt.toISOString();


  normalizedTelemetry.ingestionSource =
    "MQTT";


  // --------------------------------------------------------
  // Offline-first transmission metadata
  // --------------------------------------------------------

  const transmittedAt =
    parsePayloadDate(
      data.transmittedAt ??
        data.transmission?.transmittedAt
    );

  if (
    normalizedTelemetry.transmission
  ) {
    if (
      normalizedTelemetry
        .transmission.source ===
      "SD_SYNC"
    ) {
      normalizedTelemetry
        .transmission.syncStatus =
        "SYNCED";

      normalizedTelemetry
        .transmission.syncedAt =
        receivedAt;
    }

    if (
      transmittedAt &&
      !normalizedTelemetry
        .transmission.transmittedAt
    ) {
      normalizedTelemetry
        .transmission.transmittedAt =
        transmittedAt;
    }
  }

  // ========================================================
  // STORE TELEMETRY + DEDUPLICATE
  // ========================================================

  try {
    // Deduplication is enforced by the compound unique index on
    // { deviceId, sequenceNumber }. An SD-synchronized replay of a reading
    // the backend already holds therefore throws E11000 and is ACKed as a
    // duplicate — which the firmware treats as safely stored.

    await telemetryCollection.insertOne({
      ...normalizedTelemetry,

      timestamp:
        new Date(
          normalizedTelemetry.timestamp
        ),

      receivedAt:
        new Date(
          normalizedTelemetry.receivedAt
        ),
    });
  } catch (error) {
    // ------------------------------------------------------
    // Duplicate telemetry
    // ------------------------------------------------------

    if (error?.code === 11000) {
      console.log(
        `[MQTT] Duplicate telemetry ignored: ${topicDeviceId} #${normalizedTelemetry.sequenceNumber}`
      );


      // Important:
      // ACK duplicates as accepted, because the firmware
      // may simply have missed the previous ACK, OR it may be
      // replaying an SD record the backend already stored.
      // Either way the backend already has this deviceId +
      // sequenceNumber, so it is safe for the firmware to
      // clear the matching microSD record.

      publishTelemetryAck(
        topicDeviceId,
        normalizedTelemetry.sequenceNumber,
        {
          accepted: true,
          duplicate: true,
        }
      );


      // If this was an SD replay, still refresh sync-health so the
      // dashboard does not show a stale backlog after a post-restart
      // replay that hit an already-stored reading.

      if (
        normalizedTelemetry.transmission
          ?.source === "SD_SYNC"
      ) {
        try {
          await getCollection(
            "devices"
          ).updateOne(
            {
              deviceId:
                topicDeviceId,
            },
            {
              $set: {
                lastSuccessfulSyncAt:
                  new Date().toISOString(),

                lastSyncedSequence:
                  normalizedTelemetry
                    .sequenceNumber,

                lastSyncSource:
                  "SD_SYNC",
              },
            }
          );
        } catch (syncError) {
          console.error(
            `[MQTT] Failed updating sync health for duplicate SD replay ${topicDeviceId} #${normalizedTelemetry.sequenceNumber}:`,
            syncError.message
          );
        }
      }

      // Duplicate telemetry still proves that the physical device
// is alive and communicating with the backend.
const duplicateSeenAt = new Date().toISOString();

await getCollection("devices").updateOne(
  {
    deviceId: topicDeviceId,
  },
  {
    $set: {
      status: "ONLINE",
      lastSeenAt: duplicateSeenAt,
      mqttStatus: "CONNECTED",
    },
  }
);

broadcastToAll({
  type: "device.updated",
  data: {
    deviceId: topicDeviceId,
    status: "ONLINE",
    lastSeenAt: duplicateSeenAt,
  },
});


      return;
    }


    throw error;
  }


  // ========================================================
  // UPDATE DEVICE STATE
  // ========================================================

  const previousDeviceState =
    device.status;


  const nowIso =
    new Date().toISOString();


  const deviceUpdate = {
    status:
      "ONLINE",

    battery:
      normalizedTelemetry.battery,

    lastSeenAt:
      nowIso,

    lastTelemetrySequence:
      normalizedTelemetry.sequenceNumber,

    firmware:
      normalizedTelemetry.firmware ||
      null,

    sensorHealth:
      normalizedTelemetry.sensorHealth ||
      null,

    connectivity:
      normalizedTelemetry.connectivity ||
      null,

    // ------------------------------------------------------
    // Device / sync health
    // ------------------------------------------------------

    lastSyncSource:
      normalizedTelemetry.transmission
        ?.source ?? "LIVE",

    connectivityState:
      normalizedTelemetry.connectivity
        ?.state ?? null,

    mqttStatus:
      normalizedTelemetry.connectivity
        ?.mqttStatus ??
      "CONNECTED",

    sdCardStatus:
      normalizedTelemetry.connectivity
        ?.sdCardStatus ??
      normalizedTelemetry.connectivity
        ?.sdStatus ?? null,
  };


  // Only advance lastSuccessfulSyncAt when the reading is confirmed
  // stored. This is what the dashboard surfaces as "last sync".

  if (
    normalizedTelemetry.transmission
      ?.source === "SD_SYNC"
  ) {
    deviceUpdate.lastSuccessfulSyncAt =
      nowIso;


    deviceUpdate.lastSyncedSequence =
      normalizedTelemetry
        .sequenceNumber;
  }


  // Firmware-reported backlog (how many SD records are still pending
  // upload). Reported opportunistically; not required.

  const pendingOfflineRecords =
    normalizedTelemetry.connectivity
      ?.pendingOfflineRecords;


  if (
    Number.isInteger(
      pendingOfflineRecords
    ) &&
    pendingOfflineRecords >= 0
  ) {
    deviceUpdate.pendingOfflineRecords =
      pendingOfflineRecords;
  }


  if (
    normalizedTelemetry.firmware
  ) {
    deviceUpdate.firmwareVersion =
      normalizedTelemetry.firmware;
  }


  // --------------------------------------------------------
  // Latest measurements
  // --------------------------------------------------------

  if (
    typeof
      normalizedTelemetry.temperature ===
    "number"
  ) {
    deviceUpdate.lastTemperature =
      normalizedTelemetry.temperature;
  }


  if (
    typeof
      normalizedTelemetry.humidity ===
    "number"
  ) {
    deviceUpdate.lastHumidity =
      normalizedTelemetry.humidity;
  }


  if (
    typeof
      normalizedTelemetry.gasLevel ===
    "number"
  ) {
    deviceUpdate.lastGasLevel =
      normalizedTelemetry.gasLevel;
  }


  // --------------------------------------------------------
  // GPS
  // --------------------------------------------------------

  if (
    normalizedTelemetry.gpsValid &&
    normalizedTelemetry.latitude !== null &&
    normalizedTelemetry.longitude !== null
  ) {
    deviceUpdate.lastLocation = {
      latitude:
        normalizedTelemetry.latitude,
      longitude:
        normalizedTelemetry.longitude,
      gpsValid:
        true,
      satelliteCount:
        normalizedTelemetry.satelliteCount,
      hdop:
        normalizedTelemetry.hdop,
      accuracy:
        normalizedTelemetry.accuracy,
      locality:
        normalizedTelemetry.location?.locality ?? null,
      city:
        normalizedTelemetry.location?.city ?? null,
      district:
        normalizedTelemetry.location?.district ?? null,
      state:
        normalizedTelemetry.location?.state ?? null,
      country:
        normalizedTelemetry.location?.country ?? null,
      countryCode:
        normalizedTelemetry.location?.countryCode ?? null,
      displayName:
        normalizedTelemetry.location?.displayName ?? null,
      timeSource:
        normalizedTelemetry.timeSource,
      clockValid:
        normalizedTelemetry.clockValid,
      timestamp:
        normalizedTelemetry.timestamp.toISOString(),
      receivedAt:
        normalizedTelemetry.receivedAt,
      updatedAt:
        nowIso,
    };
  }


  // --------------------------------------------------------
  // Preserve backend shipment association
  // --------------------------------------------------------

  if (assignedShipmentId) {
    deviceUpdate.currentShipmentId =
      assignedShipmentId;
  }


  await getCollection(
    "devices"
  ).updateOne(
    {
      deviceId:
        topicDeviceId,
    },
    {
      $set:
        deviceUpdate,
    }
  );


  // ========================================================
  // RESOLVE OFFLINE ALERT
  // ========================================================

  if (
    previousDeviceState ===
    "OFFLINE"
  ) {
    try {
      await resolveSystemAlert(
        topicDeviceId,
        "DEVICE_OFFLINE",
        "SYSTEM"
      );
    } catch (error) {
      console.error(
        `[MQTT] Failed resolving DEVICE_OFFLINE alert for ${topicDeviceId}:`,
        error.message
      );
    }
  }


  // ========================================================
  // DEVICE ONLINE EVENT
  // ========================================================

  // Only broadcast when device actually changes state.
  // Do not emit this every telemetry cycle.

  if (
    previousDeviceState !==
    "ONLINE"
  ) {
    broadcastToAll({
      type:
        "device.online",

      data: {
        deviceId:
          topicDeviceId,

        status:
          "ONLINE",

        battery:
          normalizedTelemetry.battery,

        lastSeenAt:
          nowIso,
      },
    });
  }


  // ========================================================
  // DEVICE UPDATED EVENT
  // ========================================================

  // Useful for device-health/dashboard UI.

  broadcastToAll({
    type:
      "device.updated",

    data: {
      deviceId:
        topicDeviceId,

      status:
        "ONLINE",

      battery:
        normalizedTelemetry.battery,

      lastSeenAt:
        nowIso,

      lastTelemetrySequence:
        normalizedTelemetry.sequenceNumber,

      firmware:
        normalizedTelemetry.firmware ||
        null,

      sensorHealth:
        normalizedTelemetry.sensorHealth ||
        null,

      connectivity:
        normalizedTelemetry.connectivity ||
        null,
    },
  });


  // ========================================================
  // ALERT PROCESSING
  // ========================================================

  try {
    await evaluateAlerts(
      normalizedTelemetry,
      assignedShipment
    );
  } catch (error) {
    // Telemetry itself has already been stored.
    // An alert-service problem should not lose the reading.

    console.error(
      "Alert processing failed:",
      error.message
    );
  }


  // ========================================================
  // SEND ACK
  // ========================================================

  // ACK is sent only AFTER:
  //
  // 1. validation
  // 2. device verification
  // 3. telemetry storage
  // 4. device state update
  //
  // This lets firmware safely clear its offline queue.

  // ACK is only sent for SD_SYNC readings after the reading is durably
  // stored. The firmware treats this ACK as permission to delete the matching
  // microSD record (deviceId + sequenceNumber). A duplicate ACK is equally
  // safe: the backend already has that reading.

  publishTelemetryAck(
    topicDeviceId,
    normalizedTelemetry.sequenceNumber,
    {
      accepted: true,
      duplicate: false,
    }
  );


  // ========================================================
  // REALTIME TELEMETRY EVENT
  // ========================================================

  console.log(
    `[MQTT] Telemetry stored: ${topicDeviceId} #${normalizedTelemetry.sequenceNumber}` +
      (
        normalizedTelemetry.shipmentId
          ? ` -> shipment ${normalizedTelemetry.shipmentId}`
          : " -> unassigned"
      ) +
      (
        normalizedTelemetry.transmission
          ?.source === "SD_SYNC"
          ? " (SD_SYNC)"
          : ""
      )
  );


  // Shipment-scoped broadcast is preferred because
  // authenticated web/mobile clients subscribe to shipments.

  if (
    normalizedTelemetry.shipmentId
  ) {
    broadcastToShipment(
      normalizedTelemetry.shipmentId,
      {
        type:
          "telemetry.updated",

        data:
          normalizedTelemetry,
      }
    );
  }
}


// ==========================================================
// START MQTT CONSUMER
// ==========================================================

export function startMqttConsumer() {
  // Prevent multiple MQTT connections if this function
  // gets called more than once.

  if (client) {
    return client;
  }


  const mqttOptions = {
    reconnectPeriod:
      5000,

    connectTimeout:
      10000,

    clean:
      true,

    clientId:
      `agritrace-backend-${process.pid}`,

    ...(config.mqttUser
      ? {
          username:
            config.mqttUser,
        }
      : {}),

    ...(config.mqttPassword
      ? {
          password:
            config.mqttPassword,
        }
      : {}),

    ...(config.mqttProtocol
      ? {
          protocol:
            config.mqttProtocol,
        }
      : {}),

    ...(config.mqttPort
      ? {
          port:
            config.mqttPort,
        }
      : {}),
  };


  // --------------------------------------------------------
  // Connect broker
  // --------------------------------------------------------

  client =
    mqtt.connect(
      config.mqttBrokerUrl,
      mqttOptions
    );


  // --------------------------------------------------------
  // Connected
  // --------------------------------------------------------

  client.on(
    "connect",
    () => {
      console.log(
        `[MQTT] Connected to ${config.mqttBrokerUrl}`
      );


      console.log(
        `[MQTT] Subscribing to ${config.mqttTopic}`
      );


      client.subscribe(
        config.mqttTopic,
        {
          qos: 1,
        },
        (error) => {
          if (error) {
            console.error(
              "MQTT subscription error:",
              error.message
            );

            return;
          }


          console.log(
            `[MQTT] Subscribed to ${config.mqttTopic}`
          );
        }
      );
    }
  );


  // --------------------------------------------------------
  // Reconnecting
  // --------------------------------------------------------

  client.on(
    "reconnect",
    () => {
      console.log(
        "[MQTT] Reconnecting to broker..."
      );
    }
  );


  // --------------------------------------------------------
  // Offline
  // --------------------------------------------------------

  client.on(
    "offline",
    () => {
      console.warn(
        "[MQTT] Broker connection offline"
      );
    }
  );


  // --------------------------------------------------------
  // Closed
  // --------------------------------------------------------

  client.on(
    "close",
    () => {
      console.warn(
        "[MQTT] Broker connection closed"
      );
    }
  );


  // --------------------------------------------------------
  // Error
  // --------------------------------------------------------

  client.on(
    "error",
    (error) => {
      console.error(
        "MQTT connection error:",
        error.message
      );
    }
  );


  // --------------------------------------------------------
  // Messages
  // --------------------------------------------------------

  client.on(
    "message",
    (
      topic,
      message
    ) => {
      handleMessage(
        topic,
        message
      ).catch((error) => {
        console.error(
          "MQTT telemetry processing failed:",
          error
        );
      });
    }
  );


  return client;
}


// ==========================================================
// STOP MQTT CONSUMER
// ==========================================================

export async function stopMqttConsumer() {
  if (!client) {
    return;
  }


  const activeClient =
    client;


  client = null;


  try {
    await activeClient.endAsync();

    console.log(
      "MQTT consumer stopped"
    );
  } catch (error) {
    console.error(
      "Failed stopping MQTT consumer:",
      error.message
    );
  }
}