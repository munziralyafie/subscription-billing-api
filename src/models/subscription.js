const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan", required: true },
    status: { type: String, enum: ["pending", "active", "cancelled", "expired"], default: "pending", index: true },
    paypalSubscriptionId: { type: String, index: true },  // PayPal identifiers (filled after PayPal integration)
    periodStart: { type: Date },
    periodEnd: { type: Date },
    cancelledAt: { type: Date },
  },
  { timestamps: true }
);
subscriptionSchema.index({ userId: 1 }, { unique: true });

module.exports = mongoose.model("Subscription", subscriptionSchema);
