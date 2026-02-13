const express = require('express');
const router = express.Router();
const joi = require("joi");

const { auth, checkRole } = require('../middleware/auth');
const { createPaypalPlan } = require('../services/paypalProduct');
const Plan = require('../models/plan');

// Create Plan Schema for backend data validation
const planSchemaJoi = joi.object({
  name: joi.string().required(),
  price: joi.number().min(0).required(),
  billingCycle: joi.string().valid("monthly", "yearly").required(),
  isActive: joi.boolean().optional()
}).required();

/**
 * =====================================================
 * CREATE PLAN API (ADMIN ONLY)
 * =====================================================
 * Flow:
 * 1. Authenticate request using accessToken
 * 2. Check user role (must be admin)
 * 3. Validate request body using Joi
 * 4. Check if plan with same name already exists
 * 5. Create payPal plan ID
 * 6. Create and save new plan in database
 * 7. Return created plan in response
 */
router.post("/", auth, checkRole("admin"), async (req, res) => {
    try {
        // 3. Validate input from request body
        const joiValidation = planSchemaJoi.validate(req.body ?? {}, {
            abortEarly: true,
            stripUnknown: true
        });
        if(joiValidation.error){
            return res.status(400).json({ message: joiValidation.error.details[0].message});
        };

        // 4. Check duplicate plan name
        const { name, price, billingCycle, isActive } = joiValidation.value; // object hasil validate adalah 2 property: value dan error.
        const existingPlan = await Plan.findOne({ name });
        if(existingPlan){
            return res.status(400).json({ message: "Plan already exists" });
        };

        let paypalPlanId = null;

        // 5. Create PayPal Plan if price more than 0
        if (price > 0){
          const paypalPlan = await createPaypalPlan({
            productId: process.env.PAYPAL_PRODUCT_ID,
            name,
            price,
            currency: process.env.PAYPAL_CURRENCY || "EUR",
            billingCycle,
          });
          paypalPlanId = paypalPlan.id;
        }
        
        // 6. Save plan in MongoDB with paypalPlanId
        const plan = await Plan.create({
          name,
          price,
          billingCycle,
          isActive,
          paypalPlanId
        });

        // 7. Return response
        if (paypalPlanId !== null){
          res.status(201).json({ message: "Plan created and synced with PayPal successfully", plan });
        } else {
          res.status(201).json({ message: "Plan created successfully", plan });
        }
        
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Server error" });
    }
});

/**
 * =====================================================
 * GET ACTIVE PLANS (PUBLIC)
 * =====================================================
 * Flow:
 * 1. Fetch all active plans from database
 * 2. Return list of active plans
 */
router.get("/", async (req, res) => {
  try {
    // 1. Get only active plans
    const plans = await Plan.find({ isActive: true }).lean();

    // 2. Return response
    res.status(200).json({ plans });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * =====================================================
 * GET ALL PLANS (ADMIN ONLY)
 * =====================================================
 * Flow:
 * 1. Authenticate request using accessToken
 * 2. Check user role (must be admin)
 * 3. Fetch all plans (active + inactive)
 * 4. Return list of plans
 */
router.get("/all", auth, checkRole("admin"), async (req, res) => {
  try {
    // 3. Get all plans
    const plans = await Plan.find().lean();

    // 4. Return response
    res.status(200).json({ plans });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * Joi schema for validating login request body
 * Ensures all fields format are valid and 1 field has to be sent at least
 */
const planUpdateSchemaJoi = joi.object({
  name: joi.string(),
  price: joi.number().min(0),
  billingCycle: joi.string().valid("monthly", "yearly"),
  isActive: joi.boolean()
}).min(1).required();
/**
 * =====================================================
 * UPDATE PLAN (ADMIN ONLY)
 * =====================================================
 * Flow:
 * 1. Authenticate request using accessToken
 * 2. Check user role (must be admin)
 * 3. Find plan by ID
 * 4. Validate request body using Joi (partial update)
 * 5. Check duplicate plan name (if name is updated)
 * 6. Apply updates to plan document
 * 7. Save updated plan
 * 8. Return updated plan
 */
router.patch("/:planId", auth, checkRole("admin"), async (req, res) => {
  try {
    // 3. Find plan
    const plan = await Plan.findById(req.params.planId);
    if (!plan) {
      return res.status(404).json({ message: "Plan not found" });
    }

    // 4. Validate update body
    const joiValidation = planUpdateSchemaJoi.validate(req.body ?? {}, {
      abortEarly: true,
      stripUnknown: true
    });
    if (joiValidation.error) {
      return res.status(400).json({ message: joiValidation.error.details[0].message });
    }

    // 5. Check duplicate name (if updating name)
    const updates = joiValidation.value;
    if (updates.name){
      const existingPlan = await Plan.findOne({ 
        name: updates.name,
        _id: { $ne: plan._id }
      });
      if (existingPlan){
        return res.status(400).json({ message: "Plan already exists" });
      }
    }
    
    // 6. Apply updates
    plan.set(updates);
    
    // 7. Save updated plan
    await plan.save();

    // 8. Return response
    res.status(200).json({ message: "Plan updated successfully", plan });

    /*
     TODO (PayPal sync):
      PayPal billing plans are not meant to be edited for price/billing cycle in-place.
      If price or billingCycle changes:
      1) create a NEW PayPal plan (new paypalPlanId)
      2) create a NEW local plan version (or deactivate old plan)
      3) handle upgrade/downgrade for existing subscriptions (optional)
    */

  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * =====================================================
 * SOFT DELETE PLAN (ADMIN ONLY)
 * =====================================================
 * Flow:
 * 1. Authenticate request using accessToken
 * 2. Check user role (must be admin)
 * 3. Find plan by ID
 * 4. Check if plan is available
 * 5. Check if plan is already not active
 * 6. Set plan.isActive = false (soft delete)
 * 7. Save plan to database
 * 8. Return success response
 */
router.delete("/:planId", auth, checkRole("admin"), async (req, res) => {
  try {
    // 3. Find plan by ID
    const plan = await Plan.findById(req.params.planId);

    // 4. Check if plan is available
    if (!plan) {
      return res.status(404).json({ message: "Plan not found" });
    }

    // 5. Check if plan is already not active
    if (!plan.isActive) {
      return res.status(200).json({ message: "Plan already deactivated", plan });
    }

    // 6. Soft delete → deactivate plan
    plan.isActive = false;

    // 7. Save changes
    await plan.save();

    // 8. Return response
    res.status(200).json({ message: "Plan deactivated successfully", plan });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

// TO DO: HARD DELETE

module.exports = router;