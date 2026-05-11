const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const sequelize = require("./config/db");
require("./models/Poster");
const posterRoutes = require("./routes/posterRoutes");

const app = express();
const PORT = Number(process.env.PORT || 5000);
const uploadsPath = path.join(__dirname, "uploads");
const allowedOrigins = new Set(
  [
    process.env.CLIENT_URL,
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]
    .filter(Boolean)
    .map((origin) => origin.replace(/\/$/, ""))
);

function isAllowedOrigin(origin, callback) {
  if (!origin) return callback(null, true);

  try {
    const url = new URL(origin);
    const normalizedOrigin = origin.replace(/\/$/, "");
    const isViteDevServer =
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      ["5173", "5174"].includes(url.port);

    return callback(null, allowedOrigins.has(normalizedOrigin) || isViteDevServer);
  } catch (error) {
    return callback(null, false);
  }
}

if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

app.use(cors({ origin: isAllowedOrigin }));
app.options("*", cors({ origin: isAllowedOrigin }));
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(uploadsPath));
app.use("/api/posters", posterRoutes);

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

sequelize
  .sync({ alter: true })
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`Poster generator API running on port ${PORT}`);
    });
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use. Stop the old server or set PORT to another value in server/.env.`);
        process.exit(1);
      }
      throw error;
    });
  })
  .catch((error) => {
    console.error("Unable to start server:", error);
    process.exit(1);
  });
