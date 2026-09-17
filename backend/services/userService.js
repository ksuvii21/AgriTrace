import { getCollection } from "../core/mongo.js";
import { Role } from "../core/roles.js";

export async function createUserProfile(uid, email, role) {
  const users = getCollection("users");

  if (!uid || !email) {
    throw new Error("uid and email are required");
  }

  // 1. Try exact Firebase UID match.
  let existing = await users.findOne({ uid });

  if (existing) {
    if (role && role !== Role.FARMER && existing.role !== role) {
      await users.updateOne(
        { _id: existing._id },
        { $set: { role, updatedAt: new Date().toISOString() } }
      );
      return { ...existing, role, updatedAt: new Date().toISOString() };
    }
    return existing;
  }

  // 2. If the seed created a user with the same email but a fake UID,
  //    connect that Mongo profile to the real Firebase account.
  const byEmail = await users.findOne({ email });

  if (byEmail) {
    await users.updateOne(
      { _id: byEmail._id },
      { $set: { uid, updatedAt: new Date().toISOString() } }
    );
    return { ...byEmail, uid, updatedAt: new Date().toISOString() };
  }

  // 3. No Mongo profile exists yet — create a new one.
  const data = {
    uid,
    email,
    role,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await users.insertOne(data);
    return data;
  } catch (error) {
    if (error.code === 11000 || error.code === "MongoServerError") {
      const duplicateError = new Error("User profile already exists");
      duplicateError.code = "USER_ALREADY_REGISTERED";
      throw duplicateError;
    }
    throw error;
  }
}

export async function getUserProfile(uid) {
  return getCollection("users").findOne({ uid }) ?? null;
}

export async function updateUserProfile(uid, updates) {
  const users = getCollection("users");
  await users.updateOne(
    { uid },
    { $set: { ...updates, updatedAt: new Date().toISOString() } }
  );
  return getUserProfile(uid);
}
