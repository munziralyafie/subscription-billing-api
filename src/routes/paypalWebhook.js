const express = require("express");
const router = express.Router();

const Subscription = require("../models/subscription");
const WebhookEvent = require("../models/webhookEvent");

const { verifyPaypalWebhookSignature, getPaypalSubscriptionDetails } = require("../services/paypalWebhook");

/**
 * =====================================================
 * PAYPAL WEBHOOK (ENDPOINT LISTENER)
 * =====================================================
 * Receive PayPal webhook event.
 * Accurate flow:
 * 1) Verify webhook signature (security).
 * 2) Idempotency: ignore if event_id already processed.
 * 3) Resolve PayPal subscription ID:
 *    - PAYMENT.SALE.* -> resource.billing_agreement_id
 *    - BILLING.SUBSCRIPTION.* -> resource.id
 * 4) If no subscription ID is found, return 200 (ignored).
 * 5) Fetch subscription details from PayPal (authoritative).
 * 6) Update Mongo subscription: status + periodStart + periodEnd.
 * 7) Mark event as processed.
 * 8) Return 200 quickly.
 */
router.post("/paypal", async (req, res) => {
    try {
        // 1. Verify signature
        const verify = await verifyPaypalWebhookSignature({ headers: req.headers, body: req.body });
        if (!verify.ok) {
            return res.status(400).json({ message: "Invalid webhook signature", reason: verify.reason });
        }

        // 2. Idempotency check
        const eventId = req.body?.id;
        if (!eventId){
            return res.status(400).json({ message: "Missing event id" });
        }
        // skip if this webhook event was already processed
        const alreadyProcessed = await WebhookEvent.findOne({ eventId }).lean();
        if (alreadyProcessed) {
            return res.status(200).json({ message: "Event already processed", eventId });
        }

        // 3. Extract subscription id
        const eventType = req.body?.event_type;
        const paypalSubscriptionId =
            req.body?.resource?.billing_agreement_id || // priority for PAYMENT.SALE.*
            (eventType?.startsWith("BILLING.SUBSCRIPTION.")
                ? req.body?.resource?.id
                : null);

        // 4. If no subscription ID is found, return 200 (ignored)
        if (!paypalSubscriptionId) {
        return res.status(200).json({ message: "No subscription id in webhook (ignored)", eventType });
        }

        // 5. Fetch authoritative details from PayPal
        const details = await getPaypalSubscriptionDetails(paypalSubscriptionId);

        // Map PayPal status to our status (lowercase) in mongoDB
        const paypalStatus = String(details.status || "").toUpperCase();
        let newStatus = "pending";
        if (paypalStatus === "ACTIVE") newStatus = "active";
        else if (paypalStatus === "CANCELLED") newStatus = "cancelled";
        else if (paypalStatus === "EXPIRED") newStatus = "expired";
        else if (paypalStatus === "SUSPENDED") newStatus = "expired";

        // Only set period fields when subscription is truly active
        const periodStart = newStatus === "active" && details.start_time
        ? new Date(details.start_time)
        : null;
        // periodEnd (next billing time is most useful)
        const periodEnd = details.billing_info?.next_billing_time
        ? new Date(details.billing_info.next_billing_time)
        : null;

        // 6. Update subscription in Mongo
        const updated = await Subscription.findOneAndUpdate(
            { paypalSubscriptionId },
            {
                $set: {
                status: newStatus,
                periodStart,
                periodEnd,
                cancelledAt: newStatus === "cancelled" ? new Date() : null,
                },
            },
            { new: true }
        );

        // 7) Mark event as processed (idempotency)
        await WebhookEvent.create({
            provider: "paypal",
            eventId,
            eventType
        });

        // 8. If not found, still return 200 (webhook retries otherwise)
        res.status(200).json({
            message: "Webhook processed",
            eventType,
            paypalSubscriptionId,
            status: newStatus,
            foundSubscription: !!updated,
        });
    } catch (error) {
        console.error("PayPal webhook processing failed", {
            eventType: req.body?.event_type,
            eventId: req.body?.id,
            resourceId: req.body?.resource?.id,
            billingAgreementId: req.body?.resource?.billing_agreement_id,
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });

        console.error("paypal error data:", JSON.stringify(error.response?.data, null, 2));

        return res.status(500).json({ message: "Server error" });
    }
})
module.exports = router;
