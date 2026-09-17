import mqtt from "mqtt";

import {getTelemetryCollection, getCollection,} from "./mongo.js";

import {normalizeTelemetry, validateReading,} from "../models/telemetry.js";

import {parseTelemetryTopic,} from "../models/mqttTopic.js";

import {evaluateAlerts, resolveSystemAlert,} from "../services/alertService.js";

import {broadcastToShipment,broadcastToAll,} from "./websocket.js";

import { config } from "./config.js";

import {generateTelemetryHash,} from "../services/integrityService.js";


let client = null;

let lastShipmentMismatchWarning = "";


// ==========================================================
// ACK TOPIC
// ==========================================================

function getAckTopic(deviceId) {
  return `agr/devices/${deviceId}/ack`;
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
      assignedShipmentId
    );


  // --------------------------------------------------------
  // Integrity metadata
  // --------------------------------------------------------

  normalizedTelemetry.dataHash =
    generateTelemetryHash(
      normalizedTelemetry
    );


  normalizedTelemetry.checkpointId =
    null;


  normalizedTelemetry.checkpointed =
    false;


  // Useful backend ingestion metadata

  normalizedTelemetry.receivedAt =
    new Date().toISOString();


  normalizedTelemetry.ingestionSource =
    "MQTT";


  // ========================================================
  // STORE TELEMETRY + DEDUPLICATE
  // ========================================================

  const telemetryCollection =
    getTelemetryCollection();


  try {
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
      // may simply have missed the previous ACK.

      publishTelemetryAck(
        topicDeviceId,
        normalizedTelemetry.sequenceNumber,
        {
          accepted: true,
          duplicate: true,
        }
      );


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
  };


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
    typeof
      normalizedTelemetry.latitude ===
      "number" &&
    typeof
      normalizedTelemetry.longitude ===
      "number"
  ) {
    deviceUpdate.lastLocation = {
      latitude:
        normalizedTelemetry.latitude,

      longitude:
        normalizedTelemetry.longitude,

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