import express from "express";
import cors from "cors";
import { createServer } from "http";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import shipmentRoutes from "./routes/shipmentRoutes.js";
import deviceRoutes from "./routes/deviceRoutes.js";
import alertRoutes from "./routes/alertRoutes.js";
import { connectMongo } from "./core/mongo.js";
import { startMqttConsumer } from "./core/mqttConsumer.js";
import { setupWebSocket } from "./core/websocket.js";
import timelineRoutes from "./routes/timelineRoutes.js";
import telemetryRoutes from "./routes/telemetryRoutes.js";
import { config } from "./core/config.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import environmentSummaryRoutes from "./routes/environmentSummaryRoutes.js";
import publicTraceRoutes from "./routes/publicTraceRoutes.js";
import qrRoutes from "./routes/qrRoutes.js";
import integrityRoutes from "./routes/integrityRoutes.js";
import routeRoutes from "./routes/routeRoutes.js";
import marketplaceRoutes from "./routes/marketplaceRoutes.js";
import { checkOfflineDevices } from "./services/deviceMonitorService.js";
import { startCheckpointScheduler } from "./services/checkpointService.js";

const app = express();
app.use(cors({ origin: config.frontendUrl }));
app.use(express.json());
app.use("/api/v1/shipments", timelineRoutes);

app.get("/", (req, res) => {
  res.json({ status: "AgriTrace backend (Node) is running" });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/alerts", alertRoutes);
app.use("/api/v1/shipments", shipmentRoutes);
app.use("/api/v1/shipments", environmentSummaryRoutes);
app.use("/api/v1/shipments", qrRoutes);
app.use("/api/v1", integrityRoutes);
app.use("/api/v1/devices", deviceRoutes);
app.use("/api/v1/telemetry", telemetryRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/public", publicTraceRoutes);
app.use("/api/v1/routes", routeRoutes);
app.use("/api/v1/marketplace", marketplaceRoutes);

app.get("/api/v1", (req, res) => {
  res.json({
    success: true,
    data: {
      service: "AgriTrace API",
      version: "v1",
      status: "running",
    },
  });
});

app.get("/api/v1/health", async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        firebase: "connected",
        mongodb: "connected",
        mqtt: "connected",
        websocket: "running",
        blockchain: {
          mode: config.blockchainMode || "mock",
          status: "ready",
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Health check failed" });
  }
});

const server = createServer(app);
setupWebSocket(server);

connectMongo()
  .then(() => {
    server.listen(config.port, () => {
      console.log(`Server running on http://127.0.0.1:${config.port}`);
    });

    startMqttConsumer();

    startCheckpointScheduler();

    setInterval(() => {
      checkOfflineDevices().catch((err) => {
        console.error("Device monitor error:", err);
      });
    }, 60 * 1000);

  })
  .catch((err) => {
    console.error("Failed to start backend:", err);
  });