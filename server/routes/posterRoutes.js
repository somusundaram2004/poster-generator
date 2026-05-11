const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const fetch = require("node-fetch");
const { Op } = require("sequelize");
const Poster = require("../models/Poster");
const generatePoster = require("../services/generatePoster");
const cloudinaryUpload = require("../middleware/cloudinaryUpload");
const { deleteCloudinaryAsset, isRemoteUrl } = require("../services/cloudinaryAssets");

const router = express.Router();
const uploadsDir = path.join(__dirname, "..", "uploads");
const categories = ["exam", "fee", "wishes", "announcement", "class", "timetable"];
const dailyPosterLimit = Number(process.env.DAILY_POSTER_LIMIT || 20);
const posterUpload = cloudinaryUpload.fields([
  { name: "logos", maxCount: 5 },
  { name: "background", maxCount: 1 },
]);
const singlePosterUpload = cloudinaryUpload.single("poster");

function runUpload(uploadMiddleware) {
  return (req, res, next) => {
    uploadMiddleware(req, res, (error) => {
      if (!error) return next();

      console.error("Cloudinary upload middleware failed:", error);
      const missingCloudinaryConfig = [
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET",
      ].some((key) => !process.env[key]);

      return res.status(500).json({
        message: missingCloudinaryConfig
          ? "Cloudinary is not configured on the server. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
          : "Unable to upload image to Cloudinary.",
        detail: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    });
  };
}

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

async function removeUpload(publicPath, cloudinaryId) {
  if (cloudinaryId) {
    await deleteCloudinaryAsset(cloudinaryId).catch((error) => {
      console.warn("Cloudinary delete failed:", cloudinaryId, error.message);
    });
  }
  if (!publicPath || !publicPath.startsWith("/uploads/")) return;
  const filePath = path.join(uploadsDir, path.basename(publicPath));
  await fs.rm(filePath, { force: true });
}

function runPosterGeneration(poster) {
  const previousGeneratedPaths = [poster.bg_image_path, poster.qr_path, poster.final_poster_path, poster.fields_json?.edit_base_path].filter(Boolean);
  const previousGeneratedCloudinaryIds = [
    poster.fields_json?.bg_cloudinary_id,
    poster.fields_json?.qr_cloudinary_id,
    poster.fields_json?.final_poster_cloudinary_id,
    poster.fields_json?.edit_base_cloudinary_id,
    poster.cloudinaryId,
  ].filter(Boolean);

  generatePoster(poster)
    .then(async (result) => {
      await poster.update({ ...result, status: "done" });
      await Promise.all(
        previousGeneratedPaths
          .filter((publicPath) => ![result.bg_image_path, result.qr_path, result.final_poster_path].includes(publicPath))
          .map((publicPath) => removeUpload(publicPath))
      );
      await Promise.all(
        previousGeneratedCloudinaryIds
          .filter((publicId) => ![
            result.fields_json?.bg_cloudinary_id,
            result.fields_json?.qr_cloudinary_id,
            result.fields_json?.final_poster_cloudinary_id,
            result.fields_json?.edit_base_cloudinary_id,
            result.cloudinaryId,
          ].includes(publicId))
          .map((publicId) => removeUpload("", publicId))
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
  return (files?.[fieldName] || []).map((file) => file.path);
}

function getUploadedCloudinaryIds(files, fieldName) {
  return (files?.[fieldName] || []).map((file) => file.filename).filter(Boolean);
}

function uploadedCloudinaryIds(files) {
  return Object.values(files || {})
    .flat()
    .map((file) => file.filename)
    .filter(Boolean);
}

router.post("/", runUpload(posterUpload), async (req, res) => {
  try {
    req.body.fields_json = parseFieldsJson(req.body.fields_json);
    const uploadedLogoPaths = getUploadedPaths(req.files, "logos");
    const uploadedLogoCloudinaryIds = getUploadedCloudinaryIds(req.files, "logos");
    const uploadedBackgroundPath = getUploadedPaths(req.files, "background")[0] || "";
    const uploadedBackgroundCloudinaryId = getUploadedCloudinaryIds(req.files, "background")[0] || "";
    req.body.fields_json = {
      ...req.body.fields_json,
      logo_paths: uploadedLogoPaths,
      logo_cloudinary_ids: uploadedLogoCloudinaryIds,
      logo_count: uploadedLogoPaths.length,
      custom_background_path: uploadedBackgroundPath || req.body.fields_json.custom_background_path || "",
      custom_background_cloudinary_id: uploadedBackgroundCloudinaryId || req.body.fields_json.custom_background_cloudinary_id || "",
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
    await Promise.all(uploadedCloudinaryIds(req.files).map((publicId) => removeUpload("", publicId)));
    return res.status(500).json({ message: "Unable to create poster." });
  }
});

router.post("/upload", runUpload(singlePosterUpload), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Poster image is required." });

    const title = typeof req.body.title === "string" && req.body.title.trim()
      ? req.body.title.trim()
      : req.file.originalname || "Uploaded poster";
    const category = categories.includes(req.body.category) ? req.body.category : "announcement";
    const poster = await Poster.create({
      category,
      title,
      fields_json: {
        upload_source: "cloudinary",
        final_poster_cloudinary_id: req.file.filename,
      },
      final_poster_path: req.file.path,
      imageUrl: req.file.path,
      cloudinaryId: req.file.filename,
      status: "done",
    });

    return res.status(201).json({
      id: poster.id,
      imageUrl: poster.imageUrl,
      cloudinaryId: poster.cloudinaryId,
    });
  } catch (error) {
    console.error("Upload poster failed:", error);
    if (req.file?.filename) await removeUpload("", req.file.filename);
    return res.status(500).json({ message: "Unable to upload poster." });
  }
});

router.get("/:id/download", async (req, res) => {
  try {
    const poster = await Poster.findByPk(req.params.id);
    if (!poster || !poster.final_poster_path) return res.status(404).json({ message: "Poster file not found." });

    if (isRemoteUrl(poster.final_poster_path)) {
      const response = await fetch(poster.final_poster_path);
      if (!response.ok) return res.status(404).json({ message: "Poster file not found." });
      res.setHeader("Content-Disposition", `attachment; filename="${safeDownloadName(poster)}"`);
      res.setHeader("Content-Type", response.headers.get("content-type") || "image/jpeg");
      return response.body.pipe(res);
    }

    return res.download(path.join(uploadsDir, path.basename(poster.final_poster_path)), safeDownloadName(poster));
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

router.patch("/:id/regenerate", runUpload(posterUpload), async (req, res) => {
  try {
    const poster = await Poster.findByPk(req.params.id);
    if (!poster) return res.status(404).json({ message: "Poster not found." });

    const incomingFields = parseFieldsJson(req.body.fields_json || {});
    const uploadedBackgroundPath = getUploadedPaths(req.files, "background")[0] || "";
    const uploadedBackgroundCloudinaryId = getUploadedCloudinaryIds(req.files, "background")[0] || "";
    const previousCustomBackground = poster.fields_json?.custom_background_path;
    const previousCustomBackgroundCloudinaryId = poster.fields_json?.custom_background_cloudinary_id;
    const fields_json = {
      ...(poster.fields_json || {}),
      ...incomingFields,
      ...(uploadedBackgroundPath ? { custom_background_path: uploadedBackgroundPath } : {}),
      ...(uploadedBackgroundCloudinaryId ? { custom_background_cloudinary_id: uploadedBackgroundCloudinaryId } : {}),
      used_fallback_background: false,
      generation_notice: "",
    };

    await poster.update({
      title: typeof req.body.title === "string" && req.body.title.trim() ? req.body.title.trim() : poster.title,
      fields_json,
      status: "processing",
    });

    if (uploadedBackgroundPath && previousCustomBackground && previousCustomBackground !== uploadedBackgroundPath) {
      await removeUpload(previousCustomBackground, previousCustomBackgroundCloudinaryId);
    }

    runPosterGeneration(poster);
    return res.status(202).json({ id: poster.id, status: "processing" });
  } catch (error) {
    console.error("Regenerate poster failed:", error);
    await Promise.all(uploadedCloudinaryIds(req.files).map((publicId) => removeUpload("", publicId)));
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
      removeUpload(poster.bg_image_path, poster.fields_json?.bg_cloudinary_id),
      removeUpload(poster.qr_path, poster.fields_json?.qr_cloudinary_id),
      removeUpload(poster.final_poster_path, poster.fields_json?.final_poster_cloudinary_id || poster.cloudinaryId),
      removeUpload(poster.fields_json?.edit_base_path, poster.fields_json?.edit_base_cloudinary_id),
      removeUpload(poster.fields_json?.custom_background_path, poster.fields_json?.custom_background_cloudinary_id),
      ...((poster.fields_json?.logo_paths || []).map((logoPath, index) => removeUpload(logoPath, poster.fields_json?.logo_cloudinary_ids?.[index]))),
    ]);
    await poster.destroy();

    return res.json({ message: "Poster deleted." });
  } catch (error) {
    console.error("Delete poster failed:", error);
    return res.status(500).json({ message: "Unable to delete poster." });
  }
});

module.exports = router;
