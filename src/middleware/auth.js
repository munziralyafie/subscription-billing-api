const jwt = require("jsonwebtoken");

/**
 * =====================================================
 * AUTH MIDDLEWARE (VERIFY ACCESS TOKEN)
 * =====================================================
 * Flow:
 * 1. Check Authorization header existence
 * 2. Ensure header starts with "Bearer "
 * 3. Extract JWT access token from header
 * 4. Verify token using JWT secret
 * 5. Attach decoded user payload to req.user
 * 6. Allow request to continue
 */
const auth = (req, res, next) => {
    const authHeader = req.headers.authorization;

    // 1 & 2. Validate Authorization header
    if(!authHeader || !authHeader.startsWith("Bearer ")){
        return res.status(401).json({ message: "Authorization token required!" });
    }

    // 3. Extract token from authorization header
    const token = authHeader.split(" ")[1]; 

    try{
        // 4. Verify token
        const decodedUser = jwt.verify(token, process.env.ACCESS_TOKEN_JWT_KEY)

        // 5. Attach user payload to request
        req.user = decodedUser; // { _id, name, role }

        // 6. Continue to next middleware/route
        next();
    }catch (error) {
        return res.status(401).json({ message: "Invalid or expired token!" });
    }
}

/**
 * ROLE AUTHORIZATION MIDDLEWARE for validating role of the user
 * Ensure req.user exists (user already authenticated)
 * If role matches → allow access, If role mismatch → deny access
 */
const checkRole = (role) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    if (req.user.role !== role) {
        return res.status(403).json({ message: `Access denied: ${role} only!` });
    }
    next();
}

module.exports = { auth, checkRole };

