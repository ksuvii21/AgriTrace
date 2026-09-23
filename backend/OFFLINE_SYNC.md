# AgriTrace — Offline-First microSD Telemetry Queue & ACK-Based Sync

This document describes the offline-first telemetry feature set added on top of
the existing working architecture. The MQTT, telemetry, GPS, shipment
assignment, alerts, WebSocket, hashing and checkpoint functionality are all
preserved; everything below is additive and backward compatible.

Final flow:

```
ESP32 sensors
  -> create reading (sequenceNumber, sensor values, GPS, capturedAt)
  -> microSD safety queue (write while offline)
  -> MQTT when available  (live OR backlog replay)
  -> backend validation
  -> shipment association (backend-authoritative)
  -> MongoDB insert with dedup on (deviceId + sequenceNumber)
  -> integrity processing (SHA-256 dataHash + previousHash chain)
  -> MQTT ACK  (accepted | duplicate)
  -> ESP32 safely clears the acknowledged microSD record
```

---

## 1. Files changed / created

### Backend — changed

| File | Change |
| --- | --- |
| `backend/models/telemetry.js` | Added `normalizeTransmission`, `validateTransmission`, `TRANSMISSION_SOURCES`/`SYNC_STATUSES`. `normalizeTelemetry` now emits `transmission.{source,storedOffline,syncStatus,queuedAt,capturedAt,syncedAt,offlineDurationMs}` plus top-level `capturedAt`. `validateReading` now also validates optional transmission metadata. Legacy payloads still default to `LIVE`. |
| `backend/core/mqttConsumer.js` | Added `previousHash`/`previousSequenceNumber` chaining, `parsePayloadDate` helper, transmission metadata enrichment (`SYNCED`, `syncedAt`), device/sync-health fields on the device doc, sync-health refresh on duplicate SD replays, and explicit ACK/delete semantics comments. |
| `backend/services/integrityService.js` | Added `GENESIS_PREVIOUS_HASH`, `resolvePreviousHash`, `generateTelemetryHashChained`, `verifySequenceContinuity`, `verifyChainWindow`. `generateTelemetryHash` now excludes chaining bookkeeping fields (`previousHash`, `previousSequenceNumber`, `chainHash`) so linking cannot invalidate a payload hash. |
| `backend/services/deviceService.js` | Device health response now includes a `sync` block (last sequence, last sync time/source, pending offline records, connectivity, MQTT status, SD status, firmware, count of SD-synced readings). |
| `backend/core/mongo.js` | Added indexes: `{deviceId, "transmission.source"}`, `{"transmission.storedOffline"}`, `{deviceId, sequenceNumber: -1}`, and `devices.lastSuccessfulSyncAt`. The existing unique `{deviceId, sequenceNumber}` index is unchanged and remains the dedup key. |

### Backend — created

| File | Purpose |
| --- | --- |
| `backend/tests/offline-sync.test.js` | 19 tests covering transmission detection, metadata, backward compatibility, hash chaining, continuity verification, and tamper detection. |

### Frontend — changed

| File | Change |
| --- | --- |
| `frontend/src/pages/Monitoring.jsx` | Telemetry history table gained a **Source** column that badges `LIVE` (green) vs `SD_SYNC` (amber, with an offline-duration tooltip). Non-breaking: rows without `transmission` render `LIVE`. |

### Firmware

No `.ino`/`.cpp` sources exist in this repository, so **no firmware files were
changed here**. The firmware requirements are specified in section 3 so they can
be implemented on the device side against the unchanged MQTT contract.

---

## 2. Backend changes (what actually happens)

1. **Transmission detection** — `normalizeTelemetry` classifies each reading as
   `LIVE` or `SD_SYNC` from `transmission.source`, `transmissionSource`,
   `source`, or the legacy `storedOffline`/`sdSync`/`offlineBacklog` flags.
   Missing metadata ⇒ `LIVE` (backward compatible).
2. **Timestamp preservation** — the original capture time (`capturedAt` /
   `gpsTimestamp` / `rtcTimestamp`) is resolved by the existing
   GPS → RTC → server priority and stored in `timestamp` and `deviceTimestamp`.
   Synchronization never rewrites it.
3. **Shipment association** — still backend-authoritative via
   `device.currentShipmentId`; a firmware-supplied `shipmentId` is only a
   warning source. Unchanged.
4. **Dedup** — the compound unique index `{deviceId, sequenceNumber}` is the
   single source of truth. `insertOne` on a replay throws E11000.
5. **Integrity** — `dataHash` = SHA-256 over the immutable reading;
   `previousHash` links to the previous reading for the same device by
   `sequenceNumber` (genesis = 64 `0`s). This is a **tamper-evident DB hash
   chain, not a blockchain**. The periodic shipment checkpoints remain the real
   anchor committed through `blockchainService.storeCheckpointHash`.
6. **ACK** — sent only after validation, device verification, storage and state
   update. Duplicates are ACKed `{accepted: true, duplicate: true}`.
7. **Device/sync health** — the device document accumulates
   `lastTelemetrySequence`, `lastSyncedSequence`, `lastSuccessfulSyncAt`,
   `lastSyncSource`, `pendingOfflineRecords`, `connectivityState`, `mqttStatus`,
   `sdCardStatus`, `firmwareVersion`.

---

## 3. Firmware changes required

The firmware must keep the existing telemetry topic
`agr/devices/<deviceId>/telemetry` and subscribe to
`agr/devices/<deviceId>/ack`. Required additions:

1. **microSD queue** — on every sensor cycle, write a record to microSD with:
   `deviceId, sequenceNumber, temperature, humidity, gasLevel, battery, GPS
   fields, capturedAt (GPS/RTC time), queuedAt`. Persist the next
   `sequenceNumber` so counters survive restart.
2. **Live vs backlog** — publish live readings with
   `transmission.source = "LIVE"`; publish backlog replay with
   `transmission.source = "SD_SYNC"`, `transmission.storedOffline = true`,
   and the original `capturedAt`/`queuedAt`.
3. **Reconnect backlog flush** — on MQTT reconnect, upload pending SD records
   **in ascending sequence order**, one at a time (or a small window), waiting
   for the ACK before advancing.
4. **ACK handling / safe deletion** — only delete a microSD record after
   receiving an ACK whose `deviceId` **and** `sequenceNumber` match:
   - `{accepted: true, duplicate: false}` → delete.
   - `{accepted: true, duplicate: true}`  → delete (backend already stored it).
   - `{accepted: false, ...}` → keep the record, log the reason, retry later.
   - No ACK within a timeout → keep the record, retry on next reconnect.
5. **Restart safety** — because deletion is ACK-gated and the queue is durable,
   a power loss simply resumes replaying un-ACKed records. Dedup on the
   backend makes re-sending already-stored records harmless.
6. **Hold the record until the ACK callback fires** (MQTT QoS 1 for
   `at-least-once` delivery); treat the ACK, not the publish, as the commit.
7. **Optional health fields** inside `connectivity`:
   `state`, `mqttStatus`, `sdCardStatus`/`sdStatus`, `pendingOfflineRecords`.

---

## 4. Example payloads

### 4.1 Live telemetry payload (firmware → `agr/devices/DEV001/telemetry`)

```json
{
  "deviceId": "DEV001",
  "sequenceNumber": 108,
  "temperature": 27.4,
  "humidity": 61.2,
  "gasLevel": 12,
  "battery": 84,
  "latitude": 25.3176,
  "longitude": 82.9739,
  "gpsValid": true,
  "satelliteCount": 9,
  "hdop": 0.8,
  "accuracy": 4.5,
  "capturedAt": "2026-01-15T11:59:58.000Z",
  "gpsTimestamp": "2026-01-15T11:59:58.000Z",
  "firmware": "1.4.0",
  "transmission": { "source": "LIVE" },
  "connectivity": {
    "state": "WIFI",
    "mqttStatus": "CONNECTED",
    "sdCardStatus": "OK",
    "pendingOfflineRecords": 0
  }
}
```

### 4.2 SD-synchronized payload (firmware → same topic, backlog replay)

```json
{
  "deviceId": "DEV001",
  "sequenceNumber": 104,
  "temperature": 25.1,
  "humidity": 58.7,
  "gasLevel": 11,
  "battery": 82,
  "latitude": 25.3169,
  "longitude": 82.9731,
  "gpsValid": true,
  "capturedAt": "2026-01-15T11:30:00.000Z",
  "gpsTimestamp": "2026-01-15T11:30:00.000Z",
  "firmware": "1.4.0",
  "transmission": {
    "source": "SD_SYNC",
    "storedOffline": true,
    "queuedAt": "2026-01-15T11:30:01.000Z"
  },
  "connectivity": {
    "state": "WIFI",
    "mqttStatus": "CONNECTED",
    "sdCardStatus": "OK",
    "pendingOfflineRecords": 3
  }
}
```

### 4.3 ACK (backend → `agr/devices/DEV001/ack`)

```json
{ "deviceId": "DEV001", "sequenceNumber": 104, "accepted": true, "duplicate": false, "acknowledgedAt": "2026-01-15T12:00:05.000Z" }
```

```json
{ "deviceId": "DEV001", "sequenceNumber": 104, "accepted": true, "duplicate": true, "acknowledgedAt": "2026-01-15T12:00:05.000Z" }
```

---

## 5. Final MongoDB document (telemetry collection)

```json
{
  "_id": "ObjectId('6a5f...')",
  "deviceId": "DEV001",
  "sequenceNumber": 104,
  "shipmentId": "c9d67426-21e0-4e71-a9b1-72f7808cc6f9",

  "temperature": 25.1,
  "humidity": 58.7,
  "gasLevel": 11,
  "battery": 82,

  "latitude": 25.3169,
  "longitude": 82.9731,
  "gpsValid": true,
  "satelliteCount": null,
  "hdop": null,
  "accuracy": null,
  "location": {
    "displayName": "Varanasi, Uttar Pradesh, India",
    "city": "Varanasi",
    "locality": "Varanasi",
    "state": "Uttar Pradesh",
    "country": "India",
    "countryCode": "IN",
    "source": "geocoding"
  },

  "timestamp": "2026-01-15T11:30:00.000Z",
  "deviceTimestamp": "2026-01-15T11:30:00.000Z",
  "timeSource": "GPS",
  "clockValid": true,
  "clockFallbackReason": null,

  "capturedAt": "2026-01-15T11:30:00.000Z",
  "receivedAt": "2026-01-15T12:00:05.000Z",
  "ingestionSource": "MQTT",

  "transmission": {
    "source": "SD_SYNC",
    "storedOffline": true,
    "syncStatus": "SYNCED",
    "queuedAt": "2026-01-15T11:30:01.000Z",
    "capturedAt": "2026-01-15T11:30:00.000Z",
    "syncedAt": "2026-01-15T12:00:05.000Z",
    "offlineDurationMs": 1805000
  },

  "dataHash": "9f2c…64-hex…",
  "previousHash": "1a7b…64-hex…",
  "previousSequenceNumber": 103,

  "checkpointId": null,
  "checkpointed": false,

  "firmware": "1.4.0",
  "sensorHealth": null,
  "connectivity": {
    "state": "WIFI",
    "mqttStatus": "CONNECTED",
    "sdCardStatus": "OK",
    "pendingOfflineRecords": 3
  },

  "deviceOffline": false,
  "tamperDetected": false
}
```

Notes:
- `_id` and the timestamp/`receivedAt` values are stored as BSON `Date` for
  `timestamp` and `receivedAt`; the ISO strings above are the JSON view.
- A **live** reading is identical except
  `transmission.source = "LIVE"`, `storedOffline = false`,
  `syncStatus = "LIVE"`, `syncedAt = null`, `offlineDurationMs = null`.

---

## 6. ACK / retry behavior explained

1. Firmware captures a reading and **always** writes it to microSD first.
2. It tries to publish over MQTT:
   - online → `transmission.source = "LIVE"`.
   - offline/backlog replay → `transmission.source = "SD_SYNC"`.
3. Backend receives the message and, in order: validates → verifies the device
   → resolves the backend shipment → inserts into MongoDB with a unique
   `{deviceId, sequenceNumber}` index → computes `dataHash` + `previousHash` →
   updates device/sync health.
4. Backend publishes an ACK:
   - **fresh insert** → `{accepted: true, duplicate: false}`.
   - **duplicate insert (E11000)** → `{accepted: true, duplicate: true}` —
     safe to delete because the backend already has that reading.
   - **validation/device failure** → `{accepted: false, reason}` — firmware
     must NOT delete; it should retry (or, for permanent errors, park the
     record).
5. Firmware deletes the microSD record **only** on
   `accepted === true` with a matching `deviceId + sequenceNumber`.
6. No ACK ⇒ record stays. On the next reconnect the backlog is replayed in
   sequence order. Duplicates are absorbed by the unique index and re-ACKed.
7. Power loss / restart is inherently safe: un-ACKed records remain on SD and
   are replayed; already-stored records are deduped.

Retry cadence is firmware-owned: replay on reconnect, optional periodic retry
with backoff, and a bounded in-flight window so ACK loss doesn't stall the queue.

---

## 7. Exact test procedure (offline → backlog → sync → dedup → integrity)

Prerequisites: backend running with MongoDB + MQTT broker, a device registered
and assigned to a shipment (`POST /api/devices/:deviceId/assign`).

### A. Turn Wi-Fi off and collect readings
1. Power the ESP32 and confirm it is online (a live reading appears in
   Monitoring with a green **LIVE** badge).
2. Disable the ESP32's Wi-Fi (or power off the AP / unplug the router).
   - Backend stops receiving telemetry for the device.
   - After the outage window, the device-monitor marks it `OFFLINE` and raises a
     `DEVICE_OFFLINE` alert (existing behavior).
3. Let the device capture 3–5 readings. They are written to microSD with
   increasing `sequenceNumber` and original `capturedAt` values.

### B. Restore Wi-Fi and synchronize the backlog
4. Re-enable Wi-Fi. The firmware reconnects to MQTT and replays the SD backlog
   **in ascending sequence order** with `transmission.source = "SD_SYNC"`.
5. Watch the backend logs for lines like:
   `[MQTT] Telemetry stored: DEV001 #104 -> shipment <id> (SD_SYNC)`
   `[MQTT] ACK sent DEV001 #104`
6. In the frontend, the replayed rows appear in Telemetry History with the
   amber **SD_SYNC** badge and their **original capture times** (not the sync
   time). The live row keeps the green **LIVE** badge.
7. Check device health (`GET /api/devices/DEV001/health`): `sync.lastSuccessfulSyncAt`,
   `sync.lastSyncedSequence` and `sync.sdSyncedReadings` should be populated,
   and `sync.pendingOfflineRecords` should drop toward 0.

### C. Prevent duplicates
8. Force a replay: reboot the ESP32 before it clears a record, or re-publish an
   already-stored SD payload manually. Expect:
   `[MQTT] Duplicate telemetry ignored: DEV001 #104`
   and an ACK `{accepted: true, duplicate: true}`.
9. Confirm MongoDB still has exactly one document per `(deviceId,
   sequenceNumber)`:
   ```js
   db.telemetry.aggregate([
     { $match: { deviceId: "DEV001" } },
     { $group: { _id: { s: "$sequenceNumber" }, n: { $sum: 1 } } },
     { $match: { n: { $gt: 1 } } }
   ])
   ```
   → should return no rows.

### D. Verify integrity
10. Create a checkpoint (`POST /api/shipments/:shipmentId/integrity/checkpoint`
    with a role that can access the shipment). Mixed LIVE + SD_SYNC readings
    are included because both share the same integrity path.
11. Verify (`GET /api/shipments/:shipmentId/integrity/verify`) → `verified: true`
    and every checkpoint `verified && blockchainVerified`.
12. Tamper a reading directly in MongoDB (change `temperature` without
    recomputing `dataHash`) and verify again → `verifyShipmentCheckpoints`
    returns `verified: false`, and `verifySequenceContinuity` reports
    `reason: "data_hash_mismatch"` for that sequence. Restore the value
    afterwards.

### E. Backend unit tests
```
cd backend
node --test models/*.test.js services/*.test.js tests/*.test.js
```
Expect **124 pass / 0 fail** (105 pre-existing + 19 new offline-sync tests).

---

## 8. What was intentionally NOT changed
- MQTT topic contract, QoS and reconnect logic.
- Backend-authoritative shipment association.
- Alert evaluation and WebSocket broadcasts (SD_SYNC readings flow through the
  same `telemetry.updated` event).
- SHA-256 hashing and the checkpoint/blockchain anchor path — extended, not
  replaced. The hash chain is described as tamper-evident, never as a
  blockchain.
