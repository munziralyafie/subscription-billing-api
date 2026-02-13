const request = require("supertest");
const jwt = require("jsonwebtoken");

jest.mock("../src/services/paypalSubscription", () => ({
  createPaypalSubscription: jest.fn(),
}));

const { createPaypalSubscription } = require("../src/services/paypalSubscription");

const app = require("../src/app");
const User = require("../src/models/user");
const Plan = require("../src/models/plan");

function makeAccessToken(user) {
  return jwt.sign(
    { _id: String(user._id), name: user.name, role: user.role },
    process.env.ACCESS_TOKEN_JWT_KEY
  );
}

describe("Subscription Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  test("POST /api/subscription should activate free plan immediately", async () => {
    const user = await User.create({
      name: "Sub User",
      email: "subuser@mail.com",
      password: "secret123",
      address: "Address 123",
      role: "user",
      isVerified: true,
    });

    const freePlan = await Plan.create({
      name: "free",
      price: 0,
      billingCycle: "monthly",
      isActive: true,
    });

    const token = makeAccessToken(user);

    const res = await request(app)
      .post("/api/subscription")
      .set("Authorization", `Bearer ${token}`)
      .send({ planId: String(freePlan._id) });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "active");
    expect(res.body.subscription).toHaveProperty("status", "active");
    expect(res.body.subscription.periodStart).toBeTruthy();
    expect(res.body.subscription.periodEnd).toBeNull();
    expect(res.body.subscription.paypalSubscriptionId).toBeNull();
  });

  test("POST /api/subscription should return 400 for paid plan without paypalPlanId", async () => {
    const user = await User.create({
      name: "Paid User",
      email: "paiduser@mail.com",
      password: "secret123",
      address: "Address 456",
      role: "user",
      isVerified: true,
    });

    const paidPlanNoPaypal = await Plan.create({
      name: "premium",
      price: 10,
      billingCycle: "monthly",
      isActive: true,
      // paypalPlanId intentionally missing
    });

    const token = makeAccessToken(user);

    const res = await request(app)
      .post("/api/subscription")
      .set("Authorization", `Bearer ${token}`)
      .send({ planId: String(paidPlanNoPaypal._id) });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty(
      "message",
      "This paid plan is not synced with PayPal (missing paypalPlanId)."
    );
  });

  test("POST /api/subscription should return 400 when body is invalid", async () => {
    const user = await User.create({
      name: "Invalid Body User",
      email: "invalidbody@mail.com",
      password: "secret123",
      address: "Address 111",
      role: "user",
      isVerified: true,
    });

    const token = makeAccessToken(user);

    const res = await request(app)
      .post("/api/subscription")
      .set("Authorization", `Bearer ${token}`)
      .send({}); // planId missing

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message");
  });

  test("POST /api/subscription should return 404 when plan is not found", async () => {
    const user = await User.create({
      name: "Plan Missing User",
      email: "planmissing@mail.com",
      password: "secret123",
      address: "Address 222",
      role: "user",
      isVerified: true,
    });

    const token = makeAccessToken(user);

    const res = await request(app)
      .post("/api/subscription")
      .set("Authorization", `Bearer ${token}`)
      .send({ planId: "507f1f77bcf86cd799439011" }); // valid format, not in DB

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("message", "Plan not found or inactive");
  });

  test("POST /api/subscription should create pending subscription for paid plan when PayPal call succeeds", async () => {
    const user = await User.create({
      name: "Paid Success User",
      email: "paidsuccess@mail.com",
      password: "secret123",
      address: "Address 333",
      role: "user",
      isVerified: true,
    });

    const paidPlan = await Plan.create({
      name: "pro",
      price: 25,
      billingCycle: "monthly",
      isActive: true,
      paypalPlanId: "P-PAID123",
    });

    createPaypalSubscription.mockResolvedValue({
      paypalSubscriptionId: "I-SUB123",
      approvalUrl: "https://paypal.test/approve",
    });

    const token = makeAccessToken(user);

    const res = await request(app)
      .post("/api/subscription")
      .set("Authorization", `Bearer ${token}`)
      .send({ planId: String(paidPlan._id) });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "pending");
    expect(res.body).toHaveProperty("paypalSubscriptionId", "I-SUB123");
    expect(res.body).toHaveProperty("approvalUrl", "https://paypal.test/approve");
  });

  test("POST /api/subscription should return 500 when PayPal subscription creation fails", async () => {
    const user = await User.create({
      name: "Paid Error User",
      email: "paiderror@mail.com",
      password: "secret123",
      address: "Address 444",
      role: "user",
      isVerified: true,
    });

    const paidPlan = await Plan.create({
      name: "enterprise",
      price: 50,
      billingCycle: "monthly",
      isActive: true,
      paypalPlanId: "P-PAID500",
    });

    createPaypalSubscription.mockRejectedValue(new Error("PayPal API failed"));

    const token = makeAccessToken(user);

    const res = await request(app)
      .post("/api/subscription")
      .set("Authorization", `Bearer ${token}`)
      .send({ planId: String(paidPlan._id) });

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty("message", "Server error");
  });

});
