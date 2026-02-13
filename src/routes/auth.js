const express = require('express');
const router = express.Router();
const bcrypt = require("bcrypt");
const joi = require("joi");
const jwt = require("jsonwebtoken");

const User = require('../models/user');
const { generateToken } = require('../utils/jwt');

/**
 * Joi schema for validating login request body
 * Ensures email format is valid and password has minimum length
 */
const loginSchemaJoi = joi.object({
    email: joi.string().email().required(),
    password: joi.string().min(6).required(),
});

/**
 * =====================================================
 * LOGIN API
 * =====================================================
 * Flow:
 * 1. Validate request body using Joi
 * 2. Find user by email and include password field
 * 3. Compare password using bcrypt
 * 4. Generate accessToken + refreshToken
 * 5. Store hashed refreshToken in DB
 * 6. Send refreshToken as httpOnly cookie
 * 7. Return accessToken in response body
 */
router.post("/login", async (req, res) => {
    try {
        // 1. Validate request body
        const joiValidation = loginSchemaJoi.validate(req.body);
        if(joiValidation.error){
            return res.status(400).json({ message: joiValidation.error.details[0].message});
        }

        // 2. Find user by email (include password field)
        const registeredUser = await User.findOne({ email: req.body.email }).select("+password");
        if (!registeredUser) {
            return res.status(401).json({ message: "Invalid credentials" }); // better than "User not found"
        }

        // 3. Compare provided password with hashed password
        const isPasswordMatch = await bcrypt.compare(req.body.password, registeredUser.password);
        if (!isPasswordMatch) {
            return res.status(401).json({ message: "Invalid credentials" }); // better than "Invalid password"
        }

        // 4. Generate JWT tokens
        const { accessToken, refreshToken } = generateToken({ _id: registeredUser._id, name: registeredUser.name, role: registeredUser.role });

        // 5. Store HASHED refresh token in database (security best practice)
        registeredUser.refreshToken = await bcrypt.hash(refreshToken, 10);
        await registeredUser.save();

        // 6. Send refresh token via secure httpOnly cookie
        res.cookie("refreshToken", refreshToken, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === "production", 
            sameSite: "strict", 
            path: "/",
            maxAge: 3 * 24 * 60 * 60 * 1000
        })
        // 7. Return access token
        res.status(200).json({ message: "Login successfully", accessToken });

    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
});

// TO DO: GOOGLE LOGIN

// TO DO: FACEBOOK LOGIN

/**
 * =====================================================
 * REFRESH ACCESS TOKEN API
 * =====================================================
 * This endpoint issues a new accessToken using a valid refreshToken stored in httpOnly cookie.
 * Flow:
 * 1. Read refreshToken from cookie
 * 2. Verify refreshToken signature
 * 3. Find user from decoded token
 * 4. Compare refreshToken with hashed token in DB
 * 5. Generate new accessToken + refreshToken (rotation)
 * 6. Save new hashed refreshToken to DB
 * 7. Send new refreshToken cookie + accessToken response
 */
router.post("/refresh", async (req, res) => {
  try {
    // 1. Get refresh token from cookie
    const userRefreshToken = req.cookies ? req.cookies.refreshToken : undefined;
    if(!userRefreshToken){
      return res.status(401).json({ message: "No refresh token provided" })
    } 
    
    // 2. Verify refresh token signature
    let decoded;
    try{
        decoded = jwt.verify(userRefreshToken, process.env.REFRESH_TOKEN_JWT_KEY)
    }catch (error){
        return res.status(403).json({ message: "Invalid refresh token" })
    }

    // 3. Find user by decoded id
    const user = await User.findById(decoded._id)
    if(!user){
      return res.status(404).json({message: "Invalid refresh token"}) // better than "User not found"
    }

    // Ensure user still has refreshToken stored in DB (user may have logged out)
    if (!user.refreshToken) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // 4. Compare cookie refresh token with hashed token in DB
    const isMatch = await bcrypt.compare(userRefreshToken, user.refreshToken)
    if(!isMatch){
      return res.status(401).json({message: "Invalid refresh token"})
    } 
    
    // 5. Generate NEW access + refresh token (token rotation)
    const { accessToken, refreshToken } = generateToken({ _id: user._id, name: user.name, role: user.role});
    
    // 6. Save NEW hashed refresh token to DB (invalidate old one)
    user.refreshToken = await bcrypt.hash(refreshToken, 10);
    await user.save();

    // 7. Send new refresh token in httpOnly cookie
    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 3 * 24 * 60 * 60 * 1000
    })

    // Send new access token in response
    res.status(200).json({ message: "Token refreshed", accessToken });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * =====================================================
 * LOGOUT API (Idempotent)
 * =====================================================
 * This endpoint ALWAYS returns success.
 * Logout must be idempotent → calling it multiple times gives same result.
 *
 * Flow:
 * 1. Always remove refreshToken cookie from browser
 * 2. If no refresh token → logout still successful
 * 3. If token exists → verify JWT
 * 4. If valid → compare with hashed token in DB
 * 5. If match → remove refreshToken from DB
 * 6. Return success response in all cases
 */
router.post("/logout", async (req, res) => {
  try {
    const refreshToken = req.cookies ? req.cookies.refreshToken: undefined;

    // 1. Always clear cookie from client (important security practice)
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/"
    });

    // 2. If cookie does not exist → already logged out
    if (!refreshToken) {
      return res.status(200).json({ message: "Logged out successfully" });
    }

    // 3. Verify refresh token JWT
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_JWT_KEY);
    } catch (err) {
      // Token invalid or expired → still considered logged out
      return res.status(200).json({ message: "Logged out successfully" });
    }

    // 4. Find user and compare hashed refresh token
    const user = await User.findById(decoded._id);
    if (user && user.refreshToken) {
      const isMatch = await bcrypt.compare(refreshToken, user.refreshToken);
      if (isMatch) {
        // 5. Remove refresh token from DB
        user.refreshToken = null;
        await user.save();
      }
    }
    // 6. Logout success in all cases (idempotent)
    return res.status(200).json({ message: "Logged out successfully" });
    
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;