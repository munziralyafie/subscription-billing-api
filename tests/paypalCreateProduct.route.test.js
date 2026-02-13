const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../src/app");

jest.mock("../src/services/paypalProduct", () => ({
  createPaypalProduct: jest.fn(),
}));

const { createPaypalProduct } = require("../src/services/paypalProduct");

function makeToken(role = "admin") {
  return jwt.sign(
    {
      _id: "507f1f77bcf86cd799439011",
      name: role === "admin" ? "Admin" : "User",
      role,
    },
    process.env.ACCESS_TOKEN_JWT_KEY
  );
}

describe("PayPal Create Product Route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("POST /api/paypal/product/init should return 401 without token", async () => {
    const res = await request(app).post("/api/paypal/product/init").send({});
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("message", "Authorization token required!");
  });

  test("POST /api/paypal/product/init should return 403 for non-admin", async () => {
    const userToken = makeToken("user");

    const res = await request(app)
      .post("/api/paypal/product/init")
      .set("Authorization", `Bearer ${userToken}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty("message", "Access denied: admin only!");
  });

  test("POST /api/paypal/product/init should return 201 on success", async () => {
    const adminToken = makeToken("admin");

    createPaypalProduct.mockResolvedValue({
      id: "PROD-TEST123",
      name: "Subscription Node",
      description: "Subscription plans for Subscription Node App",
    });

    const res = await request(app)
      .post("/api/paypal/product/init")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("productId", "PROD-TEST123");
    expect(res.body).toHaveProperty(
      "message",
      "PayPal product created. Copy productId into PAYPAL_PRODUCT_ID in your .env"
    );
  });

  test("POST /api/paypal/product/init should return 500 when service throws", async () => {
    const adminToken = makeToken("admin");
    createPaypalProduct.mockRejectedValue(new Error("PayPal create product failed"));

    const res = await request(app)
      .post("/api/paypal/product/init")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty("message", "PayPal create product failed");
  });
});
