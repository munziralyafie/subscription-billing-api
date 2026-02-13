const jwt = require("jsonwebtoken");

// Generate JWT with common options
function generateToken(payload) {
    const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_JWT_KEY, { expiresIn: "1h" });
    const refreshToken = jwt.sign({ _id: payload._id }, process.env.REFRESH_TOKEN_JWT_KEY, { expiresIn: "3d" });
    return { accessToken, refreshToken };
}

module.exports = { generateToken };