const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const cloudinaryFolder = process.env.CLOUDINARY_FOLDER || "posters";

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: cloudinaryFolder,
    resource_type: "image",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    public_id: `${file.fieldname}_${Date.now()}_${Math.round(Math.random() * 1e9)}`,
  }),
});

const cloudinaryUpload = multer({
  storage,
  limits: { files: 6, fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Only image uploads are allowed."));
    return cb(null, true);
  },
});

module.exports = cloudinaryUpload;
