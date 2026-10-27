const mongoose = require("mongoose");
import { seedFloorsIfEmpty } from "../service/floor.service";

const connectDB = async (retries = 3, delay = 2000): Promise<void> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const conn = await mongoose.connect(process.env.MONGO_URI, {
        dbName: process.env.DATABASE_NAME,
      });

      console.log(`MongoDB Connected: ${conn.connection.host}`);

      // Safe index migration: drop legacy global flat unique index if present
      try {
        const flatCollection = conn.connection.collection("flats");
        const indexes = await flatCollection.indexes();
        const legacyIndex = indexes.find(
          (idx: any) => idx.name === "flatNumber_1_buildingName_1",
        );
        if (legacyIndex) {
          await flatCollection.dropIndex("flatNumber_1_buildingName_1");
          console.log(
            "🔄 Migrated legacy Flat index to multi-tenant organization index successfully",
          );
        }
      } catch {
        // Collection or index may not exist yet on fresh databases
      }

      // Auto-seed default floors (0 to 10) if floors collection is empty
      await seedFloorsIfEmpty();
      return;
    } catch (error: any) {
      console.error(
        `⚠️ MongoDB connection attempt ${attempt}/${retries} failed: ${error.message}`,
      );
      if (attempt < retries) {
        await new Promise((res) => setTimeout(res, delay));
      } else {
        console.error("❌ Failed to connect to MongoDB after multiple attempts.");
      }
    }
  }
};

export default connectDB;
