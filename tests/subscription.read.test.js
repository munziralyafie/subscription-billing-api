const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../src/app");
const User = require("../src/models/user");
const Plan = require("../src/models/plan");
const Subscription = require("../src/models/subscription");

function makeAccessToken(user) {
  return jwt.sign(
    { _id: String(user._id), name: user.name, role: user.role },
    process.env.ACCESS_TOKEN_JWT_KEY
  );
}

describe("Subscription Read Endpoints", () => {
  test("GET /api/subscription/me should return 404 when user has no subscription", async () => {
    const user = await User.create({
      name: "No Sub User",
      email: "nosub@mail.com",
      password: "secret123",
      address: "Address A",
      role: "user",
      isVerified: true,
    });

    const token = makeAccessToken(user);

    const res = await request(app)
      .get("/api/subscription/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("message", "You have been not subscribed to any plan. Please subscribe first");
  });

  test("GET /api/subscription/me should return subscription when exists", async () => {
    const user = await User.create({
      name: "Has Sub User",
      email: "hassub@mail.com",
      password: "secret123",
      address: "Address B",
      role: "user",
      isVerified: true,
    });

    const plan = await Plan.create({
      name: "free",
      price: 0,
      billingCycle: "monthly",
      isActive: true,
    });

    await Subscription.create({
      userId: user._id,
      planId: plan._id,
      status: "active",
      paypalSubscriptionId: null,
      periodStart: new Date(),
      periodEnd: null,
      cancelledAt: null,
    });

    const token = makeAccessToken(user);

    const res = await request(app)
      .get("/api/subscription/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("subscription");
    expect(res.body.subscription).toHaveProperty("status", "active");
    expect(res.body.subscription).toHaveProperty("planId");
  });
});
