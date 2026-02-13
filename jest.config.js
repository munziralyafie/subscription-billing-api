module.exports = {
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/tests/setup.db.js"],
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/scripts/**"
  ],
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 50,
      functions: 60,
      lines: 70
    }
  }
};
