const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
        name: { type: String, required: true },          // Free / Premium / Platinum
        price: { type: Number, required: true },         // Monthly price
        billingCycle: { type: String, enum: ["monthly", "yearly"], required: true },
        paypalPlanId: { type: String },
        currency: { type: String, default: "EUR" },
        isActive: { type: Boolean, default: true }
    },
    { timestamps: true }
);

const Plan = mongoose.model("Plan", planSchema);

module.exports = Plan;