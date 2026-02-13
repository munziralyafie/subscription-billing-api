const request = require("supertest");
const app = require("../src/app");
const bcrypt = require("bcrypt");
const User = require("../src/models/user");

describe("Auth Login", () => {
  test("POST /api/auth/login should return 400 when request body is empty", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message");
  });

  test("POST /api/auth/login should return 401 for wrong password", async () => {
    const hashedPassword = await bcrypt.hash("correct123", 10);

    await User.create({
      name: "Test User",
      email: "testuser@mail.com",
      password: hashedPassword,
      address: "Test Address 123",
      role: "user",
      isVerified: true,
    });

    const res = await request(app).post("/api/auth/login").send({
      email: "testuser@mail.com",
      password: "wrong123",
    });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("message", "Invalid credentials");
  });

  test("POST /api/auth/login should return 200, accessToken, and refreshToken cookie", async () => {
    const hashedPassword = await bcrypt.hash("correct123", 10);

    await User.create({
      name: "Valid User",
      email: "validuser@mail.com",
      password: hashedPassword,
      address: "Valid Address 123",
      role: "user",
      isVerified: true,
    });

    const res = await request(app).post("/api/auth/login").send({
      email: "validuser@mail.com",
      password: "correct123",
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message", "Login successfully");
    expect(res.body).toHaveProperty("accessToken");

    const setCookie = res.headers["set-cookie"] || [];
    expect(setCookie.some((cookie) => cookie.includes("refreshToken="))).toBe(true);
  });

  test("POST /api/auth/login should return 401 when email is not registered", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "notfound@mail.com",
      password: "secret123",
    });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("message", "Invalid credentials");
  });
});
