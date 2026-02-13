const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
        name: { type: String, required: true, minlength: 3, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        password: { type: String, minlength: 6, select: false }, 
        googleId: { type: String, unique: true, sparse: true }, 
        facebookId: { type: String, unique: true, sparse: true },
        address: { type: String, required: true },
        role: { type: String, enum:["user", "admin"], default: "user" },
        refreshToken: { type: String },
        isVerified: { type: Boolean, default: false },
        },
    { timestamps: true }
);

const User = mongoose.model("User", userSchema);

module.exports = User;