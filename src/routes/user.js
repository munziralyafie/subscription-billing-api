const express = require('express');
const router = express.Router();
const bcrypt = require("bcrypt");
const joi = require("joi");

const { generateToken } = require("../utils/jwt");
const User = require('../models/user');
const { auth, checkRole } = require('../middleware/auth');

// Create User Schema for backend data validation
const userSchemaJoi = joi.object({
    name: joi.string().min(3).required(),
    email: joi.string().email().required(),
    password: joi.string().min(6).required(),
    address: joi.string().min(5).required()
});

// Helper function: create user/admin
async function createAccount({ name, email, password, address, role, token = false, isVerified }){

    // Check whether the account already exist or not by its unique email
    const existingAccount = await User.findOne({ email });
    if (existingAccount) {
    return { error: { status: 400, message: "User already exists" } };
    }

    // Hash the user password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new User Instance if the user has not already existed yet
    const newAccount = new User({
        name,
        email,
        password: hashedPassword,
        address,
        role,
        isVerified: isVerified ?? (role === "admin")
    });
    
    // No generate JWT for admin and save the new admin instance to database
    if(!token){
        await newAccount.save();
        return { newAccount };
    }

    // Generate JWT once user is created
    const { accessToken, refreshToken } = generateToken({ _id: newAccount._id, name: newAccount.name, role: newAccount.role });

    // Hash the refresh token
    newAccount.refreshToken = await bcrypt.hash(refreshToken, 10);

    // Save the new user instance
    await newAccount.save();

    return { newAccount, accessToken, refreshToken };
}

// Create User Account
router.post("/", async (req,res) => {
    try {

        // Joi validation
        const joiValidation = userSchemaJoi.validate(req.body, {
            abortEarly: true,
            stripUnknown: true
        });
        if(joiValidation.error){
            return res.status(400).json({ message: joiValidation.error.details[0].message});
        };

        // Create User Account
        const result = await createAccount({ ...joiValidation.value, role: "user", token: true });
        if(result.error){
            return res.status(result.error.status).json({ message: result.error.message });
        }

        // Created User is directly logged in
        res.cookie("refreshToken", result.refreshToken, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === "production", 
            sameSite: "strict", 
            maxAge: 3 * 24 * 60 * 60 * 1000
        })

        return res.status(201).json({ message: "User created successfully", accessToken: result.accessToken });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
})

// Create admin (protected: only ADMIN can create)
router.post("/admin", auth, checkRole("admin"), async (req,res) => {
    try {

        // Joi validation
        const joiValidation = userSchemaJoi.validate(req.body, {
            abortEarly: true,
            stripUnknown: true
        });
        if(joiValidation.error){
            return res.status(400).json({ message: joiValidation.error.details[0].message});
        };

        // Create Admin Account
        const result = await createAccount({ ...joiValidation.value, role: "admin" });
        if(result.error){
            return res.status(result.error.status).json({ message: result.error.message });
        }

        // Created Admin is not directly logged in -> No set cooike required
        return res.status(201).json({
            message: "Admin created successfully",
            admin: {
                id: result.newAccount._id,
                name: result.newAccount.name,
                email: result.newAccount.email,
                role: result.newAccount.role
            }
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;