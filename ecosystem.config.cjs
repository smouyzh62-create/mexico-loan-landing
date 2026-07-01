module.exports = {
  apps: [
    {
      name: "mexico-loan-landing",
      script: "server.js",
      env: {
        PORT: 5173,
        ADMIN_PASSWORD: "change-this-strong-password"
      }
    }
  ]
};
