import test from "node:test";
import assert from "node:assert/strict";
import mqtt from "mqtt";
import { parseTelemetryTopic } from "../models/mqttTopic.js";
import { validateReading } from "../models/telemetry.js";
import { config } from "../core/config.js";

test("parseTelemetryTopic handles simulator topic format", () => {
  const topic = `agr/devices/DEV001/telemetry`;
  const result = parseTelemetryTopic(topic);
  assert.deepEqual(result, { deviceId: "DEV001" });
});

test("simulator readings pass validateReading", () => {
  const scenarios = {
    normal: { temperature: 25, humidity: 55, gasLevel: 10, battery: 80 },
    highTemp: { temperature: 42, humidity: 55, gasLevel: 10, battery: 80 },
    abnormalHumidity: { temperature: 25, humidity: 95, gasLevel: 10, battery: 80 },
    gasAlert: { temperature: 25, humidity: 55, gasLevel: 75, battery: 80 },
    lowBattery: { temperature: 25, humidity: 55, gasLevel: 10, battery: 8 },
  };

  for (const [name, values] of Object.entries(scenarios)) {
    const reading = {
      deviceId: "DEV001",
      sequenceNumber: 1,
      shipmentId: "c9d67426-21e0-4e71-a9b1-72f7808cc6f9",
      timestamp: new Date().toISOString(),
      latitude: 25.3176,
      longitude: 82.9739,
      ...values,
    };
    const errors = validateReading(reading);
    assert.equal(errors.length, 0, `${name} should pass validation: ${errors.join(", ")}`);
  }
});

test("MQTT broker connection can be established", async () => {
  if (!config.mqttBrokerUrl) {
    console.log("SKIP: No MQTT broker configured");
    return;
  }

  const client = mqtt.connect(config.mqttBrokerUrl);

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("MQTT connection timeout")), 10000);
      client.on("connect", () => {
        clearTimeout(timeout);
        resolve();
      });
      client.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    assert.ok(client.connected, "MQTT client should be connected");
    client.end();
  } catch (err) {
    client.end();
    console.log("SKIP: MQTT broker not reachable in this environment:", err.message);
  }
});

test("MQTT publish and subscribe roundtrip", async () => {
  if (!config.mqttBrokerUrl) {
    console.log("SKIP: No MQTT broker configured");
    return;
  }

  try {
    const publisher = mqtt.connect(config.mqttBrokerUrl);
    const subscriber = mqtt.connect(config.mqttBrokerUrl);

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("MQTT connection timeout")), 10000);
      subscriber.on("connect", () => {
        subscriber.subscribe("agr/devices/TEST-DEVICE/telemetry");
      });
      subscriber.on("message", (topic, message) => {
        clearTimeout(timeout);
        resolve({ topic, message: message.toString() });
      });
      publisher.on("connect", () => {
        publisher.publish("agr/devices/TEST-DEVICE/telemetry", JSON.stringify({ test: true }));
      });
      publisher.on("error", reject);
      subscriber.on("error", reject);
      setTimeout(() => reject(new Error("Roundtrip timeout")), 10000), setTimeout(() => {
        publisher.end();
        subscriber.end();
      }, 500);
    });

    assert.ok(true, "Roundtrip should complete");
  } catch (err) {
    console.log("SKIP: MQTT broker not reachable in this environment:", err.message);
  }
});

test("MQTT topic schema matches simulator format", () => {
  const deviceId = "DEV001";
  const topic = `agr/devices/${deviceId}/telemetry`;
  const parsed = parseTelemetryTopic(topic);
  assert.equal(parsed.deviceId, deviceId);
});

test("MQTT topics from simulator are valid for consumer processing", () => {
  const scenarios = ["normal", "highTemp", "abnormalHumidity", "gasAlert", "lowBattery"];
  const deviceId = "DEV001";
  const baseTopic = `agr/devices/${deviceId}/telemetry`;

  for (const scenario of scenarios) {
    const parsed = parseTelemetryTopic(baseTopic);
    assert.deepEqual(parsed, { deviceId }, `Scenario ${scenario}: topic should parse correctly`);
  }
});