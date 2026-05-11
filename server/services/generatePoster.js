const fs = require("fs/promises");
const path = require("path");
const FormData = require("form-data");
const fetch = require("node-fetch");
const sharp = require("sharp");
const QRCode = require("qrcode");
const Groq = require("groq-sdk");
const {
  readImageInput,
  uploadFileToCloudinary,
} = require("./cloudinaryAssets");
require("dotenv").config();

const uploadsDir = path.join(__dirname, "..", "uploads");
const assetsDir = path.join(__dirname, "..", "..", "assets");

const modernPalettes = [
  { bg: "#07111f", panel: "rgba(7,17,31,0.74)", title: "#f8d56b", text: "#ffffff", accent: "#41d6c3", header: "rgba(255,255,255,0.08)", headerText: "#ffffff", start: "#07111f", mid: "#153d5f", end: "#41d6c3", titleFont: "Arial Black, Impact, system-ui, sans-serif", bodyFont: "Inter, system-ui, Arial, sans-serif" },
  { bg: "#f8fafc", panel: "rgba(255,255,255,0.84)", title: "#10203f", text: "#1f2937", accent: "#ef476f", header: "rgba(255,255,255,0.72)", headerText: "#10203f", start: "#f8fafc", mid: "#dbeafe", end: "#ef476f", titleFont: "Arial Black, Impact, system-ui, sans-serif", bodyFont: "Inter, system-ui, Arial, sans-serif" },
  { bg: "#101014", panel: "rgba(16,16,20,0.76)", title: "#ffffff", text: "#f8fafc", accent: "#ffb703", header: "rgba(255,255,255,0.08)", headerText: "#ffffff", start: "#101014", mid: "#44337a", end: "#ffb703", titleFont: "Arial Black, Impact, system-ui, sans-serif", bodyFont: "Inter, system-ui, Arial, sans-serif" },
  { bg: "#06281f", panel: "rgba(6,40,31,0.74)", title: "#d6fff2", text: "#ffffff", accent: "#f59e0b", header: "rgba(255,255,255,0.1)", headerText: "#d6fff2", start: "#06281f", mid: "#0f766e", end: "#f59e0b", titleFont: "Arial Black, Impact, system-ui, sans-serif", bodyFont: "Inter, system-ui, Arial, sans-serif" },
  { bg: "#fff7ed", panel: "rgba(255,255,255,0.86)", title: "#7c2d12", text: "#1f2937", accent: "#2563eb", header: "rgba(255,255,255,0.76)", headerText: "#7c2d12", start: "#fff7ed", mid: "#fed7aa", end: "#2563eb", titleFont: "Arial Black, Impact, system-ui, sans-serif", bodyFont: "Inter, system-ui, Arial, sans-serif" },
  { bg: "#0f172a", panel: "rgba(15,23,42,0.76)", title: "#e0f2fe", text: "#ffffff", accent: "#a3e635", header: "rgba(255,255,255,0.08)", headerText: "#e0f2fe", start: "#0f172a", mid: "#1d4ed8", end: "#a3e635", titleFont: "Arial Black, Impact, system-ui, sans-serif", bodyFont: "Inter, system-ui, Arial, sans-serif" },
];

const fontPairings = [
  { titleFont: "Arial Black, Impact, system-ui, sans-serif", bodyFont: "Inter, system-ui, Arial, sans-serif" },
  { titleFont: "Trebuchet MS, Verdana, system-ui, sans-serif", bodyFont: "Segoe UI, system-ui, Arial, sans-serif" },
  { titleFont: "Georgia, 'Times New Roman', serif", bodyFont: "Arial, system-ui, sans-serif" },
  { titleFont: "Verdana, Geneva, system-ui, sans-serif", bodyFont: "Trebuchet MS, system-ui, sans-serif" },
  { titleFont: "Impact, Arial Black, system-ui, sans-serif", bodyFont: "Verdana, system-ui, sans-serif" },
];

const editPreviewOmittedLayers = [
  "logo",
  "qr",
  "institution",
  "title",
  "heading",
  "body",
  "details",
  "date",
  "time",
  "venue",
  "contact",
  "footer",
  "clipart",
  "schedule",
];
const editBaseVersion = 2;

function uniquePosterAssetName(prefix, posterId, extension) {
  const suffix = `${Date.now()}_${Math.round(Math.random() * 1e9)}`;
  return `${prefix}_${posterId}_${suffix}.${extension}`;
}

function hashString(value = "") {
  return String(value).split("").reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
}

function seededIndex(seedText, length) {
  return Math.abs(hashString(seedText)) % length;
}

async function writeSharpToFile(image, finalPath) {
  const tempPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await image.toFile(tempPath);
    await fs.rename(tempPath, finalPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function transparentWhiteBackground(imageInput) {
  const { data, info } = await sharp(imageInput)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const maxChannel = Math.max(red, green, blue);
    const minChannel = Math.min(red, green, blue);
    if (red > 224 && green > 224 && blue > 224 && maxChannel - minChannel < 28) {
      data[index + 3] = 0;
    }
  }

  return sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .png()
    .toBuffer();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withNetworkRetries(label, action, attempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.warn(`${label} failed on attempt ${attempt}. Retrying...`, error.message);
        await wait(700 * attempt);
      }
    }
  }
  throw lastError;
}

const categoryConfig = {
  exam: {
    tone: "formal, precise, and reassuring",
    image: "premium modern exam poster background, focused study desk, pencils, sketch sheets, subtle academy setting, editorial lighting, clean empty center for typography, image-only background, no readable text",
  },
  fee: {
    tone: "formal, clear, and urgent without sounding harsh",
    image: "premium fee payment notice poster background, clean administrative finance desk, blank receipt-like shapes without marks, blank calendar cue, subtle payment card and ledger details, strong empty title area, structured lower details area, image-only background, no readable text",
  },
  wishes: {
    tone: "warm, celebratory, and inclusive",
    image: "premium celebration poster background, tasteful festive lights, soft confetti, warm editorial composition, clean typography space, image-only background, no readable text",
  },
  announcement: {
    tone: "bold, concise, and authoritative",
    image: "bold modern announcement poster background, auditorium light beams, dramatic depth, clean negative space, image-only background, no readable text",
  },
  class: {
    tone: "clear, helpful, and academic",
    image: "modern class reminder poster background, classroom details, blank notebook pages, clean academy atmosphere, premium depth of field, image-only background, no readable text",
  },
  timetable: {
    tone: "clear, structured, and easy to scan",
    image: "modern timetable poster background, blank calendar grid inspiration with no letters or numbers, clean modular layout, premium academic planning visual, image-only background, no readable text",
  },
};

  const genrePrompts = {
  modern: "modern clean institutional design, polished campus communication style",
  western: "western contemporary event poster style, refined serif accents, elegant stage lighting",
  classic: "classic traditional poster style, formal ornamental borders, timeless academic look",
  carnatic: "carnatic classical music visual style, veena, mridangam, tanpura, warm concert stage details",
  drawing: "drawing and fine arts visual style, watercolor paper texture, vivid paint splashes, brushes, pencils, sketchbooks, artist palette, premium art academy poster",
  academic: "academic institutional visual style, books, classroom details, organized notice board composition",
};

const designPrompts = {
  classic_header: "modern institutional poster, bold editorial typography area, clean asymmetric blocks, premium academy communication",
  fee_notice: "official fee payment notice design, receipt-inspired blocks, due-date highlight area, neat finance desk cues, high readability, premium institutional payment reminder",
  magenta_classic: "contemporary art academy poster, vibrant but balanced color story, abstract paint textures, premium negative space",
  clean_schedule: "minimal modern schedule poster, modular cards, airy grid system, polished high readability",
  carnatic_practice: "modern performing arts poster, warm stage light, elegant cultural details, premium typography space",
  dark_event: "high contrast modern event poster, cinematic lighting, clean poster composition, luxury contrast",
  all_best: "bright modern exam poster, optimistic academic visual, refined ribbons and subtle paper texture",
};

const topicPrompts = [
  {
    keys: ["drawing", "art", "paint", "painting", "sketch", "colour", "color"],
    prompt: "drawing related imagery with brushes, artist palette, paint splashes, color swatches, sketch paper",
  },
  {
    keys: ["western", "guitar", "piano", "keyboard", "violin", "music"],
    prompt: "western music imagery with piano keys, guitar, violin, stage lights, music notes",
  },
  {
    keys: ["carnatic", "bharatanatyam", "veena", "mridangam", "classical music"],
    prompt: "carnatic classical arts imagery with veena, mridangam, tanpura, traditional concert ambience",
  },
  {
    keys: ["dance", "classical dance"],
    prompt: "performing arts imagery with stage lighting, graceful dance silhouettes, cultural auditorium",
  },
  {
    keys: ["exam", "test", "assessment"],
    prompt: "exam imagery with answer sheets, pens, study desk, calm academic setting",
  },
  {
    keys: ["fee", "payment", "account", "due"],
    prompt: "administrative payment imagery with receipt, office desk, calendar, finance notice style",
  },
  {
    keys: ["timetable", "schedule", "class"],
    prompt: "schedule imagery with calendar grid, classroom board, organized academic planner",
  },
];

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(text, maxChars, maxLines) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
    if (lines.length === maxLines) break;
  }

  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function normalizePosterText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

function sentenceParts(text) {
  const normalized = normalizePosterText(text);
  if (!normalized) return [];
  return normalized.match(/[^.!?]+[.!?]+/g) || [normalized];
}

function completeSentence(text) {
  const normalized = normalizePosterText(text);
  if (!normalized) return "";
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function completeExcerpt(text, maxWords) {
  const stopWords = new Set(["and", "or", "with", "for", "to", "the", "a", "an", "of", "in", "on", "at", "by", "before", "after", "from"]);
  const words = normalizePosterText(text).split(" ").filter(Boolean).slice(0, maxWords);
  while (words.length > 4 && stopWords.has(words[words.length - 1].toLowerCase().replace(/[,.!?;:]+$/, ""))) {
    words.pop();
  }
  return completeSentence(words.join(" "));
}

function fittedTextLines(text, maxChars, maxLines, fallback = "") {
  const normalized = normalizePosterText(text);
  if (!normalized) return [];

  const fullLines = wrapText(normalized, maxChars, maxLines + 1);
  if (fullLines.length <= maxLines) return fullLines;

  let candidate = "";
  for (const sentence of sentenceParts(normalized)) {
    const next = normalizePosterText(`${candidate} ${sentence}`);
    if (wrapText(next, maxChars, maxLines + 1).length > maxLines) break;
    candidate = next;
  }

  if (candidate) return wrapText(candidate, maxChars, maxLines);

  const excerpt = completeExcerpt(normalized, Math.max(8, Math.floor((maxChars * maxLines) / 6.4)));
  const excerptLines = wrapText(excerpt, maxChars, maxLines + 1);
  if (excerptLines.length <= maxLines) return excerptLines;

  const fallbackText = completeSentence(fallback || sentenceParts(normalized)[0] || normalized);
  const fallbackLines = wrapText(fallbackText, maxChars, maxLines + 1);
  if (fallbackLines.length <= maxLines) return fallbackLines;

  return wrapText("Please follow the shared instructions.", maxChars, maxLines);
}

function firstSentences(text, maxSentences) {
  const sentences = String(text || "")
    .replace(/\s+/g, " ")
    .match(/[^.!?]+[.!?]?/g);
  if (!sentences) return text || "";
  return sentences.slice(0, maxSentences).join(" ").trim();
}

function clampNumber(value, min, max, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function isLayerRemoved(fields, layer) {
  return Array.isArray(fields?.removed_layers) && fields.removed_layers.includes(layer);
}

function fieldsForEditBase(fields) {
  const removedLayers = new Set(Array.isArray(fields?.removed_layers) ? fields.removed_layers : []);
  editPreviewOmittedLayers.forEach((layer) => removedLayers.add(layer));
  return {
    ...fields,
    removed_layers: [...removedLayers],
  };
}

function svgTextBlock(lines, x, y, fontSize, fontWeight, fill, lineHeight, anchor = "start", fontFamily = "system-ui, Arial, sans-serif") {
  return lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : lineHeight;
      return `<text x="${x}" y="${y + dy * index}" text-anchor="${anchor}" font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}">${escapeXml(line)}</text>`;
    })
    .join("");
}

function parseGeminiJson(rawText) {
  const cleaned = rawText.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI text provider did not return JSON.");
  const parsed = JSON.parse(match[0]);
  return {
    heading: String(parsed.heading || "").trim(),
    body: String(parsed.body || "").trim(),
    footer: String(parsed.footer || "").trim(),
  };
}

function sanitizePosterCopy(text) {
  return sentenceParts(text)
    .filter((sentence) => !/(visual genre|portrait|landscape|clipart|poster design|background|modern visual|familiarize yourself)/i.test(sentence))
    .join(" ")
    .trim();
}

function fieldLine(fields, keys) {
  return keys
    .map((key) => fields[key])
    .filter(Boolean)
    .join(" | ");
}

function publicAiFields(fields) {
  const keys = [
    "user_title",
    "institution_name",
    "subject",
    "date",
    "time",
    "hall",
    "instructions",
    "amount",
    "due_date",
    "fine",
    "account_details",
    "occasion",
    "from_dept",
    "message",
    "details",
    "issued_by",
    "class_name",
    "room",
    "teacher",
    "batch",
    "department",
    "valid_from",
    "branch",
    "contact_primary",
    "contact_secondary",
  ];
  return keys.reduce((result, key) => {
    if (fields[key]) result[key] = fields[key];
    return result;
  }, {});
}

function publicFieldLine(fields) {
  return fieldLine(publicAiFields(fields), Object.keys(publicAiFields(fields)));
}

function hasPublicPosterText(fields) {
  const scheduleText = Array.isArray(fields.schedule)
    ? fields.schedule.map((period) => Object.values(period || {}).join(" ")).join(" ").trim()
    : "";
  return Boolean(String(fields.user_title || "").trim() || publicFieldLine(fields) || scheduleText);
}

function preferredFieldKey(fields, keys) {
  return keys.find((key) => fields[key]);
}

async function generateAiText(poster, fields) {
  if (fields.manual_heading || fields.manual_body || fields.manual_footer) {
    return {
      heading: sanitizePosterCopy(fields.manual_heading || poster.ai_heading || fields.user_title || ""),
      body: sanitizePosterCopy(fields.manual_body || poster.ai_body || fields.instructions || fields.message || fields.details || ""),
      footer: sanitizePosterCopy(fields.manual_footer || poster.ai_footer || ""),
    };
  }

  if (!hasPublicPosterText(fields)) {
    return { heading: "", body: "", footer: "" };
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const config = categoryConfig[poster.category];

  const prompt = `
Create concise institutional poster copy.
Category: ${poster.category}
Title: ${fields.user_title || ""}
Tone: ${config.tone}
  Input fields: ${JSON.stringify(publicAiFields(fields))}

Return ONLY valid JSON in this exact shape:
{ "heading": "short strong heading", "body": "2 to 4 polished sentences with important details", "footer": "brief closing line or call to action" }
Keep every sentence complete and short enough for a poster. The heading must be under 8 words, the body must be 1 or 2 complete sentences under 22 words total, and the footer must be under 7 words.
Keep the body focused on instructions or context. Do not repeat facts that are already in the input fields such as subject, date, time, venue, room, branch, department, amount, due date, or contact numbers.
Do not include markdown, code fences, commentary, or extra keys.
`;

  console.log("Sending to Groq:", {
    model: "llama-3.3-70b-versatile",
    category: poster.category,
    title: poster.title,
    prompt,
  });

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });
  const rawText = completion.choices[0].message.content;
  const parsed = parseGeminiJson(rawText);
  const cleanHeading = sanitizePosterCopy(parsed.heading);
  const cleanBody = sanitizePosterCopy(parsed.body);
  const cleanFooter = sanitizePosterCopy(parsed.footer);

  return {
    heading: cleanHeading || fields.user_title || "",
    body: cleanBody || fields.instructions || fields.message || fields.details || "",
    footer: cleanFooter || "",
  };
}

function getPosterDimensions(fields) {
  return fields.orientation === "landscape"
    ? { width: 1530, height: 1080 }
    : { width: 1080, height: 1350 };
}

function buildImagePrompt(poster, fields) {
  const seed = `${poster.id}-${poster.category}-${fields.user_title || ""}-${fields.subject || ""}-${fields.visual_genre || ""}`;
  const artDirections = [
    "cinematic soft light, premium editorial poster, shallow depth of field",
    "clean Swiss-inspired composition, bold negative space, modern academy branding",
    "vibrant contemporary collage, tasteful texture, professional event poster",
    "minimal atmospheric background, polished gradients, crisp realistic details",
    "high-end institutional poster background, layered depth, modern color contrast",
  ];
  const inputText = [
    poster.category,
    fields.user_title,
    fields.visual_genre,
    fields.poster_design,
    fields.subject,
    fields.occasion,
    fields.details,
    fields.message,
    fields.class_name,
    fields.department,
    Array.isArray(fields.schedule) ? fields.schedule.map((period) => Object.values(period).join(" ")).join(" ") : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const topicDetails = topicPrompts
    .filter((topic) => topic.keys.some((key) => inputText.includes(key)))
    .map((topic) => topic.prompt);

  const genreDetails = genrePrompts[fields.visual_genre] || genrePrompts.modern;
  const designDetails = designPrompts[resolvePosterDesign(fields, poster)] || designPrompts.classic_header;
  const orientation = fields.orientation === "landscape" ? "landscape 16:9 poster background" : "portrait 4:5 poster background";
  const backgroundKeyword = String(fields.background_keyword || "").trim();
  const suppliedContent = [
    fields.user_title && `title: ${fields.user_title}`,
    fields.institution_name && `institution: ${fields.institution_name}`,
    fields.subject && `subject: ${fields.subject}`,
    fields.occasion && `occasion: ${fields.occasion}`,
    fields.class_name && `class: ${fields.class_name}`,
    fields.details && `details: ${fields.details}`,
    fields.message && `message: ${fields.message}`,
  ].filter(Boolean).join("; ");
  const baseBackground = backgroundKeyword
    ? `background based on this user keyword: ${backgroundKeyword}`
    : categoryConfig[poster.category].image;

  return [
    "generate a studio level poster advertisement background for the supplied contents",
    suppliedContent ? `supplied contents: ${suppliedContent}` : "",
    baseBackground,
    genreDetails,
    designDetails,
    ...topicDetails,
    artDirections[seededIndex(seed, artDirections.length)],
    orientation,
    "studio level ad design, premium commercial poster lighting, modern composition, brand-safe, professional poster background only",
    "image-only background: no readable words, no letters, no numbers, no labels, no fake logos, no signage, no poster-within-poster, no document text, no chart text, no UI text, no watermark, no QR code",
    "leave clear central readable area for typography, high quality, social media ready, print ready, avoid repetitive flat gradients",
  ].join(", ");
}

async function generateImage(prompt, fields = {}) {
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("negative_prompt", "text, words, letters, numbers, typography, logo, watermark, signature, QR code, barcode, signboard, poster, flyer, document, receipt text, calendar numbers, UI, screenshot");
  form.append("output_format", "png");
  form.append("aspect_ratio", fields.orientation === "landscape" ? "16:9" : "4:5");

  console.log("Sending to Stability AI:", {
    url: "https://api.stability.ai/v2beta/stable-image/generate/core",
    method: "POST",
    prompt,
    output_format: "png",
    aspect_ratio: fields.orientation === "landscape" ? "16:9" : "4:5",
  });

  const response = await withNetworkRetries("Stability background request", () => fetch(
      "https://api.stability.ai/v2beta/stable-image/generate/core",
      {
        method: "POST",
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
          Accept: "image/*",
        },
        body: form,
        timeout: 20000,
      }
    ));

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Stability AI error: ${response.status}${body ? ` - ${body.slice(0, 240)}` : ""}`);
  }
  const buffer = await response.buffer();
  return buffer; // returns image as buffer
}

async function generatePollinationsImage(prompt, fields = {}) {
  const { width, height } = getPosterDimensions(fields);
  const encodedPrompt = encodeURIComponent([
    prompt,
    "studio level poster advertisement background",
    "image-only background",
    "no readable words, no letters, no numbers, no logos, no signage, no document text, no watermark, no QR code",
    "clean area for poster typography",
  ].join(", "));
  const seed = seededIndex(`${prompt}-${fields.user_title || ""}-${fields.subject || ""}`, 999999);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=true`;

  console.log("Sending to Pollinations AI:", { url, width, height, seed });

  const response = await withNetworkRetries("Pollinations background request", () => fetch(url, {
    headers: { Accept: "image/*" },
    timeout: 45000,
  }), 2);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Pollinations AI error: ${response.status}${body ? ` - ${body.slice(0, 240)}` : ""}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    const body = await response.text().catch(() => "");
    throw new Error(`Pollinations AI returned non-image response: ${contentType || "unknown"} ${body.slice(0, 160)}`);
  }

  return response.buffer();
}

function buildFallbackBackgroundSvg(poster, fields, width, height) {
  const subject = getSubjectType(fields, poster);
  const seed = `${poster.id}-${poster.category}-${fields.user_title || ""}-${fields.subject || ""}-${fields.background_keyword || ""}`;
  const palette = modernPalettes[seededIndex(seed, modernPalettes.length)];
  const angle = 25 + seededIndex(`${seed}-angle`, 70);
  const textureOpacity = subject === "drawing" ? 0.28 : 0.18;
  const accentTwo = modernPalettes[seededIndex(`${seed}-secondary`, modernPalettes.length)].accent;
  const motif = subject === "drawing"
    ? `<path d="M${width * 0.06} ${height * 0.8} C${width * 0.24} ${height * 0.65}, ${width * 0.35} ${height * 0.84}, ${width * 0.18} ${height * 0.93}" fill="none" stroke="${palette.accent}" stroke-width="${Math.max(10, width * 0.014)}" opacity="0.5"/><circle cx="${width * 0.8}" cy="${height * 0.21}" r="${width * 0.11}" fill="${accentTwo}" opacity="0.18"/>`
    : subject === "music"
      ? `<path d="M${width * 0.12} ${height * 0.76} C${width * 0.28} ${height * 0.66}, ${width * 0.42} ${height * 0.72}, ${width * 0.58} ${height * 0.58}" fill="none" stroke="${palette.accent}" stroke-width="${Math.max(8, width * 0.01)}" opacity="0.42"/><circle cx="${width * 0.82}" cy="${height * 0.18}" r="${width * 0.1}" fill="${accentTwo}" opacity="0.16"/>`
      : `<circle cx="${width * 0.14}" cy="${height * 0.8}" r="${width * 0.13}" fill="${palette.accent}" opacity="0.18"/><rect x="${width * 0.7}" y="${height * 0.14}" width="${width * 0.2}" height="${height * 0.12}" rx="34" fill="${accentTwo}" opacity="0.16"/>`;

  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(${angle})">
      <stop offset="0%" stop-color="${palette.start}"/>
      <stop offset="48%" stop-color="${palette.mid}"/>
      <stop offset="100%" stop-color="${palette.end}"/>
    </linearGradient>
    <pattern id="grain" width="80" height="80" patternUnits="userSpaceOnUse">
      <circle cx="12" cy="16" r="2" fill="#ffffff" opacity="${textureOpacity}"/>
      <circle cx="54" cy="46" r="1.6" fill="#ffffff" opacity="${textureOpacity}"/>
      <path d="M0 78 L80 0" stroke="#ffffff" stroke-width="1" opacity="${textureOpacity * 0.45}"/>
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#grain)" opacity="0.5"/>
  <circle cx="${width * 0.18}" cy="${height * 0.18}" r="${Math.min(width, height) * 0.24}" fill="#ffffff" opacity="0.08"/>
  <circle cx="${width * 0.88}" cy="${height * 0.78}" r="${Math.min(width, height) * 0.22}" fill="#000000" opacity="0.14"/>
  ${motif}
</svg>`;
}

async function createFallbackBackground(poster, fields, width, height, bgDiskPath) {
  console.warn("Using local fallback background because Stability AI did not return an image.");
  await writeSharpToFile(sharp(Buffer.from(buildFallbackBackgroundSvg(poster, fields, width, height)))
    .resize(width, height, { fit: "cover" })
    .jpeg({ quality: 92 }), bgDiskPath);
}

async function generateBackground(poster) {
  const bgFileName = uniquePosterAssetName("bg", poster.id, "jpg");
  const bgDiskPath = path.join(uploadsDir, bgFileName);
  const fields = poster.fields_json || {};
  const { width, height } = getPosterDimensions(fields);
  const backgroundScale = Math.max(1, Math.min(1.4, Number(fields.background_scale || 1)));
  const customBackgroundPath = fields.custom_background_path || "";

  if (customBackgroundPath) {
    try {
      const customBackgroundInput = await readImageInput(customBackgroundPath);
      await writeSharpToFile(sharp(customBackgroundInput)
        .resize(Math.round(width * backgroundScale), Math.round(height * backgroundScale), { fit: "cover" })
        .resize(width, height, { fit: "cover" })
        .jpeg({ quality: 92 }), bgDiskPath);
      const uploaded = await uploadFileToCloudinary(bgDiskPath, {
        publicId: `bg_${poster.id}_${Date.now()}`,
      });

      return {
        bgDiskPath,
        bgPublicPath: uploaded.url,
        bgCloudinaryId: uploaded.publicId,
        fallbackUsed: false,
        customBackgroundUsed: true,
      };
    } catch (error) {
      console.error("Custom background processing failed:", error.message);
    }
  }

  const imagePrompt = buildImagePrompt(poster, fields);
  let fallbackUsed = false;
  let pollinationsUsed = false;
  try {
    const imageBuffer = await generateImage(imagePrompt, fields);

    await writeSharpToFile(sharp(imageBuffer)
      .resize(Math.round(width * backgroundScale), Math.round(height * backgroundScale), { fit: "cover" })
      .resize(width, height, { fit: "cover" })
      .jpeg({ quality: 92 }), bgDiskPath);
  } catch (error) {
    console.error("Stability background generation failed:", error.message);
    try {
      const imageBuffer = await generatePollinationsImage(imagePrompt, fields);
      await writeSharpToFile(sharp(imageBuffer)
        .resize(Math.round(width * backgroundScale), Math.round(height * backgroundScale), { fit: "cover" })
        .resize(width, height, { fit: "cover" })
        .jpeg({ quality: 92 }), bgDiskPath);
      pollinationsUsed = true;
    } catch (pollinationsError) {
      console.error("Pollinations background generation failed:", pollinationsError.message);
      fallbackUsed = true;
      await createFallbackBackground(poster, fields, width, height, bgDiskPath);
    }
  }

  const uploaded = await uploadFileToCloudinary(bgDiskPath, {
    publicId: `bg_${poster.id}_${Date.now()}`,
  });

  return {
    bgDiskPath,
    bgPublicPath: uploaded.url,
    bgCloudinaryId: uploaded.publicId,
    fallbackUsed,
    pollinationsUsed,
    customBackgroundUsed: false,
  };
}

async function createQr(poster, fields) {
  if (!fields.contact_url && !fields.website) {
    return { qrDiskPath: "", qrPublicPath: "" };
  }

  const qrFileName = uniquePosterAssetName("qr", poster.id, "png");
  const qrDiskPath = path.join(uploadsDir, qrFileName);
  const qrData = fields.contact_url || fields.website;

  await QRCode.toFile(qrDiskPath, qrData, {
    width: 360,
    margin: 1,
    color: {
      dark: "#111827",
      light: "#ffffff",
    },
  });

  const uploaded = await uploadFileToCloudinary(qrDiskPath, {
    publicId: `qr_${poster.id}_${Date.now()}`,
  });

  return { qrDiskPath, qrPublicPath: uploaded.url, qrCloudinaryId: uploaded.publicId };
}

function buildDetails(fields, excludedKeys = new Set()) {
  const candidates = [
    ["subject", "Subject"],
    ["date", "Date"],
    ["time", "Time"],
    ["hall", "Hall"],
    ["room", "Room"],
    ["teacher", "Teacher"],
    ["amount", "Amount"],
    ["due_date", "Due Date"],
    ["fine", "Fine"],
    ["issued_by", "Issued by"],
    ["from_dept", "From"],
    ["batch", "Batch"],
    ["department", "Department"],
    ["valid_from", "Valid from"],
    ["branch", "Branch"],
    ["contact_primary", "Contact"],
    ["contact_secondary", "Contact"],
  ];

  const seen = new Set();
  return candidates
    .filter(([key]) => fields[key] && !excludedKeys.has(key))
    .map(([key, label]) => {
      const text = `${label}: ${fields[key]}`;
      const normalized = text.toLowerCase();
      if (seen.has(normalized)) return "";
      seen.add(normalized);
      return text;
    })
    .filter(Boolean);
}

function getLogoSlots(fields, width, height) {
  if (isLayerRemoved(fields, "logo")) return [];
  const logoPaths = Array.isArray(fields.logo_paths) ? fields.logo_paths : [];
  const count = Math.min(5, logoPaths.length);
  if (!count) return [];

  const requestedAlign = ["left", "center", "right"].includes(fields.logo_align) ? fields.logo_align : "center";
  const manualLogoX = Number(fields.logo_x);
  const manualLogoY = Number(fields.logo_y);
  const hasManualLogoPosition = Number.isFinite(manualLogoX) && Number.isFinite(manualLogoY);
  const logoScale = clampNumber(fields.logo_scale, 0.55, 1.8, 1);
  const badgeScale = clampNumber(fields.badge_scale, 0.75, 1.8, 1);
  const badgeHeightScale = clampNumber(fields.badge_height_scale, 0.65, 2, 1);
  const s = Math.min(width / 1080, height / 1350);
  const badgeEnabled = Boolean(fields.badge_enabled);
  const baseLogoSize = Math.round(Math.min(width, height) * (badgeEnabled ? 0.122 : 0.145));
  const size = Math.round(baseLogoSize * logoScale);
  const badgeBaseWidth = Math.round(baseLogoSize * 1.32);
  const badgeBaseBodyHeight = Math.round(baseLogoSize + (badgeEnabled ? 56 : 40) * s);
  const badgeBaseTailHeight = Math.round(baseLogoSize * 0.62);
  const top = Math.round(height * (badgeEnabled ? 0.006 : 0.018));
  const singleLogoAnchor = {
    left: Math.round(width * 0.055),
    center: Math.round(width * 0.5),
    right: Math.round(width * 0.945),
  }[requestedAlign];
  const positions = count === 1
    ? [{
        anchorX: hasManualLogoPosition ? Math.round(width * clampNumber(manualLogoX, 0.03, 0.97, 0.5)) : singleLogoAnchor,
        anchorY: hasManualLogoPosition ? Math.round(height * clampNumber(manualLogoY, 0.03, 0.97, 0.08)) : null,
        top,
        align: hasManualLogoPosition ? "center" : requestedAlign,
      }]
    : Array.from({ length: count }).map((_, index) => {
        const availableWidth = width * 0.74;
        const startX = width * 0.13;
        const step = count > 1 ? availableWidth / (count - 1) : 0;
        return {
          anchorX: Math.round(startX + step * index),
          anchorY: null,
          top,
          align: "center",
        };
      });

  return logoPaths.slice(0, count).map((logoPath, index) => ({
    logoPath,
    anchorX: positions[index].anchorX,
    anchorY: positions[index].anchorY,
    top: positions[index].top,
    align: positions[index].align,
    badge: badgeEnabled ? "shield" : fields.logo_backing ? "circle" : "",
    badgeScale,
    badgeHeightScale,
    padding: Math.round((badgeEnabled ? 28 : 20) * s),
    size,
    badgeWidth: Math.round(badgeBaseWidth * badgeScale),
    badgeBodyHeight: Math.round(badgeBaseBodyHeight * badgeHeightScale),
    badgeTailHeight: Math.round(badgeBaseTailHeight * badgeHeightScale),
  }));
}

async function buildLogoComposites(fields, width, height) {
  const slots = getLogoSlots(fields, width, height);
  const anchoredLeft = (slot, itemWidth) => {
    if (slot.align === "left") return slot.anchorX;
    if (slot.align === "right") return slot.anchorX - itemWidth;
    return Math.round(slot.anchorX - itemWidth / 2);
  };
  const anchoredTop = (slot, itemHeight) => (
    Number.isFinite(slot.anchorY) ? Math.round(slot.anchorY - itemHeight / 2) : slot.top
  );

  return Promise.all(
    slots.map(async (slot) => {
      const logoInput = await readImageInput(slot.logoPath);
      const transparentLogo = await transparentWhiteBackground(logoInput);
      const logoImage = sharp(transparentLogo);
      const metadata = await logoImage.clone().metadata();
      const aspect = metadata.width && metadata.height ? metadata.width / metadata.height : 1;
      const displayWidth = aspect >= 1 ? slot.size : Math.round(slot.size * aspect);
      const displayHeight = aspect >= 1 ? Math.round(slot.size / aspect) : slot.size;
      const logoBuffer = await logoImage
        .resize(displayWidth, displayHeight, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toBuffer();

      if (!slot.badge) return { input: logoBuffer, top: anchoredTop(slot, displayHeight), left: anchoredLeft(slot, displayWidth) };

      const padding = slot.padding || Math.round(slot.size * 0.14);
      const tailHeight = slot.badge === "shield" ? slot.badgeTailHeight || Math.round(slot.size * 0.62) : 0;
      const backingWidth = Math.max(displayWidth + padding * 2, slot.badgeWidth || Math.round(slot.size * 1.32));
      const backingHeight = Math.max(displayHeight + padding * 2 + tailHeight, Math.round((slot.badgeBodyHeight || slot.size + padding * 2) + tailHeight));
      const logoLeft = Math.round((backingWidth - displayWidth) / 2);
      const logoTop = slot.badge === "shield"
        ? Math.round(padding * 0.72)
        : Math.round((backingHeight - displayHeight) / 2);
      const radius = Math.round(Math.min(backingWidth, backingHeight) * 0.06);
      const badgePath = slot.badge === "shield"
        ? `M1 0 H${backingWidth - 1} V${backingHeight - tailHeight} L${Math.round(backingWidth / 2)} ${backingHeight - 1} L1 ${backingHeight - tailHeight} Z`
        : `M${Math.round(backingWidth / 2)} 2 A${Math.round(backingWidth / 2) - 2} ${Math.round(backingHeight / 2) - 2} 0 1 0 ${Math.round(backingWidth / 2)} ${backingHeight - 2} A${Math.round(backingWidth / 2) - 2} ${Math.round(backingHeight / 2) - 2} 0 1 0 ${Math.round(backingWidth / 2)} 2 Z`;
      const circleSvg = Buffer.from(`
        <svg width="${backingWidth}" height="${backingHeight}" viewBox="0 0 ${backingWidth} ${backingHeight}" xmlns="http://www.w3.org/2000/svg">
          <filter id="badgeShadow" x="-20%" y="-12%" width="140%" height="150%">
            <feDropShadow dx="0" dy="14" stdDeviation="12" flood-color="#0f172a" flood-opacity="0.32"/>
          </filter>
          <path d="${badgePath}" fill="#ffffff" opacity="0.98" filter="url(#badgeShadow)"/>
          <path d="${badgePath}" fill="none" stroke="rgba(15,23,42,0.24)" stroke-width="3"/>
          ${slot.badge === "shield" ? `<rect x="2" y="0" width="${backingWidth - 4}" height="${Math.max(20, backingHeight - tailHeight)}" rx="${radius}" fill="#ffffff" opacity="0.18"/>` : ""}
        </svg>
      `);
      const input = await sharp({
        create: {
          width: backingWidth,
          height: backingHeight,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        },
      })
        .composite([
          { input: circleSvg, top: 0, left: 0 },
          { input: logoBuffer, top: logoTop, left: logoLeft },
        ])
        .png()
        .toBuffer();

      return {
        input,
        top: anchoredTop(slot, backingHeight),
        left: anchoredLeft(slot, backingWidth),
      };
    })
  );
}

function getSubjectType(fields, poster) {
  const text = [
    fields.user_title,
    fields.subject,
    fields.visual_genre,
    fields.occasion,
    fields.details,
    fields.message,
    fields.instructions,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/\b(draw|drawing|paint|painting|sketch|art|arts|colour|color)\b/.test(text)) return "drawing";
  if (/(chess|tournament|grandmaster)/.test(text)) return "chess";
  if (/(carnatic|vocal|violin|veena|mridangam|percussion|tabla|drum|drums|bharatham|bharatanatyam|music|song)/.test(text)) return "music";
  return "academic";
}

function getClipartQuery(fields, poster) {
  return String(fields.clipart_keyword || "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function defaultIconForSubject(subject) {
  return {
    drawing: "mdi:palette",
    chess: "mdi:chess-knight",
    music: "mdi:music-clef-treble",
    academic: "mdi:school-outline",
  }[subject] || "mdi:school-outline";
}

async function fetchJson(url) {
  const response = await withNetworkRetries("Iconify search request", () => fetch(url, { headers: { Accept: "application/json" }, timeout: 12000 }));
  if (!response.ok) throw new Error(`Clipart search failed: ${response.status}`);
  return response.json();
}

async function fetchInternetClipartSvg(fields, poster, palette) {
  const subject = getSubjectType(fields, poster);
  const query = getClipartQuery(fields, poster);
  let icon = defaultIconForSubject(subject);

  try {
    const search = await fetchJson(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=1`);
    if (Array.isArray(search.icons) && search.icons[0]) icon = search.icons[0];
  } catch (error) {
    console.warn("Iconify search failed, using mapped internet clipart:", error.message);
  }

  const color = encodeURIComponent(palette.accent || "#c79535");
  const response = await withNetworkRetries("Iconify clipart request", () => fetch(`https://api.iconify.design/${icon}.svg?color=${color}&height=256`, {
    headers: { Accept: "image/svg+xml" },
    timeout: 12000,
  }));
  if (!response.ok) throw new Error(`Clipart fetch failed: ${response.status}`);
  const svg = await response.text();
  if (!svg.includes("<svg")) throw new Error("Clipart provider returned invalid SVG.");
  return svg;
}

async function buildInternetClipartComposites(fields, poster, width, height, palette) {
  if (isLayerRemoved(fields, "clipart")) return { composites: [], used: false };
  if (fields.clipart_source !== "internet" || fields.use_internet_clipart === false || !String(fields.clipart_keyword || "").trim()) {
    return { composites: [], used: false };
  }

  try {
    const clipartScale = clampNumber(fields.clipart_scale, 0.55, 1.35, 0.85);
    const clipartSvg = await fetchInternetClipartSvg(fields, poster, palette);
    const baseSize = Math.round(Math.min(width, height) * 0.11 * clipartScale);
    const primary = await sharp(Buffer.from(clipartSvg))
      .resize(baseSize, baseSize, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
    const manualX = Number(fields.clipart_x);
    const manualY = Number(fields.clipart_y);
    const hasManualPosition = Number.isFinite(manualX) && Number.isFinite(manualY);
    const y = Math.round(height * clampNumber(fields.clipart_y, 0.55, 0.82, 0.68));

    return {
      composites: [
        {
          input: primary,
          top: hasManualPosition ? Math.round(height * clampNumber(manualY, 0.03, 0.97, 0.68) - baseSize / 2) : Math.max(0, y),
          left: hasManualPosition ? Math.round(width * clampNumber(manualX, 0.03, 0.97, 0.16) - baseSize / 2) : Math.round(width * 0.06),
        },
      ],
      used: true,
    };
  } catch (error) {
    console.warn("Internet clipart failed, falling back to local SVG cliparts:", error.message);
    return { composites: [], used: false };
  }
}

async function getLocalDrawingAssets() {
  const drawingDir = path.join(assetsDir, "drawing");
  try {
    const files = await fs.readdir(drawingDir);
    return files
      .filter((file) => /\.(png|jpe?g|webp)$/i.test(file))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((file) => path.join(drawingDir, file));
  } catch (error) {
    console.warn("Local drawing assets unavailable:", error.message);
    return [];
  }
}

async function buildLocalAssetDecorations(fields, poster, width, height, options = {}) {
  if (isLayerRemoved(fields, "clipart")) return { composites: [], used: false };
  const subject = getSubjectType(fields, poster);
  const shouldUseDrawingAssets = fields.clipart_source === "local" && String(fields.clipart_keyword || "").trim();
  if (!shouldUseDrawingAssets) return { composites: [], used: false };

  const assets = await getLocalDrawingAssets();
  if (!assets.length) return { composites: [], used: false };

  const s = Math.min(width / 1080, height / 1350);
  const clipartScale = clampNumber(fields.clipart_scale, 0.55, 1.35, 0.85);
  const manualX = Number(fields.clipart_x);
  const manualY = Number(fields.clipart_y);
  const hasManualPosition = Number.isFinite(manualX) && Number.isFinite(manualY);
  const size = Math.round(Math.min(width, height) * 0.12 * clipartScale);
  const slots = [
    {
      left: hasManualPosition ? Math.round(width * clampNumber(manualX, 0.03, 0.97, 0.16) - size / 2) : Math.round(width * 0.05),
      top: hasManualPosition ? Math.round(height * clampNumber(manualY, 0.03, 0.97, 0.7) - size / 2) : Math.round(height * 0.7),
      size,
      rotate: -8,
    },
  ];

  const composites = await Promise.all(
    assets.slice(0, slots.length).map(async (assetPath, index) => {
      const slot = slots[index];
      const buffer = await sharp(assetPath)
        .resize(slot.size, slot.size, { fit: "inside", background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .rotate(slot.rotate, { background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toBuffer();

      return {
        input: buffer,
        left: Math.max(Math.round(10 * s), slot.left),
        top: Math.max(Math.round(10 * s), slot.top),
      };
    })
  );

  return { composites, used: composites.length > 0 };
}

function buildClipartSvg(fields, poster, width, height, palette) {
  if (isLayerRemoved(fields, "clipart")) return "";
  if (fields.clipart_source !== "local" || !String(fields.clipart_keyword || "").trim()) return "";
  const type = getSubjectType(fields, poster);
  const dark = palette.text || "#10203f";
  const accent = palette.accent || "#c79535";
  const soft = palette.title || "#ffd36b";
  const clipartScale = clampNumber(fields.clipart_scale, 0.75, 1.7, 1.15);
  const clipartX = width * clampNumber(fields.clipart_x, 0.03, 0.97, 0.08);
  const clipartY = height * clampNumber(fields.clipart_y, 0.48, 0.9, 0.72);

  if (type === "drawing") {
    return `
      <g opacity="0.9" transform="translate(${clipartX} ${clipartY}) scale(${clipartScale}) rotate(-18)">
        <rect x="0" y="0" width="210" height="28" rx="14" fill="${accent}"/>
        <rect x="172" y="-18" width="78" height="64" rx="18" fill="#f7f0df" stroke="${dark}" stroke-width="5"/>
        <circle cx="34" cy="-42" r="24" fill="#e63946"/>
        <circle cx="82" cy="-58" r="20" fill="#2a9d8f"/>
        <circle cx="130" cy="-42" r="22" fill="#457b9d"/>
      </g>
      <path d="M${width * 0.78} ${height * 0.67} C${width * 0.86} ${height * 0.62}, ${width * 0.9} ${height * 0.72}, ${width * 0.82} ${height * 0.78}" fill="none" stroke="${accent}" stroke-width="${18 * clipartScale}" stroke-linecap="round" opacity="0.78"/>
    `;
  }

  if (type === "chess") {
    return `
      <g opacity="0.9" transform="translate(${clipartX} ${clipartY}) scale(${clipartScale})">
        <circle cx="70" cy="28" r="26" fill="${accent}"/>
        <rect x="45" y="52" width="50" height="145" rx="14" fill="${accent}"/>
        <rect x="20" y="184" width="100" height="34" rx="8" fill="${accent}"/>
        <rect x="0" y="220" width="140" height="38" rx="10" fill="${dark}"/>
      </g>
      <g opacity="0.55" transform="translate(${width * 0.78} ${height * 0.7}) scale(${0.85 * clipartScale})">
        <circle cx="70" cy="28" r="26" fill="${soft}"/>
        <rect x="45" y="52" width="50" height="145" rx="14" fill="${soft}"/>
        <rect x="20" y="184" width="100" height="34" rx="8" fill="${soft}"/>
        <rect x="0" y="220" width="140" height="38" rx="10" fill="${dark}"/>
      </g>
    `;
  }

  if (type === "music") {
    return `
      <g opacity="0.9" transform="translate(${clipartX} ${clipartY}) scale(${clipartScale})">
        <path d="M90 0 L90 235" stroke="${accent}" stroke-width="22" stroke-linecap="round"/>
        <path d="M90 22 C180 26 190 72 155 108 C133 130 112 148 102 178" fill="none" stroke="${accent}" stroke-width="17" stroke-linecap="round"/>
        <ellipse cx="56" cy="248" rx="58" ry="36" fill="${dark}" transform="rotate(-20 56 248)"/>
      </g>
      <g opacity="0.58" transform="translate(${width * 0.77} ${height * 0.58}) scale(${clipartScale}) rotate(-15)">
        <rect x="70" y="0" width="24" height="285" rx="12" fill="${accent}"/>
        <ellipse cx="80" cy="314" rx="82" ry="116" fill="none" stroke="${accent}" stroke-width="12"/>
        <line x1="42" y1="40" x2="118" y2="340" stroke="${dark}" stroke-width="4"/>
        <line x1="62" y1="36" x2="92" y2="342" stroke="${dark}" stroke-width="4"/>
      </g>
    `;
  }

  return `
    <g opacity="0.55" transform="translate(${clipartX} ${clipartY}) scale(${clipartScale})">
      <rect x="0" y="0" width="170" height="132" rx="14" fill="${accent}"/>
      <rect x="18" y="22" width="134" height="90" rx="8" fill="rgba(255,255,255,0.78)"/>
      <line x1="38" y1="48" x2="132" y2="48" stroke="${dark}" stroke-width="8"/>
      <line x1="38" y1="78" x2="116" y2="78" stroke="${dark}" stroke-width="8"/>
    </g>
  `;
}

function resolvePosterDesign(fields, poster) {
  const requestedDesign = fields.poster_design || "auto";
  if (requestedDesign !== "auto") return requestedDesign;

  if (poster.category === "fee") return "fee_notice";

  const designs = ["classic_header", "magenta_classic", "clean_schedule", "carnatic_practice", "dark_event", "all_best"];
  const seedText = `${poster.id}-${poster.category}-${fields.visual_genre || ""}-${fields.subject || ""}-${fields.user_title || ""}`;
  return designs[seededIndex(seedText, designs.length)];
}

function getHighlightBadges(fields) {
  if (fields.amount || fields.due_date || fields.fine) {
    return [
      fields.amount ? { label: "AMOUNT", icon: "receipt", value: fields.amount, key: "amount" } : null,
      fields.due_date ? { label: "DUE DATE", icon: "calendar", value: fields.due_date, key: "due_date" } : null,
      fields.fine ? { label: "FINE", icon: "receipt", value: fields.fine, key: "fine" } : null,
      fields.branch ? { label: "BRANCH", icon: "pin", value: fields.branch, key: "branch" } : null,
    ].filter(Boolean);
  }

  const dateKey = preferredFieldKey(fields, ["date", "due_date", "valid_from"]);
  const venueKey = preferredFieldKey(fields, ["branch", "venue", "hall", "room", "department"]);
  const badges = [
    dateKey ? { label: "DATE", icon: "calendar", value: fields[dateKey], key: dateKey } : null,
    fields.time ? { label: "TIME", icon: "clock", value: fields.time, key: "time" } : null,
    venueKey ? { label: "VENUE", icon: "pin", value: fields[venueKey], key: venueKey } : null,
  ].filter(Boolean);

  return badges;
}

function lineIconSvg(icon, x, y, size, color) {
  const sw = Math.max(2, Math.round(size * 0.09));
  if (icon === "clock") {
    return `<g fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="${x + size / 2}" cy="${y + size / 2}" r="${size * 0.38}"/>
      <path d="M${x + size / 2} ${y + size * 0.28} V${y + size / 2} L${x + size * 0.67} ${y + size * 0.62}"/>
    </g>`;
  }
  if (icon === "pin") {
    return `<g fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M${x + size / 2} ${y + size * 0.92} C${x + size * 0.18} ${y + size * 0.52}, ${x + size * 0.18} ${y + size * 0.2}, ${x + size / 2} ${y + size * 0.16} C${x + size * 0.82} ${y + size * 0.2}, ${x + size * 0.82} ${y + size * 0.52}, ${x + size / 2} ${y + size * 0.92} Z"/>
      <circle cx="${x + size / 2}" cy="${y + size * 0.43}" r="${size * 0.12}"/>
    </g>`;
  }
  return `<g fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
    <rect x="${x + size * 0.17}" y="${y + size * 0.22}" width="${size * 0.66}" height="${size * 0.62}" rx="${size * 0.08}"/>
    <path d="M${x + size * 0.3} ${y + size * 0.12} V${y + size * 0.3} M${x + size * 0.7} ${y + size * 0.12} V${y + size * 0.3} M${x + size * 0.17} ${y + size * 0.42} H${x + size * 0.83}"/>
    <path d="M${x + size * 0.34} ${y + size * 0.58} H${x + size * 0.66}"/>
  </g>`;
}

function buildHighlightBadges(fields, width, height, s, palette, font, frameX, frameWidth, frameBottom) {
  const badges = getHighlightBadges(fields);
  if (!badges.length) return "";

  const gap = Math.round(14 * s);
  const totalGap = gap * (badges.length - 1);
  const qrReserve = Math.round(Math.min(width, height) * 0.15);
  const badgeWidth = Math.max(Math.round(120 * s), Math.floor((frameWidth - Math.round(110 * s) - qrReserve - totalGap) / badges.length));
  const startX = frameX + Math.round(55 * s);
  const y = frameBottom - Math.round(176 * s);
  return badges.map((badge, index) => {
    const x = startX + index * (badgeWidth + gap);
    const badgeY = y;
    const sizeScale = 1;
    const valueLines = wrapText(badge.value, index === 2 ? 18 : 12, 1);
    return `
      <text x="${x + Math.round(badgeWidth / 2)}" y="${badgeY}" text-anchor="middle" font-family="${palette.bodyFont}" font-size="${font(15 * sizeScale)}" font-weight="900" fill="${palette.accent}">${escapeXml(badge.label)}</text>
      <text x="${x + Math.round(badgeWidth / 2)}" y="${badgeY + Math.round(30 * s * sizeScale)}" text-anchor="middle" font-family="${palette.bodyFont}" font-size="${font(23 * sizeScale)}" font-weight="900" fill="${palette.text}">${escapeXml(valueLines[0] || "")}</text>
    `;
  }).join("");
}

function getDesignPalette(design) {
  const map = {
    classic_header: modernPalettes[0],
    fee_notice: {
      bg: "#07111f",
      panel: "rgba(8,18,34,0.78)",
      title: "#ffffff",
      text: "#f8fafc",
      accent: "#a3e635",
      header: "rgba(255,255,255,0.08)",
      headerText: "#e0f2fe",
      start: "#07111f",
      mid: "#123456",
      end: "#a3e635",
      titleFont: "Arial Black, Impact, system-ui, sans-serif",
      bodyFont: "Inter, Segoe UI, system-ui, Arial, sans-serif",
    },
    magenta_classic: modernPalettes[1],
    clean_schedule: modernPalettes[4],
    carnatic_practice: modernPalettes[3],
    dark_event: modernPalettes[2],
    all_best: modernPalettes[5],
  };
  return map[design] || modernPalettes[0];
}

function normalizeHexColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function applyPaletteOverrides(palette, fields) {
  return {
    ...palette,
    title: normalizeHexColor(fields.title_color, palette.title),
    text: normalizeHexColor(fields.text_color, palette.text),
    accent: normalizeHexColor(fields.accent_color, palette.accent),
    headerText: normalizeHexColor(fields.header_color, palette.headerText),
    panel: fields.panel_color ? normalizeHexColor(fields.panel_color, palette.panel) : palette.panel,
  };
}

function splitExamTitle(title = "", mainTitle = "") {
  const clean = normalizePosterText(title);
  const match = clean.match(/^(.*?)(exam\s+notification|notification|exam)$/i);
  if (match && match[1].trim()) {
    return {
      subheading: match[1].trim(),
      script: match[2].replace(/\b\w/g, (letter) => letter.toUpperCase()),
    };
  }
  return {
    subheading: clean && clean.toLowerCase() !== String(mainTitle || "").toLowerCase() ? clean : "University Grade",
    script: "Exam Notification",
  };
}

function buildDrawingReferenceSvg(poster, fields, aiText) {
  const { width, height } = getPosterDimensions(fields);
  const s = Math.min(width / 1080, height / 1350);
  const textScale = clampNumber(fields.text_scale, 0.75, 1.5, 1);
  const scaled = (value) => Math.round(value * s * textScale);
  const manualPosition = (key, fallbackX, fallbackY) => {
    const manualX = Number(fields[`${key}_x`]);
    const manualY = Number(fields[`${key}_y`]);
    if (Number.isFinite(manualX) && Number.isFinite(manualY)) {
      return {
        x: Math.round(width * clampNumber(manualX, 0.03, 0.97, fallbackX / width)),
        y: Math.round(height * clampNumber(manualY, 0.03, 0.97, fallbackY / height)),
      };
    }
    return { x: Math.round(fallbackX * s), y: Math.round(fallbackY * s) };
  };
  const navy = "#142348";
  const purple = "#55258c";
  const pink = "#cf2a86";
  const orange = "#f97316";
  const blue = "#2563eb";
  const mainTitle = fields.subject || fields.occasion || "Drawing";
  const { subheading, script } = splitExamTitle(fields.user_title || aiText.heading || "", mainTitle);
  const subheadingLines = wrapText(subheading.toUpperCase(), 15, 2);
  const description = sanitizePosterCopy(aiText.body)
    || fields.instructions
    || fields.message
    || "Students are requested to arrive on time and bring all required materials for the examination.";
  const descLines = fittedTextLines(description, 42, 3, "Students are requested to arrive on time.");
  const details = getHighlightBadges(fields);
  const institutionPos = manualPosition("institution", 352, 112);
  const titlePos = manualPosition("title", 58, 475);
  const headingPos = manualPosition("heading", 90, 640);
  const bodyPos = manualPosition("body", 90, 775);
  const detailsPos = manualPosition("details", 82, 912);
  const footerPos = manualPosition("footer", 637, 1265);
  const contactPos = manualPosition("contact", 154, 1301);
  const detailRows = details.map((detail, index) => {
    const layerKey = detail.label.toLowerCase();
    const rowPos = Number.isFinite(Number(fields[`${layerKey}_x`])) && Number.isFinite(Number(fields[`${layerKey}_y`]))
      ? manualPosition(layerKey, 82, 912 + index * 88)
      : {
          x: detailsPos.x,
          y: detailsPos.y + Math.round(index * 88 * s),
        };
    const y = rowPos.y;
    const iconX = rowPos.x;
    const textX = detailsPos.x + Math.round(90 * s);
    const valueLines = wrapText(detail.value, 24, 2);
    return `
      ${lineIconSvg(detail.icon, iconX, y - Math.round(28 * s), Math.round(48 * s), purple)}
      <line x1="${iconX - Math.round(8 * s)}" y1="${y + Math.round(42 * s)}" x2="${iconX + Math.round(323 * s)}" y2="${y + Math.round(42 * s)}" stroke="#d6d3d1" stroke-width="${Math.max(1, Math.round(2 * s))}"/>
      <text x="${textX}" y="${y - Math.round(4 * s)}" font-family="Arial, system-ui, sans-serif" font-size="${scaled(17)}" font-weight="900" fill="${purple}" letter-spacing="1.4">${escapeXml(detail.label)}</text>
      ${valueLines.map((line, lineIndex) => `<text x="${textX}" y="${y + Math.round((30 + lineIndex * 27) * s)}" font-family="Arial Black, Arial, sans-serif" font-size="${scaled(28)}" font-weight="900" fill="#1f2937">${escapeXml(line)}</text>`).join("")}
    `;
  }).join("");
  const showFooter = !isLayerRemoved(fields, "footer");
  const showDetails = !isLayerRemoved(fields, "details");

  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="paintTitle" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#24115f"/>
      <stop offset="38%" stop-color="#c0267b"/>
      <stop offset="74%" stop-color="#ef4444"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
    <filter id="softPaper" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.055"/>
      </feComponentTransfer>
    </filter>
    <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#1f2937" flood-opacity="0.14"/>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="#fffaf1"/>
  <rect width="${width}" height="${height}" filter="url(#softPaper)" opacity="0.55"/>
  <g opacity="0.9">
    <circle cx="${Math.round(900 * s)}" cy="${Math.round(92 * s)}" r="${Math.round(72 * s)}" fill="#ec4899" opacity="0.42"/>
    <circle cx="${Math.round(970 * s)}" cy="${Math.round(170 * s)}" r="${Math.round(98 * s)}" fill="#f97316" opacity="0.48"/>
    <circle cx="${Math.round(1018 * s)}" cy="${Math.round(245 * s)}" r="${Math.round(102 * s)}" fill="#2563eb" opacity="0.44"/>
    <circle cx="${Math.round(890 * s)}" cy="${Math.round(240 * s)}" r="${Math.round(74 * s)}" fill="#facc15" opacity="0.36"/>
    <circle cx="${Math.round(1032 * s)}" cy="${Math.round(1170 * s)}" r="${Math.round(128 * s)}" fill="#60a5fa" opacity="0.35"/>
    <circle cx="${Math.round(940 * s)}" cy="${Math.round(1240 * s)}" r="${Math.round(92 * s)}" fill="#a855f7" opacity="0.25"/>
    ${Array.from({ length: 20 }).map((_, index) => {
      const x = 760 + (index * 47) % 300;
      const y = 70 + (index * 61) % 250;
      const colors = ["#db2777", "#f97316", "#2563eb", "#7c3aed", "#facc15"];
      return `<circle cx="${Math.round(x * s)}" cy="${Math.round(y * s)}" r="${Math.round((4 + (index % 5) * 3) * s)}" fill="${colors[index % colors.length]}" opacity="0.78"/>`;
    }).join("")}
  </g>

  ${!isLayerRemoved(fields, "institution") ? `<text x="${institutionPos.x}" y="${institutionPos.y}" font-family="Arial Black, Arial, sans-serif" font-size="${scaled(36)}" font-weight="900" fill="${navy}" letter-spacing="4">${escapeXml((fields.institution_name || "KFA Music Academy").toUpperCase())}</text>
  <line x1="${institutionPos.x + Math.round(2 * s)}" y1="${institutionPos.y + Math.round(33 * s)}" x2="${institutionPos.x + Math.round(32 * s)}" y2="${institutionPos.y + Math.round(33 * s)}" stroke="${navy}" stroke-width="${Math.round(2 * s)}"/>
  <text x="${institutionPos.x + Math.round(46 * s)}" y="${institutionPos.y + Math.round(39 * s)}" font-family="Arial, system-ui, sans-serif" font-size="${scaled(16)}" font-weight="900" fill="#ef233c" letter-spacing="6">SINCE 2009</text>
  <line x1="${institutionPos.x + Math.round(188 * s)}" y1="${institutionPos.y + Math.round(33 * s)}" x2="${institutionPos.x + Math.round(218 * s)}" y2="${institutionPos.y + Math.round(33 * s)}" stroke="${navy}" stroke-width="${Math.round(2 * s)}"/>` : ""}

  ${!isLayerRemoved(fields, "title") ? `<g>
    <text x="${titlePos.x}" y="${titlePos.y}" font-family="Impact, Arial Black, sans-serif" font-size="${scaled(132)}" font-weight="900" fill="url(#paintTitle)" letter-spacing="2">${escapeXml(mainTitle.toUpperCase())}</text>
    <path d="M${titlePos.x + Math.round(87 * s)} ${titlePos.y + Math.round(37 * s)} C${titlePos.x + Math.round(272 * s)} ${titlePos.y + Math.round(15 * s)}, ${titlePos.x + Math.round(462 * s)} ${titlePos.y + Math.round(37 * s)}, ${titlePos.x + Math.round(666 * s)} ${titlePos.y + Math.round(8 * s)}" fill="none" stroke="${pink}" stroke-width="${Math.round(8 * s)}" stroke-linecap="round"/>
  </g>` : ""}

  ${!isLayerRemoved(fields, "heading") ? `${subheadingLines.map((line, index) => `<text x="${headingPos.x}" y="${headingPos.y + index * Math.round(48 * s)}" font-family="Arial Black, Arial, sans-serif" font-size="${scaled(46)}" font-weight="900" fill="${navy}" letter-spacing="1">${escapeXml(line)}</text>`).join("")}
  <text x="${headingPos.x + Math.round(6 * s)}" y="${headingPos.y + Math.round((subheadingLines.length * 48 + 20) * s)}" font-family="Brush Script MT, Segoe Script, cursive" font-size="${scaled(50)}" font-weight="400" fill="${pink}">${escapeXml(script)}</text>
  <line x1="${headingPos.x + Math.round(80 * s)}" y1="${headingPos.y + Math.round((subheadingLines.length * 48 + 40) * s)}" x2="${headingPos.x + Math.round(475 * s)}" y2="${headingPos.y + Math.round((subheadingLines.length * 48 + 40) * s)}" stroke="${orange}" stroke-width="${Math.round(2 * s)}"/>` : ""}

  ${!isLayerRemoved(fields, "body") ? `<g transform="translate(${bodyPos.x} ${bodyPos.y})">
    <rect x="4" y="10" width="${Math.round(52 * s)}" height="${Math.round(62 * s)}" rx="${Math.round(6 * s)}" fill="none" stroke="${purple}" stroke-width="${Math.round(4 * s)}"/>
    <path d="M${Math.round(18 * s)} 8 H${Math.round(42 * s)} V${Math.round(20 * s)} H${Math.round(18 * s)} Z" fill="none" stroke="${purple}" stroke-width="${Math.round(4 * s)}"/>
    <path d="M${Math.round(20 * s)} ${Math.round(38 * s)} H${Math.round(42 * s)} M${Math.round(20 * s)} ${Math.round(52 * s)} H${Math.round(38 * s)}" stroke="${purple}" stroke-width="${Math.round(3 * s)}"/>
    ${svgTextBlock(descLines, Math.round(102 * s), Math.round(28 * s), scaled(26), 500, "#1f2937", Math.round(34 * s), "start", "Segoe UI, Arial, sans-serif")}
  </g>` : ""}

  <g filter="url(#softShadow)">
    <ellipse cx="${Math.round(798 * s)}" cy="${Math.round(1006 * s)}" rx="${Math.round(172 * s)}" ry="${Math.round(39 * s)}" fill="#c084fc" opacity="0.22"/>
    <rect x="${Math.round(825 * s)}" y="${Math.round(602 * s)}" width="${Math.round(126 * s)}" height="${Math.round(365 * s)}" rx="${Math.round(22 * s)}" fill="#b08358"/>
    <rect x="${Math.round(842 * s)}" y="${Math.round(618 * s)}" width="${Math.round(92 * s)}" height="${Math.round(330 * s)}" rx="${Math.round(16 * s)}" fill="#8b5e3c"/>
    ${[0, 1, 2, 3, 4].map((item, index) => {
      const x = 750 + index * 52;
      const h = 300 + (index % 2) * 62;
      const colors = ["#7c2d12", "#f97316", "#2563eb", "#111827", "#dc2626"];
      return `<g transform="rotate(${[-10, -4, 6, 12, 18][index]} ${Math.round(x * s)} ${Math.round(850 * s)})">
        <rect x="${Math.round(x * s)}" y="${Math.round((650 - h * 0.18) * s)}" width="${Math.round(18 * s)}" height="${Math.round(h * s)}" rx="${Math.round(8 * s)}" fill="${colors[index]}"/>
        <path d="M${Math.round(x * s)} ${Math.round((650 - h * 0.18) * s)} L${Math.round((x + 9) * s)} ${Math.round((610 - h * 0.18) * s)} L${Math.round((x + 18) * s)} ${Math.round((650 - h * 0.18) * s)} Z" fill="#f8dfb7"/>
      </g>`;
    }).join("")}
    <rect x="${Math.round(600 * s)}" y="${Math.round(970 * s)}" width="${Math.round(308 * s)}" height="${Math.round(76 * s)}" rx="${Math.round(18 * s)}" fill="#f8fafc" transform="rotate(-12 ${Math.round(754 * s)} ${Math.round(1008 * s)})"/>
    ${["#facc15", "#fb923c", "#7c2d12", "#dc2626", "#7c3aed", "#2563eb"].map((color, index) => `<rect x="${Math.round((626 + index * 42) * s)}" y="${Math.round((982 + (index % 2) * 6) * s)}" width="${Math.round(35 * s)}" height="${Math.round(26 * s)}" rx="${Math.round(7 * s)}" fill="${color}" transform="rotate(-12 ${Math.round(754 * s)} ${Math.round(1008 * s)})"/>`).join("")}
    <rect x="${Math.round(690 * s)}" y="${Math.round(1052 * s)}" width="${Math.round(320 * s)}" height="${Math.round(145 * s)}" rx="${Math.round(10 * s)}" fill="#fffaf1" transform="rotate(10 ${Math.round(850 * s)} ${Math.round(1120 * s)})"/>
    <path d="M${Math.round(760 * s)} ${Math.round(1135 * s)} C${Math.round(840 * s)} ${Math.round(1085 * s)}, ${Math.round(890 * s)} ${Math.round(1092 * s)}, ${Math.round(930 * s)} ${Math.round(1162 * s)}" fill="none" stroke="#16a34a" stroke-width="${Math.round(5 * s)}"/>
    <ellipse cx="${Math.round(890 * s)}" cy="${Math.round(1118 * s)}" rx="${Math.round(42 * s)}" ry="${Math.round(20 * s)}" fill="#ec4899" opacity="0.72" transform="rotate(25 ${Math.round(890 * s)} ${Math.round(1118 * s)})"/>
  </g>

  ${showDetails ? `<g>
    ${detailRows}
  </g>` : ""}

  ${showFooter && !isLayerRemoved(fields, "contact") ? `<g transform="translate(${contactPos.x - Math.round(70 * s)} ${contactPos.y - Math.round(54 * s)})">
    <circle cx="${Math.round(24 * s)}" cy="${Math.round(24 * s)}" r="${Math.round(24 * s)}" fill="${purple}"/>
    <path d="M${Math.round(16 * s)} ${Math.round(15 * s)} C${Math.round(32 * s)} ${Math.round(32 * s)}, ${Math.round(18 * s)} ${Math.round(16 * s)}, ${Math.round(35 * s)} ${Math.round(34 * s)}" fill="none" stroke="#ffffff" stroke-width="${Math.round(4 * s)}" stroke-linecap="round"/>
    <text x="${Math.round(70 * s)}" y="${Math.round(18 * s)}" font-family="Arial, system-ui, sans-serif" font-size="${scaled(16)}" font-weight="900" fill="${purple}" letter-spacing="1">FOR MORE DETAILS</text>
    <text x="${Math.round(70 * s)}" y="${Math.round(54 * s)}" font-family="Arial Black, Arial, sans-serif" font-size="${scaled(34)}" font-weight="900" fill="#1f2937">${escapeXml([fields.contact_primary, fields.contact_secondary].filter(Boolean).join("  |  "))}</text>
  </g>` : ""}

  ${showFooter && !isLayerRemoved(fields, "qr") ? `<text x="${footerPos.x}" y="${footerPos.y}" font-family="Segoe UI, Arial, sans-serif" font-size="${scaled(34)}" font-weight="800" fill="${purple}">Scan QR</text>
  <text x="${footerPos.x + Math.round(43 * s)}" y="${footerPos.y + Math.round(33 * s)}" font-family="Segoe UI, Arial, sans-serif" font-size="${scaled(22)}" fill="#1f2937">for Location</text>
  <path d="M${footerPos.x + Math.round(158 * s)} ${footerPos.y + Math.round(7 * s)} C${footerPos.x + Math.round(188 * s)} ${footerPos.y - Math.round(5 * s)}, ${footerPos.x + Math.round(211 * s)} ${footerPos.y + Math.round(3 * s)}, ${footerPos.x + Math.round(225 * s)} ${footerPos.y + Math.round(23 * s)}" fill="none" stroke="${purple}" stroke-width="${Math.round(4 * s)}" stroke-linecap="round"/>` : ""}
</svg>`;
}

function buildPosterSvg(poster, fields, aiText, options = {}) {
  const { width, height } = getPosterDimensions(fields);
  const landscape = width > height;
  const s = Math.min(width / 1080, height / (landscape ? 1080 : 1350));
  const textScale = clampNumber(fields.text_scale, 0.75, 1.5, 1.15);
  const font = (value) => Math.round(value * textScale * (landscape ? 0.9 : 1) * s);
  const layerFont = (key, value) => {
    const scale = clampNumber(fields[`${key}_scale`], 0.75, 1.7, 1);
    return Math.round(font(value) * scale);
  };
  if (!landscape && getSubjectType(fields, poster) === "drawing") {
    return buildDrawingReferenceSvg(poster, fields, aiText);
  }
  {
    const modernDesign = resolvePosterDesign(fields, poster);
    const seed = `${poster.id}-${poster.category}-${fields.user_title || ""}-${fields.subject || ""}-${modernDesign}`;
    const basePalette = modernPalettes[seededIndex(seed, modernPalettes.length)];
    const fontPair = fontPairings[seededIndex(`${seed}-font`, fontPairings.length)];
    const palette = applyPaletteOverrides({ ...basePalette, ...getDesignPalette(modernDesign), ...fontPair }, fields);
    const frameX = Math.round(width * 0.075);
    const logoCount = getLogoSlots(fields, width, height).length;
    const frameTop = Math.round(height * (logoCount ? 0.155 : 0.06));
    const frameWidth = Math.round(width * 0.85);
    const frameBottom = height - Math.round(height * 0.065);
    const frameHeight = frameBottom - frameTop;
    const layoutVariant = seededIndex(`${seed}-layout`, 3);
    const textAnchor = layoutVariant === 1 ? "start" : "middle";
    const textX = textAnchor === "start" ? frameX + Math.round(frameWidth * 0.12) : frameX + Math.round(frameWidth * 0.5);
    const layoutY = (key, min, max, fallback) => Math.round(height * clampNumber(fields[key], min, max, fallback));
    const hasManualX = (key) => Number.isFinite(Number(fields[`${key}_x`]));
    const layoutX = (key, fallback) => {
      const manualValue = Number(fields[`${key}_x`]);
      if (Number.isFinite(manualValue)) {
        return Math.round(width * clampNumber(manualValue, 0.03, 0.97, fallback / width));
      }
      return fallback;
    };
    const hasManualPosition = (key) => Number.isFinite(Number(fields[`${key}_x`])) && Number.isFinite(Number(fields[`${key}_y`]));
    const layoutPoint = (key, fallbackX, fallbackY) => ({
      x: layoutX(key, fallbackX),
      y: layoutY(`${key}_y`, 0.03, 0.97, fallbackY / height),
      manual: hasManualPosition(key),
    });
    const blockAnchor = (key) => {
      if (!hasManualX(key)) return textAnchor;
      const manualValue = Number(fields[`${key}_x`] || 0.5);
      if (manualValue < 0.24) return "start";
      if (manualValue > 0.76) return "end";
      return textAnchor;
    };
    const titleY = layoutY("title_y", 0.17, 0.44, 0.28);
    const headingY = layoutY("heading_y", 0.34, 0.66, 0.46);
    const bodyY = layoutY("body_y", 0.44, 0.76, 0.55);
    const detailsY = layoutY("details_y", 0.56, 0.84, 0.68);
    const footerY = layoutY("footer_y", 0.72, 0.92, 0.83);
    const institutionX = layoutX("institution", textX);
    const institutionY = layoutY("institution_y", 0.05, 0.3, (frameTop + Math.round(72 * s)) / height);
    const titleX = layoutX("title", textX);
    const headingX = layoutX("heading", textX);
    const bodyX = layoutX("body", textX);
    const detailsX = layoutX("details", textX);
    const footerX = layoutX("footer", fields.contact_url || fields.website ? frameX + Math.round(frameWidth * 0.67) : textX);
    const institutionLines = isLayerRemoved(fields, "institution") ? [] : wrapText(fields.institution_name || "", landscape ? 42 : 30, 2);
    const mainTitleKey = preferredFieldKey(fields, ["subject", "occasion", "class_name"]);
    const mainTitle = isLayerRemoved(fields, "title") ? "" : fields[mainTitleKey] || fields.user_title || "";
    const titleLines = isLayerRemoved(fields, "title") ? [] : wrapText(mainTitle.toUpperCase(), landscape ? 22 : textAnchor === "start" ? 12 : 13, 3);
    const headingLines = isLayerRemoved(fields, "heading") ? [] : fittedTextLines(aiText.heading || "", landscape ? 30 : textAnchor === "start" ? 19 : 20, 2, fields.user_title || mainTitle);
    const bodyLines = isLayerRemoved(fields, "body") ? [] : fittedTextLines(firstSentences(aiText.body, 1), landscape ? 58 : textAnchor === "start" ? 33 : 38, 3, fields.instructions || fields.message || "Please follow the shared instructions.");
    const footerText = fields.contact_url ? "Scan QR for location" : aiText.footer;
    const footerLines = isLayerRemoved(fields, "footer") ? [] : wrapText(footerText, landscape ? 40 : 28, 1);
    const highlightedKeys = new Set(getHighlightBadges(fields).map((badge) => badge.key));
    if (mainTitleKey) highlightedKeys.add(mainTitleKey);
    highlightedKeys.add("contact_primary");
    highlightedKeys.add("contact_secondary");
    const isScheduleLayout = modernDesign === "clean_schedule" && Array.isArray(fields.schedule);
    const detailLines = isLayerRemoved(fields, "details") || isScheduleLayout
      ? []
      : buildDetails(fields, highlightedKeys).slice(0, landscape ? 4 : 5);
    const titleLineHeight = Math.round((landscape ? 78 : 92) * s);
    const headingLineHeight = Math.round(54 * s);
    const bodyLineHeight = Math.round(42 * s);
    const detailLineHeight = Math.round(46 * s);
    const safeTitleY = hasManualX("title") ? titleY : Math.max(titleY, frameTop + Math.round((institutionLines.length ? 165 : 130) * s));
    const safeHeadingY = hasManualX("heading") ? headingY : Math.max(headingY, safeTitleY + Math.max(1, titleLines.length) * titleLineHeight + Math.round(28 * s));
    const safeBodyY = hasManualX("body") ? bodyY : Math.max(bodyY, safeHeadingY + Math.max(1, headingLines.length) * headingLineHeight + Math.round(20 * s));
    const badgeTopY = footerY - Math.round((landscape ? 58 : 236) * s);
    const detailMaxY = badgeTopY - Math.max(1, detailLines.length) * detailLineHeight - Math.round(20 * s);
    const detailMinY = safeBodyY + Math.max(1, bodyLines.length) * bodyLineHeight + Math.round(34 * s);
    const safeDetailsY = hasManualX("details")
      ? detailsY
      : Math.max(detailMinY, Math.min(detailsY, detailMaxY));
    const cliparts = options.includeLocalClipart === false ? "" : buildClipartSvg(fields, poster, width, height, palette);
    const badgeItems = isScheduleLayout
      ? []
      : getHighlightBadges(fields).filter((badge) => !isLayerRemoved(fields, badge.label.toLowerCase()));
    const badgeGap = Math.round(14 * s);
    const qrReserve = fields.contact_url || fields.website ? Math.round(Math.min(width, height) * 0.17) : 0;
    const badgeAreaWidth = frameWidth - qrReserve - Math.round(20 * s);
    const badgeWidth = Math.round((badgeAreaWidth - badgeGap * Math.max(0, badgeItems.length - 1)) / Math.max(1, badgeItems.length));
    const badgeSvg = badgeItems.map((badge, index) => {
      const verticalInfo = !landscape;
      const sizeScale = 1;
      const itemWidth = verticalInfo ? Math.round(frameWidth * 0.44) : badgeWidth;
      const layerKey = badge.label.toLowerCase();
      const layerScale = clampNumber(fields[`${layerKey}_scale`], 0.75, 1.7, 1);
      const fallbackX = verticalInfo ? frameX + Math.round(38 * s) : frameX + index * (badgeWidth + badgeGap);
      const fallbackY = verticalInfo ? footerY - Math.round(210 * s) + index * Math.round(90 * s) : footerY;
      const manualBadgePoint = layoutPoint(layerKey, fallbackX + Math.round(itemWidth / 2), fallbackY + Math.round(38 * s));
      const x = manualBadgePoint.manual ? manualBadgePoint.x - Math.round(itemWidth / 2) : fallbackX;
      const itemY = manualBadgePoint.manual ? manualBadgePoint.y - Math.round(38 * s) : fallbackY;
      const iconSize = Math.round(42 * s * sizeScale * layerScale);
      const iconX = x + Math.round(6 * s);
      const textLeft = x + Math.round(58 * s);
      const valueLines = wrapText(badge.value, verticalInfo ? 21 : 14, 2);
      return `
        <line x1="${x}" y1="${itemY - Math.round(10 * s)}" x2="${x + itemWidth - Math.round(10 * s)}" y2="${itemY - Math.round(10 * s)}" stroke="${palette.accent}" stroke-width="${Math.max(2, Math.round(3 * s))}" opacity="0.62"/>
        ${lineIconSvg(badge.icon, iconX, itemY + Math.round(16 * s), iconSize, palette.accent)}
        <text x="${textLeft}" y="${itemY + Math.round(28 * s * sizeScale * layerScale)}" text-anchor="start" font-family="${palette.bodyFont}" font-size="${layerFont(layerKey, 15 * sizeScale)}" font-weight="950" fill="${palette.accent}">${escapeXml(badge.label)}</text>
        ${valueLines.map((line, lineIndex) => `<text x="${textLeft}" y="${itemY + Math.round((62 * sizeScale * layerScale + lineIndex * 29 * sizeScale * layerScale) * s)}" text-anchor="start" font-family="${palette.bodyFont}" font-size="${layerFont(layerKey, (verticalInfo ? 23 : 25) * sizeScale)}" font-weight="950" fill="${palette.text}">${escapeXml(line)}</text>`).join("")}
      `;
    }).join("");
    const detailText = detailLines
      .map((line, index) => `<text x="${detailsX}" y="${safeDetailsY + index * detailLineHeight}" text-anchor="${blockAnchor("details")}" font-family="${palette.bodyFont}" font-size="${layerFont("details", 28)}" font-weight="850" fill="${palette.text}" opacity="0.96">${escapeXml(line)}</text>`)
      .join("");
    const scheduleRows = isScheduleLayout && !isLayerRemoved(fields, "schedule")
      ? fields.schedule
          .filter((period) => Object.values(period || {}).some(Boolean))
          .slice(0, landscape ? 4 : 3)
      : [];
    const scheduleTop = Math.max(
      safeBodyY + Math.max(1, bodyLines.length) * bodyLineHeight + Math.round(44 * s),
      Math.round(height * (landscape ? 0.5 : 0.56))
    );
    const scheduleRowHeight = Math.round((landscape ? 54 : 66) * s);
    const scheduleGap = Math.round(12 * s);
    const scheduleSvg = scheduleRows.map((period, index) => {
      const y = scheduleTop + index * (scheduleRowHeight + scheduleGap);
      const rowX = frameX + Math.round(42 * s);
      const rowW = frameWidth - Math.round(84 * s);
      const leftW = Math.round(rowW * 0.32);
      const subject = [period.subject, period.faculty && `- ${period.faculty}`].filter(Boolean).join(" ");
      const meta = [period.time, period.room].filter(Boolean).join("  |  ");
      return `
        <rect x="${rowX}" y="${y}" width="${rowW}" height="${scheduleRowHeight}" rx="${Math.round(14 * s)}" fill="rgba(255,255,255,0.14)" stroke="${palette.accent}" stroke-width="${Math.max(1, Math.round(2 * s))}" opacity="0.94"/>
        <rect x="${rowX}" y="${y}" width="${leftW}" height="${scheduleRowHeight}" rx="${Math.round(14 * s)}" fill="${palette.accent}" opacity="0.9"/>
        <text x="${rowX + Math.round(leftW / 2)}" y="${y + Math.round(scheduleRowHeight * 0.62)}" text-anchor="middle" font-family="${palette.bodyFont}" font-size="${font(22)}" font-weight="950" fill="${palette.bg}">${escapeXml(period.day || "Class")}</text>
        <text x="${rowX + leftW + Math.round(24 * s)}" y="${y + Math.round(scheduleRowHeight * 0.44)}" font-family="${palette.bodyFont}" font-size="${font(23)}" font-weight="950" fill="${palette.text}">${escapeXml(subject || "Class")}</text>
        <text x="${rowX + leftW + Math.round(24 * s)}" y="${y + Math.round(scheduleRowHeight * 0.76)}" font-family="${palette.bodyFont}" font-size="${font(17)}" font-weight="800" fill="${palette.text}" opacity="0.82">${escapeXml(meta)}</text>
      `;
    }).join("");
    const contactPoint = layoutPoint("contact", frameX, frameBottom - Math.round(18 * s));
    const contacts = [fields.contact_primary, fields.contact_secondary].filter(Boolean).length && !isLayerRemoved(fields, "contact")
      ? `<text x="${contactPoint.x}" y="${contactPoint.y}" text-anchor="${contactPoint.manual ? "middle" : "start"}" font-family="${palette.bodyFont}" font-size="${font(32)}" font-weight="950" fill="${palette.text}">${escapeXml([fields.contact_primary, fields.contact_secondary].filter(Boolean).join("  |  "))}</text>`
      : "";
    const resolvedFooterY = isScheduleLayout
      ? frameBottom - Math.round(142 * s)
      : hasManualX("footer")
        ? footerY
        : Math.min(frameBottom - Math.round(128 * s), footerY - Math.round(52 * s));
    const footer = footerLines.length
      ? svgTextBlock(footerLines, footerX, resolvedFooterY, layerFont("footer", 34), 950, palette.accent, Math.round(42 * s), hasManualX("footer") || fields.contact_url || fields.website ? "middle" : textAnchor, palette.bodyFont)
      : "";
    const accentStripeX = seededIndex(`${seed}-stripe`, 2) === 0 ? frameX : frameX + frameWidth - Math.round(10 * s);

    return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.34"/>
      <stop offset="55%" stop-color="${palette.bg}" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.6"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#shade)"/>
  <rect x="${frameX}" y="${frameTop}" width="${frameWidth}" height="${frameHeight}" rx="${Math.round(34 * s)}" fill="${palette.panel}" stroke="rgba(255,255,255,0.22)" stroke-width="${Math.max(2, Math.round(2 * s))}"/>
  <rect x="${accentStripeX}" y="${frameTop + Math.round(42 * s)}" width="${Math.round(10 * s)}" height="${Math.round(frameHeight * 0.34)}" rx="${Math.round(8 * s)}" fill="${palette.accent}"/>
  <circle cx="${frameX + Math.round(frameWidth * 0.88)}" cy="${frameTop + Math.round(frameHeight * 0.14)}" r="${Math.round(width * 0.08)}" fill="${palette.accent}" opacity="0.16"/>
  <circle cx="${frameX + Math.round(frameWidth * 0.14)}" cy="${frameTop + Math.round(frameHeight * 0.86)}" r="${Math.round(width * 0.09)}" fill="#ffffff" opacity="0.08"/>
  ${cliparts}
  ${institutionLines.length ? svgTextBlock(institutionLines, institutionX, hasManualX("institution") ? institutionY : frameTop + Math.round(72 * s), layerFont("institution", institutionLines.length > 1 ? 32 : 39), 950, palette.headerText, Math.round(42 * s), blockAnchor("institution"), palette.bodyFont) : ""}
  ${titleLines.length ? svgTextBlock(titleLines, titleX, safeTitleY, layerFont("title", landscape ? 76 : 92), 950, palette.title, titleLineHeight, blockAnchor("title"), palette.titleFont) : ""}
  ${headingLines.length ? svgTextBlock(headingLines, headingX, safeHeadingY, layerFont("heading", 48), 950, palette.text, headingLineHeight, blockAnchor("heading"), palette.bodyFont) : ""}
  ${bodyLines.length ? svgTextBlock(bodyLines, bodyX, safeBodyY, layerFont("body", 33), 850, palette.text, bodyLineHeight, blockAnchor("body"), palette.bodyFont) : ""}
  ${scheduleSvg}
  ${detailText}
  ${footer}
  ${badgeSvg}
  ${contacts}
</svg>`;
  }
  const cx = width / 2;
  const design = resolvePosterDesign(fields, poster);
  const logoSlots = getLogoSlots(fields, width, height);
  const hasLogos = logoSlots.length > 0;
  const fiveLogoHeader = logoSlots.length === 5;
  const headerHeight = fiveLogoHeader ? Math.round(height * (landscape ? 0.22 : 0.18)) : Math.round(height * (hasLogos ? 0.12 : 0.09));
  const frameX = Math.round(width * 0.07);
  const frameTop = Math.round(18 * s);
  const frameWidth = Math.round(width * 0.86);
  const frameBottom = height - Math.round(34 * s);
  const frameHeight = frameBottom - frameTop;
  const footerBase = frameBottom - Math.round(34 * s);
  const layoutY = (key, min, max, fallback) => Math.round(height * clampNumber(fields[key], min, max, fallback));
  const titleControlY = layoutY("title_y", 0.15, 0.44, (headerHeight + Math.round(125 * s)) / height);
  const headingControlY = layoutY("heading_y", 0.32, 0.64, 0.445);
  const bodyControlY = layoutY("body_y", 0.4, 0.74, 0.515);
  const detailsControlY = layoutY("details_y", 0.5, 0.82, 0.62);
  const footerY = layoutY("footer_y", 0.7, 0.93, (frameBottom - Math.round(210 * s)) / height);
  const institution = fields.institution_name || "";
  const institutionLines = wrapText(institution, landscape ? 44 : 30, 2);
  const dateText = fields.date || fields.due_date || fields.valid_from || "";
  const timeText = fields.time || "";
  const mainTitleKey = preferredFieldKey(fields, ["subject", "occasion", "class_name"]);
  const mainTitle = fields[mainTitleKey] || fields.user_title || "";
  const mainTitleLines = wrapText(mainTitle.toUpperCase(), landscape ? 24 : 15, 3);
  const headingLines = wrapText(aiText.heading || "", landscape ? 30 : 20, 2);
  const bodyLines = wrapText(firstSentences(aiText.body, 1), landscape ? 52 : 34, landscape ? 2 : 2);
  const footerText = fields.contact_url ? "Scan QR for location" : aiText.footer;
  const footerLines = wrapText(footerText, landscape ? 40 : 28, 1);
  const contactNumbers = [fields.contact_primary, fields.contact_secondary].filter(Boolean);
  const palette = applyPaletteOverrides(getDesignPalette(design), fields);
  const highlightedKeys = new Set(getHighlightBadges(fields).map((badge) => badge.key));
  if (mainTitleKey) highlightedKeys.add(mainTitleKey);
  highlightedKeys.add("contact_primary");
  highlightedKeys.add("contact_secondary");
  const detailLines = buildDetails(fields, highlightedKeys).slice(0, landscape ? 4 : 5);
  const titleLineHeight = Math.round(78 * s);
  const headingLineHeight = Math.round(52 * s);
  const bodyLineHeight = Math.round(36 * s);
  const detailLineHeight = Math.round(42 * s);
  const safeHeadingY = Math.max(headingControlY, titleControlY + Math.round(90 * s) + Math.max(1, mainTitleLines.length) * titleLineHeight + Math.round(38 * s));
  const safeBodyY = Math.max(bodyControlY, safeHeadingY + Math.max(1, headingLines.length) * headingLineHeight + Math.round(20 * s));
  const detailMaxY = footerY - Math.max(1, detailLines.length) * detailLineHeight - Math.round(48 * s);
  const safeDetailsY = Math.max(
    safeBodyY + Math.max(1, bodyLines.length) * bodyLineHeight + Math.round(28 * s),
    Math.min(detailsControlY, detailMaxY)
  );

  const notchWidth = Math.round(width * 0.28);
  const notchDepth = fiveLogoHeader ? Math.round(headerHeight * 0.42) : 0;
  const notchStart = Math.round((width - notchWidth) / 2);
  const notchEnd = notchStart + notchWidth;
  const notchMid = Math.round(width / 2);
  const header = `
    ${fiveLogoHeader ? `<path d="M${frameX} ${frameTop} H${frameX + frameWidth} V${frameTop + headerHeight} H${notchEnd} C${notchEnd - Math.round(width * 0.035)} ${frameTop + headerHeight + Math.round(notchDepth * 0.24)}, ${notchMid + Math.round(width * 0.09)} ${frameTop + headerHeight + Math.round(notchDepth * 0.36)}, ${notchMid + Math.round(width * 0.055)} ${frameTop + headerHeight + Math.round(notchDepth * 0.74)} L${notchMid} ${frameTop + headerHeight + notchDepth} L${notchMid - Math.round(width * 0.055)} ${frameTop + headerHeight + Math.round(notchDepth * 0.74)} C${notchMid - Math.round(width * 0.09)} ${frameTop + headerHeight + Math.round(notchDepth * 0.36)}, ${notchStart + Math.round(width * 0.035)} ${frameTop + headerHeight + Math.round(notchDepth * 0.24)}, ${notchStart} ${frameTop + headerHeight} H${frameX} Z" fill="${palette.header}"/>` : ""}
    ${institutionLines.length ? svgTextBlock(institutionLines, cx, fiveLogoHeader ? frameTop + headerHeight - Math.round((institutionLines.length > 1 ? 62 : 36) * s) : Math.round(headerHeight + 34 * s), font(institutionLines.length > 1 ? 30 : 36), 900, fiveLogoHeader ? palette.headerText : palette.title, Math.round(42 * s), "middle") : ""}
  `;

  const contacts = contactNumbers.length
    ? contactNumbers.map((contact, index) => {
      const x = contactNumbers.length === 1
        ? frameX + Math.round(54 * s)
        : frameX + Math.round(54 * s) + index * Math.round(250 * s);
      return `<text x="${x}" y="${footerBase}" font-family="${palette.bodyFont}" font-size="${font(24)}" font-weight="900" fill="${palette.text}">${escapeXml(contact)}</text>`;
    }).join("")
    : "";
  const highlightBadges = buildHighlightBadges(fields, width, height, s, palette, font, frameX, frameWidth, frameBottom);

  const footer = `
    ${highlightBadges}
    ${svgTextBlock(footerLines, cx, footerY - Math.round(30 * s), font(28), 900, palette.accent, Math.round(38 * s), "middle")}
    ${contacts}
  `;

  const detailText = detailLines
    .map((line, index) => `<text x="${cx}" y="${safeDetailsY + index * detailLineHeight}" text-anchor="middle" font-family="${palette.bodyFont}" font-size="${font(25)}" font-weight="900" fill="${palette.text}">${escapeXml(line)}</text>`)
    .join("");
  const cliparts = options.includeLocalClipart === false ? "" : buildClipartSvg(fields, poster, width, height, palette);

  let content = "";
  if (design === "clean_schedule") {
    const rows = Array.isArray(fields.schedule)
      ? fields.schedule
          .filter((period) => Object.values(period || {}).some(Boolean))
          .slice(0, 4)
          .map((period) => [period.day || period.subject || "", period.time || period.room || ""])
      : [];
    const rowTop = Math.round(height * 0.36);
    const rowH = Math.round(92 * s);
    const gap = Math.round(28 * s);
    const rowSvg = rows.map((row, index) => {
      const y = rowTop + index * (rowH + gap);
      const fill = index % 2 ? "#c9dddc" : "#f7d0c9";
      return `
        <rect x="${Math.round(width * 0.12)}" y="${y}" width="${Math.round(width * 0.28)}" height="${rowH}" rx="${Math.round(8 * s)}" fill="${fill}"/>
        <rect x="${Math.round(width * 0.43)}" y="${y}" width="${Math.round(width * 0.45)}" height="${rowH}" rx="${Math.round(8 * s)}" fill="${fill}"/>
        <text x="${Math.round(width * 0.26)}" y="${y + Math.round(rowH * 0.62)}" text-anchor="middle" font-family="${palette.bodyFont}" font-size="${font(30)}" font-weight="900" fill="#111">${escapeXml(row[0])}</text>
        <text x="${Math.round(width * 0.655)}" y="${y + Math.round(rowH * 0.62)}" text-anchor="middle" font-family="${palette.bodyFont}" font-size="${font(30)}" font-weight="700" fill="#111">${escapeXml(row[1])}</text>`;
    }).join("");
    content = `
      ${fields.user_title ? `<text x="${cx}" y="${Math.max(headerHeight + Math.round(70 * s), titleControlY - Math.round(95 * s))}" text-anchor="middle" font-family="${palette.titleFont}" font-size="${font(42)}" font-weight="900" fill="#111">${escapeXml(fields.user_title)}</text>` : ""}
      ${mainTitle ? `<text x="${cx}" y="${titleControlY}" text-anchor="middle" font-family="${palette.titleFont}" font-size="${font(64)}" font-weight="900" fill="#111">${escapeXml(mainTitle).toUpperCase()}</text>` : ""}
      ${rowSvg}
    `;
  } else if (design === "dark_event") {
    content = `
      ${institution ? `<text x="${cx}" y="${headerHeight + Math.round(120 * s)}" text-anchor="middle" font-family="${palette.titleFont}" font-size="${font(48)}" font-weight="900" fill="#ffffff">${escapeXml(institution)}</text>` : ""}
      ${mainTitle ? svgTextBlock(wrapText(mainTitle.toUpperCase(), landscape ? 16 : 10, 2), cx, titleControlY, font(88), 900, palette.title, Math.round(92 * s), "middle") : ""}
      ${svgTextBlock(headingLines, cx, safeHeadingY, font(42), 900, "#ffffff", Math.round(50 * s), "middle")}
      ${svgTextBlock(bodyLines, cx, safeBodyY, font(29), 800, "#ffffff", Math.round(40 * s), "middle")}
      ${detailText}
    `;
  } else {
    const titleY = titleControlY;
    const badgeY = titleY + Math.round(250 * s);
    const regularTitleY = design === "all_best" ? badgeY + Math.round(165 * s) : titleY + Math.round(90 * s);
    content = `
      ${design === "all_best" ? `<text x="${cx}" y="${titleY}" text-anchor="middle" font-family="${palette.titleFont}" font-size="${font(34)}" font-weight="900" fill="${palette.title}">ALL THE BEST</text>
      <text x="${cx}" y="${titleY + Math.round(70 * s)}" text-anchor="middle" font-family="${palette.titleFont}" font-size="${font(84)}" font-weight="900" fill="${palette.title}">STUDENTS</text>
      <polygon points="${Math.round(width * 0.28)},${badgeY} ${Math.round(width * 0.72)},${badgeY} ${Math.round(width * 0.68)},${badgeY + Math.round(58 * s)} ${Math.round(width * 0.32)},${badgeY + Math.round(58 * s)}" fill="${palette.accent}"/>
      <text x="${cx}" y="${badgeY + Math.round(40 * s)}" text-anchor="middle" font-family="system-ui, Arial, sans-serif" font-size="${font(24)}" font-weight="900" fill="#10203f">WHO ARE GOING FOR</text>` : ""}
      ${mainTitleLines.length ? svgTextBlock(mainTitleLines, cx, regularTitleY, font(design === "carnatic_practice" ? 76 : 66), 900, palette.title, titleLineHeight, "middle") : ""}
      ${svgTextBlock(headingLines, cx, safeHeadingY, font(44), 900, palette.text, headingLineHeight, "middle")}
      ${svgTextBlock(bodyLines, cx, safeBodyY, font(25), 800, palette.text, bodyLineHeight, "middle")}
      ${detailText}
    `;
  }

  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${palette.bg}"/>
  <rect x="${frameX}" y="${frameTop}" width="${frameWidth}" height="${frameHeight}" rx="${Math.round(24 * s)}" fill="${palette.panel}" stroke="${palette.accent}" stroke-width="${Math.max(2, Math.round(2 * s))}"/>
  ${cliparts}
  ${header}
  ${content}
  ${footer}
</svg>`;
}

async function composePoster(poster, fields, aiText, bgDiskPath, qrDiskPath, options = {}) {
  const finalFileName = uniquePosterAssetName(options.assetPrefix || "poster", poster.id, "jpg");
  const finalDiskPath = path.join(uploadsDir, finalFileName);
  const { width, height } = getPosterDimensions(fields);
  const design = resolvePosterDesign(fields, poster);
  const palette = applyPaletteOverrides(getDesignPalette(design), fields);
  const internetCliparts = await buildInternetClipartComposites(fields, poster, width, height, palette);
  const localDecorations = await buildLocalAssetDecorations(fields, poster, width, height, {
    preferLocalDecorations: options.preferLocalDecorations || !internetCliparts.used,
  });
  const overlaySvg = Buffer.from(buildPosterSvg(poster, fields, aiText, {
    includeLocalClipart: !internetCliparts.used && !localDecorations.used,
  }));
  const qrScale = clampNumber(fields.qr_scale, 0.7, 1.45, 1);
  const qrSize = Math.round(Math.min(width, height) * 0.118 * qrScale);
  const backgroundScale = clampNumber(fields.background_scale, 1, 1.4, 1);
  const backgroundWidth = Math.round(width * backgroundScale);
  const backgroundHeight = Math.round(height * backgroundScale);
  const s = Math.min(width / 1080, height / 1350);
  const qrAlign = ["left", "center", "right"].includes(fields.qr_align) ? fields.qr_align : "right";
  const manualQrX = Number(fields.qr_x);
  const manualQrY = Number(fields.qr_y);
  const hasManualQrPosition = Number.isFinite(manualQrX) && Number.isFinite(manualQrY);
  const qrLeft = {
    left: Math.round(width * 0.07) + Math.round(18 * s),
    center: Math.round(width / 2 - qrSize / 2),
    right: Math.round(width * 0.93) - qrSize - Math.round(18 * s),
  }[qrAlign];
  const frameBottom = height - Math.round(34 * s);
  const qrTop = hasManualQrPosition
    ? Math.round(height * clampNumber(manualQrY, 0.03, 0.97, 0.85) - qrSize / 2)
    : frameBottom - qrSize - Math.round(58 * s);
  const resolvedQrLeft = hasManualQrPosition
    ? Math.round(width * clampNumber(manualQrX, 0.03, 0.97, 0.86) - qrSize / 2)
    : qrLeft;
  const logoComposites = options.omitLogo ? [] : await buildLogoComposites(fields, width, height);
  const qrComposite = qrDiskPath && !isLayerRemoved(fields, "qr")
    ? [{
        input: await sharp(qrDiskPath)
          .resize(qrSize, qrSize)
          .png()
          .toBuffer(),
        top: qrTop,
        left: resolvedQrLeft,
      }]
    : [];

  await writeSharpToFile(sharp(bgDiskPath)
    .resize(backgroundWidth, backgroundHeight, { fit: "cover" })
    .extract({
      left: Math.round((backgroundWidth - width) / 2),
      top: Math.round((backgroundHeight - height) / 2),
      width,
      height,
    })
    .blur(2)
    .modulate({ brightness: 0.88, saturation: 1.08 })
    .composite([
      ...localDecorations.composites,
      { input: overlaySvg, top: 0, left: 0 },
      ...internetCliparts.composites,
      ...logoComposites,
      ...qrComposite,
    ])
    .jpeg({ quality: 94 }), finalDiskPath);
  const uploaded = await uploadFileToCloudinary(finalDiskPath, {
    publicId: `${options.assetPrefix || "poster"}_${poster.id}_${Date.now()}`,
  });

  return {
    finalPosterPath: uploaded.url,
    finalPosterCloudinaryId: uploaded.publicId,
    finalDiskPath,
    internetClipartUsed: internetCliparts.used,
    localDecorationUsed: localDecorations.used,
  };
}

async function generatePoster(poster) {
  await fs.mkdir(uploadsDir, { recursive: true });

  const fields = poster.fields_json || {};
  const resolvedDesign = resolvePosterDesign(fields, poster);
  const resolvedPalette = applyPaletteOverrides(getDesignPalette(resolvedDesign), fields);
  const aiText = await generateAiText(poster, fields);
  const tempFiles = [];
  const { bgDiskPath, bgPublicPath, bgCloudinaryId, fallbackUsed, pollinationsUsed, customBackgroundUsed } = await generateBackground(poster);
  tempFiles.push(bgDiskPath);
  const { qrDiskPath, qrPublicPath, qrCloudinaryId } = await createQr(poster, fields);
  if (qrDiskPath) tempFiles.push(qrDiskPath);
  const { finalPosterPath, finalPosterCloudinaryId, finalDiskPath, internetClipartUsed, localDecorationUsed } = await composePoster(poster, fields, aiText, bgDiskPath, qrDiskPath, {
    preferLocalDecorations: fallbackUsed,
  });
  tempFiles.push(finalDiskPath);
  const editBaseFields = fieldsForEditBase(fields);
  const { finalPosterPath: editBasePath, finalPosterCloudinaryId: editBaseCloudinaryId, finalDiskPath: editBaseDiskPath } = await composePoster(poster, editBaseFields, aiText, bgDiskPath, qrDiskPath, {
    assetPrefix: "edit_base",
    preferLocalDecorations: fallbackUsed,
  });
  tempFiles.push(editBaseDiskPath);
  const notices = [
    pollinationsUsed ? "Stability AI was unavailable, so Pollinations AI was used for the background." : "",
    fallbackUsed ? "AI background service was unavailable, so a local fallback background was used." : "",
    fields.clipart_source === "internet" && !internetClipartUsed ? "Internet clipart was unavailable, so it was skipped." : "",
    localDecorationUsed ? "Local drawing decoration assets were added to the poster." : "",
  ].filter(Boolean);
  const generationNotice = notices.join(" ");

  const result = {
    fields_json: {
      ...fields,
      used_fallback_background: fallbackUsed,
      pollinations_background_used: pollinationsUsed,
      custom_background_used: customBackgroundUsed,
      generation_notice: generationNotice,
      internet_clipart_used: internetClipartUsed,
      local_decoration_used: localDecorationUsed,
      edit_base_path: editBasePath,
      edit_base_cloudinary_id: editBaseCloudinaryId,
      bg_cloudinary_id: bgCloudinaryId,
      qr_cloudinary_id: qrCloudinaryId,
      final_poster_cloudinary_id: finalPosterCloudinaryId,
      edit_base_version: editBaseVersion,
      resolved_design: resolvedDesign,
      resolved_palette: {
        title: resolvedPalette.title,
        text: resolvedPalette.text,
        accent: resolvedPalette.accent,
        header: resolvedPalette.headerText,
      },
    },
    ai_heading: aiText.heading,
    ai_body: aiText.body,
    ai_footer: aiText.footer,
    bg_image_path: bgPublicPath,
    qr_path: qrPublicPath,
    final_poster_path: finalPosterPath,
    imageUrl: finalPosterPath,
    cloudinaryId: finalPosterCloudinaryId,
  };

  await Promise.all(tempFiles.filter(Boolean).map((filePath) => fs.rm(filePath, { force: true }).catch(() => {})));

  return result;
}

module.exports = generatePoster;
