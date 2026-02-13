const request = require("supertest");
const jwt = require("jsonwebtoken");

process.env.ACCESS_TOKEN_JWT_KEY = process.env.ACCESS_TOKEN_JWT_KEY || "test-access-secret";

const app = require("../src/app");

describe("Plan Admin Authorization", () => {
  test("GET /api/plan/all should return 403 when token role is user", async () => {
    const userToken = jwt.sign(
      { _id: "507f1f77bcf86cd799439011", name: "User Test", role: "user" },
      process.env.ACCESS_TOKEN_JWT_KEY
    );

    const res = await request(app)
      .get("/api/plan/all")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty("message", "Access denied: admin only!");
  });
});
