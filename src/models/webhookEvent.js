const mongoose = require("mongoose");

const webhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, default: "paypal" },
    eventId: { type: String, required: true, unique: true },
    eventType: { type: String, required: true, index: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("WebhookEvent", webhookEventSchema);
