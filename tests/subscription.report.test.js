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

describe("Subscriber Report Endpoint", () => {
  test("GET /api/subscription/report should return 403 when user has no active subscription", async () => {
    const user = await User.create({
      name: "Report User No Active",
      email: "report-no-active@mail.com",
      password: "secret123",
      address: "Address X",
      role: "user",
      isVerified: true,
    });

    const plan = await Plan.create({
      name: "premium",
      price: 10,
      billingCycle: "monthly",
      isActive: true,
    });

    await Subscription.create({
      userId: user._id,
      planId: plan._id,
      status: "pending", // not active
      paypalSubscriptionId: "I-TESTPENDING",
    });

    const token = makeAccessToken(user);

    const res = await request(app)
      .get("/api/subscription/report")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty("message", "Active subscription required");
  });

  test("GET /api/subscription/report should return 200 when user has active subscription", async () => {
    const user = await User.create({
      name: "Report User Active",
      email: "report-active@mail.com",
      password: "secret123",
      address: "Address Y",
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
      .get("/api/subscription/report")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message", "Subscriber report generated successfully");
    expect(res.body).toHaveProperty("plan", "free");
    expect(res.body).toHaveProperty("status", "active");
  });
});
