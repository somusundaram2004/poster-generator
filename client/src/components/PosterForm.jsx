import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api.js";

const fieldSets = {
  exam: [
    { name: "subject", label: "Subject", type: "text" },
    { name: "date", label: "Date", type: "date" },
    { name: "time", label: "Time", type: "time" },
    { name: "hall", label: "Hall", type: "text" },
    { name: "instructions", label: "Instructions", type: "textarea" },
  ],
  fee: [
    { name: "amount", label: "Amount", type: "text" },
    { name: "due_date", label: "Due Date", type: "date" },
    { name: "fine", label: "Fine", type: "text" },
    { name: "account_details", label: "Account Details", type: "textarea" },
  ],
  wishes: [
    { name: "occasion", label: "Occasion", type: "text" },
    { name: "from_dept", label: "From Department", type: "text" },
    { name: "date", label: "Date", type: "date" },
    { name: "message", label: "Message", type: "textarea" },
  ],
  announcement: [
    { name: "details", label: "Details", type: "textarea" },
    { name: "issued_by", label: "Issued By", type: "text" },
    { name: "date", label: "Date", type: "date" },
  ],
  class: [
    { name: "class_name", label: "Class Name", type: "text" },
    { name: "subject", label: "Subject", type: "text" },
    { name: "room", label: "Room", type: "text" },
    { name: "teacher", label: "Teacher", type: "text" },
    { name: "date", label: "Date", type: "date" },
    { name: "time", label: "Time", type: "time" },
  ],
  timetable: [
    { name: "batch", label: "Batch", type: "text" },
    { name: "department", label: "Department", type: "text" },
    { name: "valid_from", label: "Valid From", type: "date" },
    { name: "schedule", label: "Schedule", type: "schedule" },
  ],
};

const emptyPeriod = { day: "", time: "", subject: "", faculty: "", room: "" };
const visualGenres = [
  { value: "modern", label: "Modern Institutional" },
  { value: "western", label: "Western" },
  { value: "classic", label: "Classic" },
  { value: "carnatic", label: "Carnatic" },
  { value: "drawing", label: "Drawing / Art" },
  { value: "academic", label: "Academic" },
];
const posterDesigns = [
  { value: "auto", label: "Auto varied design" },
  { value: "classic_header", label: "University Header" },
  { value: "fee_notice", label: "Fee Notice" },
  { value: "magenta_classic", label: "Magenta Classical" },
  { value: "clean_schedule", label: "Clean Schedule" },
  { value: "carnatic_practice", label: "Carnatic Practice" },
  { value: "dark_event", label: "Dark Event" },
  { value: "all_best", label: "All the Best" },
  { value: "art_gallery", label: "Art Gallery" },
  { value: "art_workshop", label: "Art Workshop" },
  { value: "sketch_notice", label: "Sketch Notice" },
];

function initialFields(category) {
  const values = fieldSets[category]?.reduce((currentValues, field) => {
    currentValues[field.name] = field.type === "schedule" ? [{ ...emptyPeriod }] : "";
    return currentValues;
  }, {}) || {};

  values.visual_genre = "modern";
  values.orientation = "portrait";
  values.poster_design = "auto";
  values.institution_name = "";
  values.branch = "";
  values.contact_primary = "";
  values.contact_secondary = "";
  values.contact_url = "";
  values.background_keyword = "";
  values.clipart_source = "none";
  values.clipart_keyword = "";
  values.title_y = 0.22;
  values.heading_y = 0.445;
  values.body_y = 0.515;
  values.details_y = 0.62;
  values.footer_y = 0.78;
  values.clipart_y = 0.66;
  values.logo_scale = 1;
  values.logo_align = "center";
  values.qr_align = "right";
  values.badge_enabled = false;
  values.badge_scale = 1;
  values.badge_height_scale = 1;
  values.logo_backing = false;
  return values;
}

function PosterForm() {
  const { category } = useParams();
  const navigate = useNavigate();
  const fields = fieldSets[category];
  const [title, setTitle] = useState("");
  const [values, setValues] = useState(() => initialFields(category));
  const [logoFiles, setLogoFiles] = useState([]);
  const [backgroundFile, setBackgroundFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const readableCategory = useMemo(() => category?.replace("-", " "), [category]);

  useEffect(() => {
    setTitle("");
    setValues(initialFields(category));
    setLogoFiles([]);
    setBackgroundFile(null);
    setError("");
  }, [category]);

  if (!fields) {
    return (
      <section className="page-section narrow">
        <div className="notice error">Unknown poster category.</div>
        <Link className="button secondary" to="/">Back to home</Link>
      </section>
    );
  }

  function updateField(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function updateSchedule(index, name, value) {
    setValues((current) => ({
      ...current,
      schedule: current.schedule.map((period, periodIndex) =>
        periodIndex === index ? { ...period, [name]: value } : period
      ),
    }));
  }

  function addPeriod() {
    setValues((current) => ({ ...current, schedule: [...current.schedule, { ...emptyPeriod }] }));
  }

  function removePeriod(index) {
    setValues((current) => ({
      ...current,
      schedule: current.schedule.filter((_, periodIndex) => periodIndex !== index),
    }));
  }

  function updateLogoCount(count) {
    updateField("logo_count", count);
    setLogoFiles((current) => current.slice(0, count));
  }

  function updateLogoFile(index, file) {
    setLogoFiles((current) => {
      const next = [...current];
      next[index] = file;
      return next;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const publicTitle = title.trim();
      const payloadTitle = publicTitle || "Untitled poster";
      const formData = new FormData();
      formData.append("category", category);
      formData.append("title", payloadTitle);
      formData.append("fields_json", JSON.stringify({ ...values, user_title: publicTitle }));
      logoFiles.filter(Boolean).forEach((file) => formData.append("logos", file));
      if (backgroundFile) formData.append("background", backgroundFile);

      const response = await api.post("/api/posters", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      navigate(`/preview/${response.data.id}`);
    } catch (submitError) {
      setError(submitError.response?.data?.message || "Unable to create poster.");
    } finally {
      setSubmitting(false);
    }
  }

  function updateCursorVars(event) {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const rotateY = ((x / rect.width) - 0.5) * 5;
    const rotateX = ((0.5 - y / rect.height)) * 4;

    target.style.setProperty("--cursor-x", `${x}px`);
    target.style.setProperty("--cursor-y", `${y}px`);
    target.style.setProperty("--tilt-x", `${rotateX}deg`);
    target.style.setProperty("--tilt-y", `${rotateY}deg`);
  }

  function resetCursorVars(event) {
    const target = event.currentTarget;
    target.style.setProperty("--tilt-x", "0deg");
    target.style.setProperty("--tilt-y", "0deg");
  }

  return (
    <section className="page-section narrow">
      <div className="page-heading compact">
        <p className="eyebrow">{readableCategory}</p>
        <h1>Create Poster</h1>
      </div>

      <form className="form-panel interactive-panel" onMouseMove={updateCursorVars} onMouseLeave={resetCursorVars} onSubmit={handleSubmit}>
        <label>
          Poster Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>

        <div className="control-grid">
          <label>
            Visual Genre
            <select value={values.visual_genre} onChange={(event) => updateField("visual_genre", event.target.value)}>
              {visualGenres.map((genre) => (
                <option key={genre.value} value={genre.value}>{genre.label}</option>
              ))}
            </select>
          </label>
          <label>
            Orientation
            <select value={values.orientation} onChange={(event) => updateField("orientation", event.target.value)}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
          <label>
            Design
            <select value={values.poster_design} onChange={(event) => updateField("poster_design", event.target.value)}>
              {posterDesigns.map((design) => (
                <option key={design.value} value={design.value}>{design.label}</option>
              ))}
            </select>
          </label>
          <label>
            Institution Name
            <input value={values.institution_name} onChange={(event) => updateField("institution_name", event.target.value)} />
          </label>
          <label>
            Branch / Venue
            <input value={values.branch} onChange={(event) => updateField("branch", event.target.value)} />
          </label>
          <label>
            QR / Map URL
            <input value={values.contact_url} onChange={(event) => updateField("contact_url", event.target.value)} />
          </label>
          <label>
            QR align
            <select value={values.qr_align} onChange={(event) => updateField("qr_align", event.target.value)}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label>
            Background image keyword
            <input value={values.background_keyword} onChange={(event) => updateField("background_keyword", event.target.value)} />
          </label>
          <label>
            Custom Background Image
            <input
              type="file"
              accept="image/*"
              onChange={(event) => setBackgroundFile(event.target.files?.[0] || null)}
            />
          </label>
          <label>
            Clipart Source
            <select value={values.clipart_source} onChange={(event) => updateField("clipart_source", event.target.value)}>
              <option value="none">No clipart</option>
              <option value="internet">Internet clipart</option>
              <option value="local">Built-in clipart</option>
            </select>
          </label>
          <label>
            Clipart Keyword
            <input value={values.clipart_keyword} onChange={(event) => updateField("clipart_keyword", event.target.value)} />
          </label>
          <label>
            Contact 1
            <input value={values.contact_primary} onChange={(event) => updateField("contact_primary", event.target.value)} />
          </label>
          <label>
            Contact 2
            <input value={values.contact_secondary} onChange={(event) => updateField("contact_secondary", event.target.value)} />
          </label>
        </div>

        <div className="logo-panel">
          <div>
            <span className="field-title">Logos</span>
            <p>Select how many logos to place at the top of the poster.</p>
          </div>
          <div className="logo-count-row">
            {[1, 2, 3, 4, 5].map((count) => (
              <label className="checkbox-pill" key={count}>
                <input
                  type="checkbox"
                  checked={Number(values.logo_count || 0) === count}
                  onChange={() => updateLogoCount(Number(values.logo_count || 0) === count ? 0 : count)}
                />
                {count}
              </label>
            ))}
          </div>
          {Number(values.logo_count || 0) > 0 && Number(values.logo_count || 0) < 5 && (
            <label className="checkbox-pill wide">
              <input
                type="checkbox"
                checked={Boolean(values.logo_backing)}
                onChange={(event) => updateField("logo_backing", event.target.checked)}
              />
              White round behind logo
            </label>
          )}
          {Number(values.logo_count || 0) > 0 && (
            <label className="checkbox-pill wide">
              <input
                type="checkbox"
                checked={Boolean(values.badge_enabled)}
                onChange={(event) => updateField("badge_enabled", event.target.checked)}
              />
              Add hanging badge
            </label>
          )}
          {Number(values.logo_count || 0) > 0 && (
            <label>
              Logo / badge align
              <select value={values.logo_align} onChange={(event) => updateField("logo_align", event.target.value)}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
          )}
          {Number(values.logo_count || 0) > 0 && (
            <label className="range-control">
              <span>Logo size: {Number(values.logo_scale).toFixed(2)}x</span>
              <input
                type="range"
                min="0.75"
                max="1.7"
                step="0.05"
                value={values.logo_scale}
                onChange={(event) => updateField("logo_scale", Number(event.target.value))}
              />
            </label>
          )}
          {Number(values.logo_count || 0) > 0 && values.badge_enabled && (
            <label className="range-control">
              <span>Badge size: {Number(values.badge_scale).toFixed(2)}x</span>
              <input
                type="range"
                min="0.75"
                max="1.8"
                step="0.05"
                value={values.badge_scale}
                onChange={(event) => updateField("badge_scale", Number(event.target.value))}
              />
            </label>
          )}
          {Number(values.logo_count || 0) > 0 && values.badge_enabled && (
            <label className="range-control">
              <span>Badge height: {Number(values.badge_height_scale).toFixed(2)}x</span>
              <input
                type="range"
                min="0.65"
                max="2"
                step="0.05"
                value={values.badge_height_scale}
                onChange={(event) => updateField("badge_height_scale", Number(event.target.value))}
              />
            </label>
          )}
          {Number(values.logo_count || 0) > 0 && (
            <div className="logo-upload-grid">
              {Array.from({ length: Number(values.logo_count || 0) }).map((_, index) => (
                <label key={index}>
                  Logo {index + 1}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => updateLogoFile(index, event.target.files?.[0] || null)}
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        {fields.map((field) => (
          <div key={field.name}>
            {field.type === "textarea" && (
              <label>
                {field.label}
                <textarea
                  value={values[field.name]}
                  onChange={(event) => updateField(field.name, event.target.value)}
                  rows="5"
                />
              </label>
            )}
            {field.type !== "textarea" && field.type !== "schedule" && (
              <label>
                {field.label}
                <input
                  type={field.type}
                  value={values[field.name]}
                  onChange={(event) => updateField(field.name, event.target.value)}
                />
              </label>
            )}
            {field.type === "schedule" && (
              <div className="schedule-editor">
                <div className="section-row">
                  <h2>{field.label}</h2>
                  <button type="button" className="button secondary small" onClick={addPeriod}>Add Period</button>
                </div>
                {values.schedule.map((period, index) => (
                  <div className="period-grid" key={`${period.day}-${index}`}>
                    {Object.keys(emptyPeriod).map((key) => (
                      <label key={key}>
                        {key.charAt(0).toUpperCase() + key.slice(1)}
                        <input
                          value={period[key]}
                          onChange={(event) => updateSchedule(index, key, event.target.value)}
                        />
                      </label>
                    ))}
                    {values.schedule.length > 1 && (
                      <button type="button" className="button danger small" onClick={() => removePeriod(index)}>Remove</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {error && <div className="notice error">{error}</div>}
        <button className="button primary" type="submit" disabled={submitting}>
          {submitting ? "Creating..." : "Generate Poster"}
        </button>
      </form>
    </section>
  );
}

export default PosterForm;
