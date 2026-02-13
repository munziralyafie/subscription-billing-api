const request = require("supertest");
const app = require("../src/app");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../src/models/user");

describe("Auth Session Endpoints", () => {
  test("POST /api/auth/refresh should return 401 when refresh token cookie is missing", async () => {
    const res = await request(app).post("/api/auth/refresh").send({});
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("message", "No refresh token provided");
  });

  test("POST /api/auth/logout should return 200 even when refresh token cookie is missing", async () => {
    const res = await request(app).post("/api/auth/logout").send({});
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message", "Logged out successfully");
  });

  test("POST /api/auth/refresh should return 200 with new accessToken when refresh cookie is valid", async () => {
    const hashedPassword = await bcrypt.hash("correct123", 10);

    await User.create({
        name: "Refresh User",
        email: "refresh@mail.com",
        password: hashedPassword,
        address: "Refresh Address 123",
        role: "user",
        isVerified: true,
    });

    // login first to get cookie refreshToken
    const loginRes = await request(app).post("/api/auth/login").send({
        email: "refresh@mail.com",
        password: "correct123",
    });

    const cookies = loginRes.headers["set-cookie"];
    expect(cookies).toBeDefined();

    // pakai cookie refreshToken ke endpoint refresh
    const refreshRes = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", cookies);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body).toHaveProperty("message", "Token refreshed");
    expect(refreshRes.body).toHaveProperty("accessToken");
  });

  test("POST /api/auth/refresh should return 403 when refresh token is invalid JWT", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", ["refreshToken=ini-bukan-jwt-valid"]);

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty("message", "Invalid refresh token");
  });

  test("POST /api/auth/refresh should return 404 when token is valid but user not found", async () => {
    const refreshToken = jwt.sign(
      { _id: "507f1f77bcf86cd799439099" }, // user ini tidak ada di DB
      process.env.REFRESH_TOKEN_JWT_KEY
    );

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", [`refreshToken=${refreshToken}`]);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("message", "Invalid refresh token");
  });

  test("POST /api/auth/refresh should return 401 when user has no stored refreshToken", async () => {
    const hashedPassword = await bcrypt.hash("correct123", 10);

    const user = await User.create({
      name: "No Refresh User",
      email: "norefresh@mail.com",
      password: hashedPassword,
      address: "No Refresh Address",
      role: "user",
      isVerified: true,
      refreshToken: null, // penting untuk branch ini
    });

    const refreshToken = require("jsonwebtoken").sign(
      { _id: String(user._id) },
      process.env.REFRESH_TOKEN_JWT_KEY
    );

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", [`refreshToken=${refreshToken}`]);

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("message", "Invalid refresh token");
  });

  test("POST /api/auth/refresh should return 401 when refresh token does not match hashed token in DB", async () => {
    const hashedPassword = await bcrypt.hash("correct123", 10);

    const user = await User.create({
      name: "Mismatch Refresh User",
      email: "mismatch@mail.com",
      password: hashedPassword,
      address: "Mismatch Address",
      role: "user",
      isVerified: true,
    });

    // store hash from another string (not token refresh valid)
    user.refreshToken = await bcrypt.hash("totally-different-refresh-token", 10);
    await user.save();

    // send refresh token JWT valid for current user
    const validRefreshToken = jwt.sign(
      { _id: String(user._id) },
      process.env.REFRESH_TOKEN_JWT_KEY
    );

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", [`refreshToken=${validRefreshToken}`]);

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("message", "Invalid refresh token");
  });

  test("POST /api/auth/logout should clear refreshToken in DB when cookie is valid", async () => {
    const hashedPassword = await bcrypt.hash("correct123", 10);

    const user = await User.create({
        name: "Logout User",
        email: "logout@mail.com",
        password: hashedPassword,
        address: "Logout Address 123",
        role: "user",
        isVerified: true,
    });

    // login first to get refreshToken cookie + refreshToken stored in DB
    const loginRes = await request(app).post("/api/auth/login").send({
        email: "logout@mail.com",
        password: "correct123",
    });

    const cookies = loginRes.headers["set-cookie"];
    expect(cookies).toBeDefined();

    const beforeLogout = await User.findById(user._id);
    expect(beforeLogout.refreshToken).toBeTruthy();

    // logout
    const logoutRes = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", cookies);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body).toHaveProperty("message", "Logged out successfully");

    const afterLogout = await User.findById(user._id);
    expect(afterLogout.refreshToken).toBeNull();
  });

  test("POST /api/auth/logout should still return 200 when refresh token JWT is invalid", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", ["refreshToken=invalid.jwt.token"]);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message", "Logged out successfully");
  });
});
