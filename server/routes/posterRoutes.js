const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const multer = require("multer");
const { Op } = require("sequelize");
const Poster = require("../models/Poster");
const generatePoster = require("../services/generatePoster");

const router = express.Router();
const uploadsDir = path.join(__dirname, "..", "uploads");
const categories = ["exam", "fee", "wishes", "announcement", "class", "timetable"];
const dailyPosterLimit = Number(process.env.DAILY_POSTER_LIMIT || 20);
const imageStorage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase() || ".png";
    const prefix = file.fieldname === "background" ? "custom_bg" : "logo";
    cb(null, `${prefix}_${Date.now()}_${Math.round(Math.random() * 1e9)}${extension}`);
  },
});
const upload = multer({
  storage: imageStorage,
  limits: { files: 6, fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Only image uploads are allowed."));
    return cb(null, true);
  },
});
const posterUpload = upload.fields([
  { name: "logos", maxCount: 5 },
  { name: "background", maxCount: 1 },
]);

function parseFieldsJson(value) {
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

function validatePayload(body) {
  if (!categories.includes(body.category)) return "Invalid category.";
  if (!body.title || typeof body.title !== "string") return "Title is required.";
  if (!body.fields_json || typeof body.fields_json !== "object") return "fields_json is required.";
  return null;
}

async function removeUpload(publicPath) {
  if (!publicPath || !publicPath.startsWith("/uploads/")) return;
  const filePath = path.join(uploadsDir, path.basename(publicPath));
  await fs.rm(filePath, { force: true });
}

function runPosterGeneration(poster) {
  const previousGeneratedPaths = [poster.bg_image_path, poster.qr_path, poster.final_poster_path, poster.fields_json?.edit_base_path].filter(Boolean);

  generatePoster(poster)
    .then(async (result) => {
      await poster.update({ ...result, status: "done" });
      await Promise.all(
        previousGeneratedPaths
          .filter((publicPath) => ![result.bg_image_path, result.qr_path, result.final_poster_path].includes(publicPath))
          .map((publicPath) => removeUpload(publicPath))
      );
    })
    .catch(async (generationError) => {
      console.error("Poster generation failed:", generationError);
      await poster.update({ status: "failed" });
    });
}

function safeDownloadName(poster) {
  const title = String(poster.title || "poster")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${title || "poster"}-${poster.id}.jpg`;
}

function getUploadedPaths(files, fieldName) {
  return (files?.[fieldName] || []).map((file) => `/uploads/${file.filename}`);
}

function uploadedPublicPaths(files) {
  return Object.values(files || {})
    .flat()
    .map((file) => `/uploads/${file.filename}`);
}

router.post("/", posterUpload, async (req, res) => {
  try {
    req.body.fields_json = parseFieldsJson(req.body.fields_json);
    const uploadedLogoPaths = getUploadedPaths(req.files, "logos");
    const uploadedBackgroundPath = getUploadedPaths(req.files, "background")[0] || "";
    req.body.fields_json = {
      ...req.body.fields_json,
      logo_paths: uploadedLogoPaths,
      logo_count: uploadedLogoPaths.length,
      custom_background_path: uploadedBackgroundPath || req.body.fields_json.custom_background_path || "",
    };

    const error = validatePayload(req.body);
    if (error) return res.status(400).json({ message: error });

    const poster = await Poster.create({
      category: req.body.category,
      title: req.body.title.trim(),
      fields_json: req.body.fields_json,
      status: "processing",
    });

    runPosterGeneration(poster);

    return res.status(202).json({ id: poster.id, status: poster.status });
  } catch (error) {
    console.error("Create poster failed:", error);
    await Promise.all(uploadedPublicPaths(req.files).map((publicPath) => removeUpload(publicPath)));
    return res.status(500).json({ message: "Unable to create poster." });
  }
});

router.get("/:id/download", async (req, res) => {
  try {
    const poster = await Poster.findByPk(req.params.id);
    if (!poster || !poster.final_poster_path) return res.status(404).json({ message: "Poster file not found." });

    const filePath = path.join(uploadsDir, path.basename(poster.final_poster_path));
    return res.download(filePath, safeDownloadName(poster));
  } catch (error) {
    console.error("Download poster failed:", error);
    return res.status(500).json({ message: "Unable to download poster." });
  }
});

router.get("/stats/daily", async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    const count = await Poster.count({
      where: {
        createdAt: {
          [Op.gte]: startOfToday,
          [Op.lt]: startOfTomorrow,
        },
      },
    });

    return res.json({
      count,
      limit: dailyPosterLimit,
      remaining: Math.max(0, dailyPosterLimit - count),
      percent: dailyPosterLimit > 0 ? Math.min(100, Math.round((count / dailyPosterLimit) * 100)) : 0,
      windowLabel: "today",
    });
  } catch (error) {
    console.error("Daily stats failed:", error);
    return res.status(500).json({ message: "Unable to fetch daily poster stats." });
  }
});

router.patch("/:id/regenerate", posterUpload, async (req, res) => {
  try {
    const poster = await Poster.findByPk(req.params.id);
    if (!poster) return res.status(404).json({ message: "Poster not found." });

    const incomingFields = parseFieldsJson(req.body.fields_json || {});
    const uploadedBackgroundPath = getUploadedPaths(req.files, "background")[0] || "";
    const previousCustomBackground = poster.fields_json?.custom_background_path;
    const fields_json = {
      ...(poster.fields_json || {}),
      ...incomingFields,
      ...(uploadedBackgroundPath ? { custom_background_path: uploadedBackgroundPath } : {}),
      used_fallback_background: false,
      generation_notice: "",
    };

    await poster.update({
      title: typeof req.body.title === "string" && req.body.title.trim() ? req.body.title.trim() : poster.title,
      fields_json,
      status: "processing",
    });

    if (uploadedBackgroundPath && previousCustomBackground && previousCustomBackground !== uploadedBackgroundPath) {
      await removeUpload(previousCustomBackground);
    }

    runPosterGeneration(poster);
    return res.status(202).json({ id: poster.id, status: "processing" });
  } catch (error) {
    console.error("Regenerate poster failed:", error);
    await Promise.all(uploadedPublicPaths(req.files).map((publicPath) => removeUpload(publicPath)));
    return res.status(500).json({ message: "Unable to regenerate poster." });
  }
});

router.get("/", async (req, res) => {
  try {
    const where = categories.includes(req.query.category) ? { category: req.query.category } : {};
    const posters = await Poster.findAll({ where, order: [["createdAt", "DESC"]] });
    return res.json(posters);
  } catch (error) {
    console.error("List posters failed:", error);
    return res.status(500).json({ message: "Unable to fetch posters." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const poster = await Poster.findByPk(req.params.id);
    if (!poster) return res.status(404).json({ message: "Poster not found." });
    return res.json(poster);
  } catch (error) {
    console.error("Get poster failed:", error);
    return res.status(500).json({ message: "Unable to fetch poster." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const poster = await Poster.findByPk(req.params.id);
    if (!poster) return res.status(404).json({ message: "Poster not found." });

    await Promise.all([
      removeUpload(poster.bg_image_path),
      removeUpload(poster.qr_path),
      removeUpload(poster.final_poster_path),
      removeUpload(poster.fields_json?.edit_base_path),
      removeUpload(poster.fields_json?.custom_background_path),
      ...((poster.fields_json?.logo_paths || []).map((logoPath) => removeUpload(logoPath))),
    ]);
    await poster.destroy();

    return res.json({ message: "Poster deleted." });
  } catch (error) {
    console.error("Delete poster failed:", error);
    return res.status(500).json({ message: "Unable to delete poster." });
  }
});

module.exports = router;
