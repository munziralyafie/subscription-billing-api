const express = require('express');
const router = express.Router();
const joi = require("joi");


const Subscription = require('../models/subscription');
const Plan = require("../models/plan");
const { auth } = require('../middleware/auth');
const { createPaypalSubscription } = require("../services/paypalSubscription");
const { subscriber } = require("../middleware/subscriber");


const subscriptionSchemaJoi = joi.object({
  planId: joi.string().required(), // Mongo ObjectId as string
}).required();

/**
 * =====================================================
 * CHECKOUT SUBSCRIPTION (USER)
 * =====================================================
 * Flow:
 * 1) Authenticate user
 * 2) Validate request body using Joi
 * 3) Load active plan from DB
 * 4) Free plan -> activate immediately in DB
 * 5) Paid plan -> create PayPal subscription first
 * 6) Save paid subscription state in DB
 * 7) Return checkout result
 */
router.post("/", auth, async (req, res) => {
    try {
        // 2. Validate input from request body
        const joiValidation = subscriptionSchemaJoi.validate(req.body ?? {}, {
            abortEarly: true,
            stripUnknown: true
        });
        if(joiValidation.error){
            return res.status(400).json({ message: joiValidation.error.details[0].message});
        };

        // 3. Ensure plan exists & active
        const { planId } = joiValidation.value;
        const plan = await Plan.findOne({ _id: planId, isActive: true });
        if (!plan){
            return res.status(404).json({ message: "Plan not found or inactive" })
        } 

        const isFree = Number(plan.price) === 0 || String(plan.name).toLowerCase() === "free";

        // 4. Free flow: update DB directly
        if (isFree) {
            const subscription = await Subscription.findOneAndUpdate(
                { userId: req.user._id },
                {
                $set: {
                    userId: req.user._id,
                    planId: plan._id,
                    status: "active",
                    paypalSubscriptionId: null,
                    periodStart: new Date(),
                    periodEnd: null,
                    cancelledAt: null
                }
                },
                { upsert: true, new: true, runValidators: true }
            ).populate("planId");

            return res.status(200).json({ message: "Free plan activated", status: "active", subscription });
        }

        // Paid plans must already be linked to a PayPal plan
        if (!plan.paypalPlanId) {
            return res.status(400).json({
                message: "This paid plan is not synced with PayPal (missing paypalPlanId)."
            });
        }
        // 5. Create PayPal subscription (avoid corrupting local state on failure)
        const { paypalSubscriptionId, approvalUrl } = await createPaypalSubscription({
            paypalPlanId: plan.paypalPlanId,
            customId: String(req.user._id), // helpful mapping
        });

        // 6. Save paid subscription state in DB
        const subscription = await Subscription.findOneAndUpdate(
            { userId: req.user._id },
            {
                $set: {
                    userId: req.user._id,
                    planId: plan._id,
                    status: "pending",
                    paypalSubscriptionId,
                    periodStart: null,
                    periodEnd: null,
                    cancelledAt: null
                }
            },
            { upsert: true, new: true, runValidators: true }
        ).populate("planId");

        // 7. return approvalUrl to client
        res.status(200).json({
            message: "PayPal subscription created. Please approve via approvalUrl.",
            status: "pending",
            approvalUrl,
            subscriptionId: subscription._id,
            paypalSubscriptionId,
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
});

router.get("/me", auth, async (req, res) => {
    try {
        const subscription = await Subscription.findOne({ userId: req.user._id })
        .populate("planId", "name price billingCycle isActive");

        if(!subscription){
            return res.status(404).json({ message: "You have been not subscribed to any plan. Please subscribe first" });
        }

        res.status(200).json({ subscription });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
});

/**
 * ========================================================================
 * GET SUBSCRIBER'S REPORT (DUMMY)
 * ========================================================================
 * Flow:
 * 1. Authenticate request using accessToken
 * 2. Check user subscription's status (must be active)
 * 3. If both pass return access for subscriber-only feature (dummy report)
 */
router.get("/report", auth, subscriber, async (req, res) => {
    try {
        // 3. Response with dummy report
        res.status(200).json({
        message: "Subscriber report generated successfully",
        userId: req.user._id,
        name: req.user.name,
        planId: req.subscription.planId._id,
        plan: req.subscription.planId.name,
        status: req.subscription.status,
        generatedAt: new Date(),
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
