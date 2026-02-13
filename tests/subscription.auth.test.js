const request = require("supertest");
const app = require("../src/app");

describe("Subscription Auth Guard", () => {
  test("GET /api/subscription/me should return 401 when Authorization header is missing", async () => {
    const res = await request(app).get("/api/subscription/me");

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("message", "Authorization token required!");
  });

  test("GET /api/subscription/me should return 401 when token is invalid", async () => {
    const res = await request(app)
        .get("/api/subscription/me")
        .set("Authorization", "Bearer ini-token-palsu");

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("message", "Invalid or expired token!");
  });
});
