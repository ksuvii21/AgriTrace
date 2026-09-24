import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";
import dotenv from "dotenv";

dotenv.config();

const requiredEnv = (name) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required Firebase environment variable: ${name}`);
  }
  return value;
};

const serviceAccount = {
  type: process.env.FIREBASE_TYPE || "service_account",
  project_id: requiredEnv("FIREBASE_PROJECT_ID"),
  private_key_id: requiredEnv("FIREBASE_PRIVATE_KEY_ID"),
  private_key: requiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  client_email: requiredEnv("FIREBASE_CLIENT_EMAIL"),
  client_id: process.env.FIREBASE_CLIENT_ID || undefined,
  auth_uri: process.env.FIREBASE_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
  token_uri: process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || undefined,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL || undefined,
  universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN || "googleapis.com",
};

initializeApp({
  credential: cert(serviceAccount),
});

export const auth = getAuth();

// Firebase Cloud Messaging is only initialized when Firebase Admin is
// available. getMessaging() throws if the app has no usable credentials, so
// it is wrapped to keep auth-only deployments working.
let messagingInstance = null;
try {
  messagingInstance = getMessaging();
} catch (error) {
  console.warn(
    `[Firebase] Cloud Messaging unavailable: ${error.message}`
  );
}

export const messaging = messagingInstance;

export async function verifyToken(idToken) {
  return await auth.verifyIdToken(idToken);
}
