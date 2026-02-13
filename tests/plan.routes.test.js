const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Plan = require("../src/models/plan");

jest.mock("../src/services/paypalProduct", () => ({
  createPaypalPlan: jest.fn(),
}));

const { createPaypalPlan } = require("../src/services/paypalProduct");
const app = require("../src/app");

function makeToken(role = "admin") {
  return jwt.sign(
    {
      _id: new mongoose.Types.ObjectId().toString(),
      name: role === "admin" ? "Admin User" : "Normal User",
      role,
    },
    process.env.ACCESS_TOKEN_JWT_KEY
  );
}

describe("Plan Routes", () => {
  beforeAll(() => {
    process.env.PAYPAL_PRODUCT_ID = "PROD-TEST123";
    process.env.PAYPAL_CURRENCY = "EUR";
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await Plan.deleteMany({});
  });

  test("GET /api/plan should return active plans only", async () => {
    await Plan.create({
      name: "free",
      price: 0,
      billingCycle: "monthly",
      isActive: true,
    });

    await Plan.create({
      name: "old-plan",
      price: 10,
      billingCycle: "monthly",
      isActive: false,
    });

    const res = await request(app).get("/api/plan");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("plans");
    expect(res.body.plans).toHaveLength(1);
    expect(res.body.plans[0].name).toBe("free");
  });

  test("POST /api/plan should return 403 when role is not admin", async () => {
    const userToken = makeToken("user");

    const res = await request(app)
      .post("/api/plan")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        name: "starter",
        price: 0,
        billingCycle: "monthly",
      });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty("message", "Access denied: admin only!");
  });

  test("POST /api/plan should create free plan without PayPal sync", async () => {
    const adminToken = makeToken("admin");

    const res = await request(app)
      .post("/api/plan")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "free",
        price: 0,
        billingCycle: "monthly",
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("message", "Plan created successfully");
    expect(res.body.plan).toHaveProperty("name", "free");
    expect(res.body.plan).toHaveProperty("paypalPlanId", null);
    expect(createPaypalPlan).not.toHaveBeenCalled();
  });

  test("POST /api/plan should create paid plan and sync with PayPal", async () => {
    const adminToken = makeToken("admin");
    createPaypalPlan.mockResolvedValue({ id: "P-TEST123" });

    const res = await request(app)
      .post("/api/plan")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "premium",
        price: 19.99,
        billingCycle: "monthly",
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty(
      "message",
      "Plan created and synced with PayPal successfully"
    );
    expect(res.body.plan).toHaveProperty("paypalPlanId", "P-TEST123");
    expect(createPaypalPlan).toHaveBeenCalledTimes(1);
  });

  test("POST /api/plan should return 400 for duplicate name", async () => {
    const adminToken = makeToken("admin");

    await Plan.create({
      name: "duplicate-plan",
      price: 5,
      billingCycle: "monthly",
      isActive: true,
    });

    const res = await request(app)
      .post("/api/plan")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "duplicate-plan",
        price: 10,
        billingCycle: "monthly",
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message", "Plan already exists");
  });

  test("PATCH /api/plan/:planId should update existing plan", async () => {
    const adminToken = makeToken("admin");

    const plan = await Plan.create({
      name: "basic",
      price: 10,
      billingCycle: "monthly",
      isActive: true,
    });

    const res = await request(app)
      .patch(`/api/plan/${plan._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        price: 12,
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message", "Plan updated successfully");
    expect(res.body.plan).toHaveProperty("price", 12);
  });

  test("PATCH /api/plan/:planId should return 400 when updating to duplicate name", async () => {
    const adminToken = makeToken("admin");

    await Plan.create({
      name: "name-a",
      price: 10,
      billingCycle: "monthly",
      isActive: true,
    });

    const target = await Plan.create({
      name: "name-b",
      price: 20,
      billingCycle: "monthly",
      isActive: true,
    });

    const res = await request(app)
      .patch(`/api/plan/${target._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "name-a",
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message", "Plan already exists");
  });

  test("DELETE /api/plan/:planId should deactivate plan and be idempotent", async () => {
    const adminToken = makeToken("admin");

    const plan = await Plan.create({
      name: "to-delete",
      price: 7,
      billingCycle: "monthly",
      isActive: true,
    });

    const first = await request(app)
      .delete(`/api/plan/${plan._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(first.status).toBe(200);
    expect(first.body).toHaveProperty("message", "Plan deactivated successfully");

    const second = await request(app)
      .delete(`/api/plan/${plan._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(second.status).toBe(200);
    expect(second.body).toHaveProperty("message", "Plan already deactivated");
  });

  test("GET /api/plan/all should return all plans for admin", async () => {
    const adminToken = makeToken("admin");

    await Plan.create({
      name: "active-plan",
      price: 10,
      billingCycle: "monthly",
      isActive: true,
    });

    await Plan.create({
      name: "inactive-plan",
      price: 12,
      billingCycle: "yearly",
      isActive: false,
    });

    const res = await request(app)
      .get("/api/plan/all")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("plans");
    expect(res.body.plans).toHaveLength(2);
  });

  test("PATCH /api/plan/:planId should return 404 when plan is not found", async () => {
    const adminToken = makeToken("admin");
    const nonExistingId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .patch(`/api/plan/${nonExistingId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ price: 99 });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("message", "Plan not found");
  });

  test("DELETE /api/plan/:planId should return 404 when plan is not found", async () => {
    const adminToken = makeToken("admin");
    const nonExistingId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .delete(`/api/plan/${nonExistingId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("message", "Plan not found");
  });
});
