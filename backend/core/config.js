import dotenv from "dotenv";

dotenv.config();

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const port = Number(process.env.PORT || 8000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port number");
}

export const config = Object.freeze({
  port,
  mongoUri: requireEnv("MONGO_URI"),
  mongoDbName: requireEnv("MONGO_DB_NAME"),
  mqttBrokerUrl: requireEnv("MQTT_BROKER_URL") || "mqtt://localhost:1883",
  mqttTopic: requireEnv("MQTT_TOPIC"),
  mqttUser: process.env.MQTT_USER?.trim() || "",
  mqttPassword: process.env.MQTT_PASSWORD || "",
  mqttProtocol: process.env.MQTT_PROTOCOL?.trim() || "",
  mqttPort: process.env.MQTT_PORT ? Number(process.env.MQTT_PORT) : null,
  frontendUrl: process.env.FRONTEND_URL?.trim() || "http://localhost:5174",
  blockchainMode: (process.env.BLOCKCHAIN_MODE || "mock").toLowerCase(),
  blockchainRpcUrl: process.env.BLOCKCHAIN_RPC_URL?.trim() || "",
  blockchainPrivateKey: process.env.BLOCKCHAIN_PRIVATE_KEY?.trim() || "",
  blockchainContractAddress: process.env.BLOCKCHAIN_CONTRACT_ADDRESS?.trim() || "",
  blockchainNetwork: process.env.BLOCKCHAIN_NETWORK?.trim() || "mock",
  geocodingEnabled: process.env.GEOCODING_ENABLED === "true",
  geocodingEndpoint:
    process.env.GEOCODING_ENDPOINT?.trim() ||
    "https://nominatim.openstreetmap.org/reverse",
  geocodingUserAgent: process.env.GEOCODING_USER_AGENT?.trim() || "",
  geocodingTimeoutMs: Math.max(
    1000,
    Number.parseInt(process.env.GEOCODING_TIMEOUT_MS || "5000", 10) || 5000
  ),
  geocodingMovementMeters: Math.max(
    0,
    Number.parseInt(process.env.GEOCODING_MIN_MOVEMENT_METERS || "100", 10) || 100
  ),
  geocodingCacheTtlMs: Math.max(
    60000,
    Number.parseInt(process.env.GEOCODING_CACHE_TTL_MS || "86400000", 10) || 86400000
  ),
  geocodingCacheMaxEntries: Math.max(
    1,
    Number.parseInt(process.env.GEOCODING_CACHE_MAX_ENTRIES || "500", 10) || 500
  ),

  // --------------------------------------------------------
  // Critical gas alert threshold
  // --------------------------------------------------------
  // Backend-authoritative gas level threshold. This is the raw MQ sensor
  // value (NOT ethylene ppm). Used as the default when a shipment does not
  // define its own thresholds.gasLevel.max.
  criticalGasThreshold: (() => {
    const raw = Number.parseFloat(process.env.CRITICAL_GAS_THRESHOLD);
    if (!Number.isFinite(raw) || raw < 0) return 4000;
    return raw;
  })(),

  // Push notifications are enabled only when explicitly turned on. Disabled
  // by default so environments without Firebase Messaging credentials keep
  // working exactly as before.
  pushNotificationsEnabled: process.env.PUSH_NOTIFICATIONS_ENABLED === "true",

  // Development-only endpoints (e.g. /alerts/test-critical) are exposed only
  // when the backend is explicitly running in development.
  nodeEnv: (process.env.NODE_ENV || "development").toLowerCase(),
});
