const fs = require("fs/promises");
const path = require("path");
const sharp = require("../server/node_modules/sharp");
const generatePoster = require("../server/services/generatePoster");

const rootDir = path.join(__dirname, "..");
const uploadsDir = path.join(rootDir, "server", "uploads");
const auditDir = path.join(uploadsDir, "audit");

const logoPaths = [
  "/uploads/logo_1778488966982_47871514.png",
  "/uploads/logo_1778434715533_452541847.jpeg",
];

const backgrounds = [
  "/uploads/bg_31_1778488969800_909479418.jpg",
  "/uploads/bg_30_1778489604608_456420168.jpg",
  "/uploads/bg_29_1778487723722_160897355.jpg",
  "/uploads/bg_28_1778486199329_831620763.jpg",
  "/uploads/bg_26_1778479189903_511843683.jpg",
  "/uploads/bg_25_1778477971861_62883183.jpg",
];

const shared = {
  institution_name: "KFA Music Academy",
  branch: "KFA Madambakkam",
  contact_primary: "7200602961",
  contact_secondary: "9843826233",
  contact_url: "https://maps.google.com/?q=KFA+Madambakkam",
  logo_paths: logoPaths,
  logo_count: logoPaths.length,
  logo_align: "left",
  logo_x: 0.115,
  logo_y: 0.07,
  logo_scale: 1.05,
  badge_enabled: true,
  badge_scale: 1,
  badge_height_scale: 1.05,
  qr_align: "right",
  qr_x: 0.86,
  qr_y: 0.86,
  qr_scale: 1,
  text_scale: 1.05,
  background_scale: 1.08,
  clipart_source: "none",
  orientation: "portrait",
  visual_genre: "modern",
  poster_design: "classic_header",
};

const samples = [
  {
    id: 9101,
    category: "fee",
    title: "May Fee Reminder",
    fields_json: {
      ...shared,
      custom_background_path: backgrounds[0],
      user_title: "May Fee Reminder",
      amount: "Rs. 2,500",
      due_date: "2026-05-30",
      fine: "Late fee applies after due date",
      account_details: "Pay at office or through the shared payment link.",
      manual_heading: "Fee Payment Notice",
      manual_body: "Students are requested to complete the monthly fee payment before the due date.",
      manual_footer: "Scan QR for payment",
    },
  },
  {
    id: 9107,
    category: "exam",
    title: "Bharatanatyam Grade Exam Notification",
    fields_json: {
      ...shared,
      custom_background_path: backgrounds[1],
      visual_genre: "carnatic",
      poster_design: "classic_header",
      user_title: "Bharatanatyam Grade Exam Notification",
      subject: "Bharatanatyam",
      date: "2026-05-30",
      time: "10:00 AM",
      hall: "Main Practice Hall",
      branch: "KFA Madambakkam",
      instructions: "Appear in uniform. Bring hall ticket and required documents.",
      manual_heading: "Exam Details",
      manual_body: "Students are requested to arrive on time and appear in proper uniform.",
      manual_footer: "Scan QR for location",
    },
  },
  {
    id: 9102,
    category: "announcement",
    title: "Annual Cultural Program",
    fields_json: {
      ...shared,
      custom_background_path: backgrounds[1],
      user_title: "Annual Cultural Program",
      details: "Live performances, award ceremony, and student showcases will be conducted in the main hall.",
      issued_by: "Academy Office",
      date: "2026-06-15",
      time: "05:30 PM",
      manual_heading: "Program Announcement",
      manual_body: "All students and parents are invited to attend the annual cultural program.",
      manual_footer: "Scan QR for venue",
    },
  },
  {
    id: 9103,
    category: "class",
    title: "Weekend Drawing Class",
    fields_json: {
      ...shared,
      custom_background_path: backgrounds[2],
      visual_genre: "drawing",
      poster_design: "magenta_classic",
      user_title: "Weekend Drawing Class",
      class_name: "Junior Drawing Batch",
      subject: "Drawing",
      room: "Studio Room 2",
      teacher: "Ms. Kavitha",
      date: "2026-06-01",
      time: "10:00 AM",
      manual_heading: "Class Reminder",
      manual_body: "Bring sketchbook, pencils, eraser, and watercolor materials for practice.",
      manual_footer: "Scan QR for location",
    },
  },
  {
    id: 9104,
    category: "wishes",
    title: "Best Wishes",
    fields_json: {
      ...shared,
      custom_background_path: backgrounds[3],
      poster_design: "all_best",
      user_title: "Best Wishes",
      occasion: "University Grade Exam",
      from_dept: "KFA Music Academy",
      date: "2026-05-30",
      message: "Wishing every student confidence, focus, and success in the examination.",
      manual_heading: "All The Best",
      manual_body: "Stay calm, arrive on time, and give your best performance.",
      manual_footer: "With best wishes",
    },
  },
  {
    id: 9105,
    category: "announcement",
    title: "Holiday Announcement",
    fields_json: {
      ...shared,
      custom_background_path: backgrounds[4],
      poster_design: "dark_event",
      user_title: "Holiday Announcement",
      details: "Academy will remain closed for maintenance work and reopen for regular classes next week.",
      issued_by: "Admin Office",
      date: "2026-06-05",
      manual_heading: "Important Notice",
      manual_body: "Please check the updated class schedule before visiting the academy.",
      manual_footer: "Contact office for details",
    },
  },
  {
    id: 9106,
    category: "timetable",
    title: "June Timetable",
    fields_json: {
      ...shared,
      custom_background_path: backgrounds[5],
      poster_design: "clean_schedule",
      user_title: "June Timetable",
      batch: "Senior Batch",
      department: "Music Department",
      valid_from: "2026-06-01",
      schedule: [
        { day: "Monday", time: "05:00 PM", subject: "Keyboard", faculty: "Arun", room: "Room 1" },
        { day: "Wednesday", time: "06:00 PM", subject: "Vocal", faculty: "Meera", room: "Room 3" },
        { day: "Friday", time: "05:30 PM", subject: "Guitar", faculty: "Daniel", room: "Studio" },
      ],
      manual_heading: "Class Schedule",
      manual_body: "Students should follow the updated batch timings from the valid date.",
      manual_footer: "Scan QR for updates",
    },
  },
];

async function copyAuditPoster(publicPath, sample) {
  const source = path.join(uploadsDir, path.basename(publicPath));
  const destination = path.join(auditDir, `${sample.id}-${sample.category}-${sample.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg`);
  await fs.copyFile(source, destination);
  return destination;
}

async function makeContactSheet(files) {
  const columns = 3;
  const tileWidth = 360;
  const tileHeight = 496;
  const rows = Math.ceil(files.length / columns);
  const thumbs = await Promise.all(
    files.map(async (file) => {
      const buffer = await sharp(file)
        .resize(360, 450, { fit: "cover" })
        .extend({ top: 0, bottom: 46, left: 0, right: 0, background: "#ffffff" })
        .jpeg({ quality: 90 })
        .toBuffer();
      return buffer;
    })
  );

  const labelSvgs = samples.map((sample) => Buffer.from(`
    <svg width="360" height="46" viewBox="0 0 360 46" xmlns="http://www.w3.org/2000/svg">
      <rect width="360" height="46" fill="#ffffff"/>
      <text x="180" y="29" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="800" fill="#111827">${sample.category.toUpperCase()} - ${sample.title}</text>
    </svg>
  `));

  const labeledThumbs = await Promise.all(thumbs.map((thumb, index) => (
    sharp(thumb)
      .composite([{ input: labelSvgs[index], top: 450, left: 0 }])
      .jpeg({ quality: 92 })
      .toBuffer()
  )));

  const sheetPath = path.join(auditDir, "poster-alignment-contact-sheet.jpg");
  await sharp({
    create: {
      width: columns * tileWidth,
      height: rows * tileHeight,
      channels: 3,
      background: "#eef2f7",
    },
  })
    .composite(labeledThumbs.map((input, index) => ({
      input,
      left: (index % columns) * tileWidth,
      top: Math.floor(index / columns) * tileHeight,
    })))
    .jpeg({ quality: 94 })
    .toFile(sheetPath);

  return sheetPath;
}

async function main() {
  await fs.mkdir(auditDir, { recursive: true });
  const outputs = [];

  for (const sample of samples) {
    const result = await generatePoster(sample);
    const auditPath = await copyAuditPoster(result.final_poster_path, sample);
    outputs.push(auditPath);
    console.log(`${sample.category}: ${auditPath}`);
  }

  const sheetPath = await makeContactSheet(outputs);
  console.log(`contact_sheet: ${sheetPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
