const request = require("supertest");
const jwt = require("jsonwebtoken");
const User = require("../src/models/user");
const app = require("../src/app");

function makeAdminToken() {
  return jwt.sign(
    {
      _id: "507f1f77bcf86cd799439011",
      name: "Admin",
      role: "admin",
    },
    process.env.ACCESS_TOKEN_JWT_KEY
  );
}

function makeUserToken() {
  return jwt.sign(
    {
      _id: "507f1f77bcf86cd799439012",
      name: "User",
      role: "user",
    },
    process.env.ACCESS_TOKEN_JWT_KEY
  );
}

describe("User Routes", () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  test("POST /api/user should create normal user and return accessToken", async () => {
    const res = await request(app).post("/api/user").send({
      name: "New User",
      email: "newuser@mail.com",
      password: "secret123",
      address: "Address 12345",
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("message", "User created successfully");
    expect(res.body).toHaveProperty("accessToken");

    const created = await User.findOne({ email: "newuser@mail.com" });
    expect(created).toBeTruthy();
    expect(created.role).toBe("user");
  });

  test("POST /api/user should return 400 for duplicate email", async () => {
    await User.create({
      name: "Existing",
      email: "dup@mail.com",
      password: "hashed",
      address: "Address 1",
      role: "user",
      isVerified: true,
    });

    const res = await request(app).post("/api/user").send({
      name: "Another",
      email: "dup@mail.com",
      password: "secret123",
      address: "Address 2",
    });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message", "User already exists");
  });

  test("POST /api/user/admin should return 401 without token", async () => {
    const res = await request(app).post("/api/user/admin").send({
      name: "Admin Candidate",
      email: "admin1@mail.com",
      password: "secret123",
      address: "Admin Address",
    });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("message", "Authorization token required!");
  });

  test("POST /api/user/admin should return 403 for non-admin token", async () => {
    const userToken = makeUserToken();

    const res = await request(app)
      .post("/api/user/admin")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        name: "Admin Candidate",
        email: "admin2@mail.com",
        password: "secret123",
        address: "Admin Address",
      });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty("message", "Access denied: admin only!");
  });

  test("POST /api/user/admin should create admin when requester is admin", async () => {
    const adminToken = makeAdminToken();

    const res = await request(app)
      .post("/api/user/admin")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Second Admin",
        email: "admin3@mail.com",
        password: "secret123",
        address: "Admin Address",
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("message", "Admin created successfully");
    expect(res.body).toHaveProperty("admin");
    expect(res.body.admin).toHaveProperty("role", "admin");

    const createdAdmin = await User.findOne({ email: "admin3@mail.com" });
    expect(createdAdmin).toBeTruthy();
    expect(createdAdmin.role).toBe("admin");
  });
});
