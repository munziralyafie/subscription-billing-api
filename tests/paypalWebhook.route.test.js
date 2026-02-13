const request = require("supertest");
const mongoose = require("mongoose");

jest.mock("../src/services/paypalWebhook", () => ({
  verifyPaypalWebhookSignature: jest.fn(),
  getPaypalSubscriptionDetails: jest.fn(),
}));

const {
  verifyPaypalWebhookSignature,
  getPaypalSubscriptionDetails,
} = require("../src/services/paypalWebhook");

const app = require("../src/app");
const Subscription = require("../src/models/subscription");
const WebhookEvent = require("../src/models/webhookEvent");

describe("PayPal Webhook Route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("POST /webhooks/paypal should return 400 when signature is invalid", async () => {
    verifyPaypalWebhookSignature.mockResolvedValue({ ok: false, reason: "bad-signature" });

    const res = await request(app).post("/webhooks/paypal").send({
      id: "WH-INVALID-1",
      event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
      resource: { id: "I-INVALID" },
    });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message", "Invalid webhook signature");
  });

  test("POST /webhooks/paypal should process event and update subscription", async () => {
    await Subscription.create({
      userId: new mongoose.Types.ObjectId(),
      planId: new mongoose.Types.ObjectId(),
      status: "pending",
      paypalSubscriptionId: "I-TEST123",
      periodStart: null,
      periodEnd: null,
      cancelledAt: null,
    });

    verifyPaypalWebhookSignature.mockResolvedValue({ ok: true });
    getPaypalSubscriptionDetails.mockResolvedValue({
      status: "ACTIVE",
      start_time: "2026-02-11T10:00:00Z",
      billing_info: { next_billing_time: "2026-03-11T10:00:00Z" },
    });

    const res = await request(app).post("/webhooks/paypal").send({
      id: "WH-OK-1",
      event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
      resource: { id: "I-TEST123" },
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message", "Webhook processed");
    expect(res.body).toHaveProperty("status", "active");

    const updated = await Subscription.findOne({ paypalSubscriptionId: "I-TEST123" }).lean();
    expect(updated.status).toBe("active");
    expect(updated.periodStart).toBeTruthy();

    const savedEvent = await WebhookEvent.findOne({ eventId: "WH-OK-1" }).lean();
    expect(savedEvent).toBeTruthy();
    expect(savedEvent.eventType).toBe("BILLING.SUBSCRIPTION.ACTIVATED");
  });

  test("POST /webhooks/paypal should return 200 when event already processed", async () => {
    await WebhookEvent.create({
      provider: "paypal",
      eventId: "WH-DUP-1",
      eventType: "BILLING.SUBSCRIPTION.ACTIVATED",
    });

    verifyPaypalWebhookSignature.mockResolvedValue({ ok: true });

    const res = await request(app).post("/webhooks/paypal").send({
      id: "WH-DUP-1",
      event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
      resource: { id: "I-TEST123" },
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message", "Event already processed");
  });

  test("POST /webhooks/paypal should return 400 when event id is missing", async () => {
    verifyPaypalWebhookSignature.mockResolvedValue({ ok: true });

    const res = await request(app).post("/webhooks/paypal").send({
      event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
      resource: { id: "I-NO-EVENT-ID" },
    });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message", "Missing event id");
  });

  test("POST /webhooks/paypal should return 200 when no subscription id can be resolved", async () => {
    verifyPaypalWebhookSignature.mockResolvedValue({ ok: true });

    const res = await request(app).post("/webhooks/paypal").send({
      id: "WH-NO-SUB-ID-1",
      event_type: "CUSTOM.EVENT.TYPE", // bukan BILLING.SUBSCRIPTION.*
      resource: { something: "else" }, // tidak ada billing_agreement_id / id yg relevan
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message", "No subscription id in webhook (ignored)");
  });

  test("POST /webhooks/paypal should map CANCELLED to cancelled", async () => {
    await Subscription.create({
      userId: new mongoose.Types.ObjectId(),
      planId: new mongoose.Types.ObjectId(),
      status: "pending",
      paypalSubscriptionId: "I-CANCELLED-1",
    });

    verifyPaypalWebhookSignature.mockResolvedValue({ ok: true });
    getPaypalSubscriptionDetails.mockResolvedValue({
      status: "CANCELLED",
      start_time: "2026-02-11T10:00:00Z",
      billing_info: {},
    });

    const res = await request(app).post("/webhooks/paypal").send({
      id: "WH-CANCELLED-1",
      event_type: "BILLING.SUBSCRIPTION.CANCELLED",
      resource: { id: "I-CANCELLED-1" },
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "cancelled");
  });

  test("POST /webhooks/paypal should return 500 when fetching PayPal details fails", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      verifyPaypalWebhookSignature.mockResolvedValue({ ok: true });
      getPaypalSubscriptionDetails.mockRejectedValue(new Error("PayPal details failed"));

      const res = await request(app).post("/webhooks/paypal").send({
        id: "WH-ERR-1",
        event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
        resource: { id: "I-ERR-1" },
      });

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty("message", "Server error");
    } finally {
      errSpy.mockRestore();
    }
  });
});
