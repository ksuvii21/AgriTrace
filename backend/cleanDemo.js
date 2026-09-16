import "dotenv/config";
import { MongoClient } from "mongodb";

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB = process.env.MONGO_DB || process.env.MONGO_DB_NAME || "AgriTrace";

if (!MONGO_URI) {
  console.error("Error: MONGO_URI is missing. Add it to your .env file.");
  process.exit(1);
}

const client = new MongoClient(MONGO_URI);

async function cleanDemoData() {
  await client.connect();
  const db = client.db(MONGO_DB);

  const collections = [
    "shipments",
    "devices",
    "users",
    "telemetry",
    "integrityCheckpoints",
    "timelineEvents",
    "listings",
    "routePlans",
  ];

  for (const name of collections) {
    const collection = db.collection(name);
    const count = await collection.countDocuments();
    if (count > 0) {
      await collection.deleteMany({});
      console.log(`Deleted ${count} documents from ${name}`);
    } else {
      console.log(`${name} is already empty`);
    }
  }

  console.log("\nDatabase cleaned successfully.");
  await client.close();
}

cleanDemoData().catch((err) => {
  console.error("Failed to clean database:", err);
  process.exit(1);
});
