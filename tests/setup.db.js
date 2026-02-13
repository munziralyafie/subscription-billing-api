const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongo;

beforeAll(async () => {
  process.env.ACCESS_TOKEN_JWT_KEY = process.env.ACCESS_TOKEN_JWT_KEY || "test-access-secret";
  process.env.REFRESH_TOKEN_JWT_KEY = process.env.REFRESH_TOKEN_JWT_KEY || "test-refresh-secret";

  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
