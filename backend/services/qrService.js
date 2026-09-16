import { randomBytes } from "crypto";
import QRCode from "qrcode";
import { config } from "../core/config.js";
import { getCollection } from "../core/mongo.js";
import { getShipmentForUser } from "./shipmentService.js";

const PUBLIC_TRACE_BASE_URL = process.env.PUBLIC_TRACE_BASE_URL?.trim()
  || `${config.frontendUrl}/trace`;

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, "");
}

export function buildTraceUrl(trackingId) {
  const normalized = normalizeBaseUrl(PUBLIC_TRACE_BASE_URL);
  return `${normalized}/${trackingId}`;
}

export async function generateShipmentQr(shipmentId, actorUid, actorRole) {
  const shipment = await getShipmentForUser(shipmentId, actorUid, actorRole);
  if (!shipment) {
    return null;
  }

  if (!shipment.trackingId) {
    throw new Error("Shipment does not have a trackingId");
  }

  const traceUrl = buildTraceUrl(shipment.trackingId);
  const qrDataUrl = await QRCode.toDataURL(traceUrl);

  return {
    shipmentId: shipment.shipmentId,
    trackingId: shipment.trackingId,
    traceUrl,
    qrDataUrl,
  };
}

export async function generateShipmentQrPng(shipmentId, actorUid, actorRole) {
  const shipment = await getShipmentForUser(shipmentId, actorUid, actorRole);
  if (!shipment) {
    return null;
  }

  if (!shipment.trackingId) {
    throw new Error("Shipment does not have a trackingId");
  }

  const traceUrl = buildTraceUrl(shipment.trackingId);
  return {
    shipmentId: shipment.shipmentId,
    trackingId: shipment.trackingId,
    traceUrl,
    png: await QRCode.toBuffer(traceUrl),
  };
}

export function generateTrackingId() {
  const token = randomBytes(4).toString("hex").toUpperCase();
  return `AGR-${token}`;
}

export async function ensureUniqueTrackingId() {
  const shipments = getCollection("shipments");
  let trackingId = generateTrackingId();
  while (await shipments.findOne({ trackingId })) {
    trackingId = generateTrackingId();
  }
  return trackingId;
}