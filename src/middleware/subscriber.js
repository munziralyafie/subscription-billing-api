const Subscription = require("../models/subscription");

/**
 * ===============================================================
 * MIDDLEWARE: ALLOW ACCESS ONLY TO USERS WITH ACTIVE SUBSCRIPTION
 * ===============================================================
 * Flow:
 * 1. Find user's subscription with status "active"
 * 2. If no active subscription → block request (403)
 * 3. Attach subscription to req.subscription and continue
 * 4. Allow request to continue
 */
const subscriber = async (req, res, next) => {
    try {
      // 1. Find active subscription for logged-in user
      const subscription = await Subscription.findOne({ userId: req.user._id, status: "active" })
      .populate("planId", "name");

      // 2. If user has no active subscription → deny access
      if (!subscription) {
          return res.status(403).json({ message: "Active subscription required" });
      }

      // 3. Attach subscription to request for later use in routes
      req.subscription = subscription;

      // 4. Continue to next middleware/route
      next();
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { subscriber };
