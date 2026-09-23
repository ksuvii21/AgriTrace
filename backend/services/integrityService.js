import { createHash } from "crypto";

function canonicalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (value[key] !== undefined) result[key] = canonicalize(value[key]);
        return result;
      }, {});
  }
  return value;
}

function hashValue(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export function generateTelemetryHash(reading) {
  const {
    _id,
    dataHash,
    checkpointId,
    checkpointed,
    // Chaining bookkeeping must not be part of the payload hash, otherwise
    // setting previousHash after hashing would invalidate the hash.
    previousHash,
    previousSequenceNumber,
    chainHash,
    ...immutableReading
  } = reading || {};
  return hashValue(immutableReading);
}

// ==========================================================
// HASH CHAINING (tamper-evident, NOT a blockchain)
// ==========================================================
//
// Each reading stores `previousHash`: the dataHash of the immediately
// preceding reading for the same device (by sequenceNumber). This forms a
// singly-linked hash chain stored in a normal database collection. It is a
// tamper-evident integrity chain, not a distributed ledger and not a
// blockchain. The periodic shipment checkpoints remain the anchor point and
// are what actually get committed through the existing blockchain/checkpoint
// service.
//
// The genesis (first) reading of a device uses a fixed sentinel so the chain
// is deterministic and restart-safe.

export const GENESIS_PREVIOUS_HASH = "0".repeat(64);

export function resolvePreviousHash(previousReading) {
  if (!previousReading) return GENESIS_PREVIOUS_HASH;
  return typeof previousReading.dataHash === "string" && previousReading.dataHash
    ? previousReading.dataHash
    : GENESIS_PREVIOUS_HASH;
}

export function generateTelemetryHashChained(reading, previousReading = null) {
  const baseHash = generateTelemetryHash(reading);
  return hashValue({
    dataHash: baseHash,
    previousHash: resolvePreviousHash(previousReading),
  });
}

export function verifyTelemetryReading(reading) {
  if (!reading?.dataHash) return false;
  return generateTelemetryHash(reading) === reading.dataHash;
}

// Verifies a reading against an ordered window of readings:
// 1. dataHash still matches the immutable payload, and
// 2. sequence numbers are strictly increasing with no gaps, and
// 3. (when stored) previousHash chaining is consistent.
//
// Readings that predate chaining simply skip the chain check, keeping
// backward compatibility with existing telemetry.
export function verifySequenceContinuity(readings) {
  if (!Array.isArray(readings) || readings.length === 0) {
    return { valid: false, reason: "no_readings", brokenAtSequence: null };
  }

  for (let index = 0; index < readings.length; index += 1) {
    const current = readings[index];

    if (!verifyTelemetryReading(current)) {
      return {
        valid: false,
        reason: "data_hash_mismatch",
        brokenAtSequence: current?.sequenceNumber ?? null,
      };
    }

    if (index === 0) continue;

    const previous = readings[index - 1];
    const previousSequence = previous?.sequenceNumber;
    const currentSequence = current?.sequenceNumber;

    if (
      Number.isInteger(previousSequence) &&
      Number.isInteger(currentSequence) &&
      currentSequence <= previousSequence
    ) {
      return {
        valid: false,
        reason: "sequence_not_increasing",
        brokenAtSequence: currentSequence,
      };
    }

    // Chain check is only enforced when both sides carry chain metadata.
    if (
      typeof current?.previousHash === "string" &&
      typeof previous?.dataHash === "string" &&
      current.previousHash !== resolvePreviousHash(previous)
    ) {
      return {
        valid: false,
        reason: "previous_hash_mismatch",
        brokenAtSequence: currentSequence ?? null,
      };
    }
  }

  return { valid: true, reason: null, brokenAtSequence: null };
}

export function generateCheckpointHash(readings) {
  return hashValue(
    readings.map((reading) => ({
      id: reading._id?.toString?.() || reading._id || null,
      dataHash: reading.dataHash,
      timestamp: reading.timestamp,
    }))
  );
}

export function verifyChainWindow(readings) {
  return verifySequenceContinuity(readings);
}

export function verifyCheckpoint(checkpoint, readings) {
  if (!checkpoint?.checkpointHash || !Array.isArray(readings) || readings.length === 0) {
    return false;
  }

  return readings.every(verifyTelemetryReading) &&
    generateCheckpointHash(readings) === checkpoint.checkpointHash;
}