const fs = require("fs/promises");
const path = require("path");
const fetch = require("node-fetch");
const cloudinary = require("../config/cloudinary");

const uploadsDir = path.join(__dirname, "..", "uploads");
const cloudinaryFolder = process.env.CLOUDINARY_FOLDER || "posters";

function isRemoteUrl(value = "") {
  return /^https?:\/\//i.test(String(value));
}

async function uploadBufferToCloudinary(buffer, options = {}) {
  const folder = options.folder || cloudinaryFolder;
  const publicId = options.publicId;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "image",
        overwrite: true,
      },
      (error, result) => {
        if (error) return reject(error);
        return resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    );

    stream.end(buffer);
  });
}

async function uploadFileToCloudinary(filePath, options = {}) {
  const result = await cloudinary.uploader.upload(filePath, {
    folder: options.folder || cloudinaryFolder,
    public_id: options.publicId,
    resource_type: "image",
    overwrite: true,
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
}

async function deleteCloudinaryAsset(publicId) {
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
}

async function readImageInput(source) {
  if (!source) throw new Error("Image source is required.");

  if (Buffer.isBuffer(source)) return source;

  if (isRemoteUrl(source)) {
    const response = await fetch(source, { timeout: 30000 });
    if (!response.ok) throw new Error(`Unable to fetch Cloudinary image: ${response.status}`);
    return response.buffer();
  }

  if (String(source).startsWith("/uploads/")) {
    return fs.readFile(path.join(uploadsDir, path.basename(source)));
  }

  return fs.readFile(source);
}

module.exports = {
  deleteCloudinaryAsset,
  isRemoteUrl,
  readImageInput,
  uploadBufferToCloudinary,
  uploadFileToCloudinary,
};
