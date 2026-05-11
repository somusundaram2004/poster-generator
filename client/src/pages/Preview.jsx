import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api, { assetUrl } from "../api.js";

const posterDesigns = [
  { value: "auto", label: "Auto varied design" },
  { value: "classic_header", label: "University Header" },
  { value: "fee_notice", label: "Fee Notice" },
  { value: "magenta_classic", label: "Magenta Classical" },
  { value: "clean_schedule", label: "Clean Schedule" },
  { value: "carnatic_practice", label: "Carnatic Practice" },
  { value: "dark_event", label: "Dark Event" },
  { value: "all_best", label: "All the Best" },
];

const detailFieldSets = {
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

function downloadBlob(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function fieldsForApi(edit) {
  const { poster_title, removed_layers, ...fields } = edit;
  return {
    ...fields,
    removed_layers: Array.isArray(removed_layers) ? removed_layers : [],
    user_title: poster_title?.trim() || "",
  };
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function alignToX(align, fallback = 0.5) {
  if (align === "left") return 0.12;
  if (align === "right") return 0.88;
  if (align === "center") return 0.5;
  return fallback;
}

function compactText(value, fallback = "") {
  return String(value || fallback || "").replace(/\s+/g, " ").trim();
}

function detailSummary(edit) {
  if (!edit) return "";
  return [
    edit.amount && `Amount: ${edit.amount}`,
    edit.fine && `Fine: ${edit.fine}`,
    edit.hall && `Hall: ${edit.hall}`,
    edit.room && `Room: ${edit.room}`,
    edit.teacher && `Teacher: ${edit.teacher}`,
    edit.branch && `Branch: ${edit.branch}`,
    edit.department && `Department: ${edit.department}`,
    edit.issued_by && `By: ${edit.issued_by}`,
  ].filter(Boolean).join("  |  ");
}

function posterPreviewFont(edit, poster, fallback) {
  const resolvedDesign = poster?.fields_json?.resolved_design || edit?.poster_design;
  if (poster?.category === "fee" || resolvedDesign === "fee_notice") return "Georgia, 'Times New Roman', serif";
  return fallback;
}

function Preview() {
  const { id } = useParams();
  const [poster, setPoster] = useState(null);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(null);
  const [backgroundFile, setBackgroundFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedLayer, setSelectedLayer] = useState("");
  const posterCanvasRef = useRef(null);

  useEffect(() => {
    let active = true;
    let timer;

    async function fetchPoster() {
      try {
        const response = await api.get(`/api/posters/${id}`);
        if (!active) return;
        setPoster(response.data);
        if (response.data.status === "done") {
          const fields = response.data.fields_json || {};
          const palette = fields.resolved_palette || {};
          setEdit((current) => current || {
            ...fields,
            manual_heading: fields.manual_heading || response.data.ai_heading || "",
            manual_body: fields.manual_body || response.data.ai_body || "",
            manual_footer: fields.manual_footer || response.data.ai_footer || "",
            poster_title: fields.user_title || (response.data.title === "Untitled poster" ? "" : response.data.title || ""),
            text_scale: fields.text_scale || 1.15,
            institution_scale: fields.institution_scale || 1,
            date_scale: fields.date_scale || 1,
            time_scale: fields.time_scale || 1,
            venue_scale: fields.venue_scale || 1,
            institution_x: fields.institution_x,
            institution_y: fields.institution_y,
            heading_x: fields.heading_x,
            body_x: fields.body_x,
            details_x: fields.details_x,
            footer_x: fields.footer_x,
            clipart_x: fields.clipart_x,
            logo_scale: fields.logo_scale ?? 1,
            logo_align: fields.logo_align || "center",
            logo_x: fields.logo_x,
            logo_y: fields.logo_y,
            badge_enabled: Boolean(fields.badge_enabled),
            badge_scale: fields.badge_scale || 1,
            badge_height_scale: fields.badge_height_scale || 1,
            clipart_scale: fields.clipart_scale || 1.15,
            qr_scale: fields.qr_scale || 1,
            qr_align: fields.qr_align || "right",
            qr_x: fields.qr_x,
            qr_y: fields.qr_y,
            background_scale: fields.background_scale || 1,
            title_y: fields.title_y || 0.28,
            heading_y: fields.heading_y || 0.44,
            body_y: fields.body_y || 0.52,
            details_y: fields.details_y || 0.63,
            footer_y: fields.footer_y || 0.83,
            clipart_y: fields.clipart_y || 0.66,
            clipart_source: fields.clipart_source || "none",
            clipart_keyword: fields.clipart_keyword || fields.subject || fields.visual_genre || "",
            poster_design: fields.poster_design || "auto",
            orientation: fields.orientation || "portrait",
            title_color: fields.title_color || palette.title || "#ffd36b",
            text_color: fields.text_color || palette.text || "#ffffff",
            accent_color: fields.accent_color || palette.accent || "#f8d56b",
            header_color: fields.header_color || palette.header || "#111111",
            removed_layers: Array.isArray(fields.removed_layers) ? fields.removed_layers : [],
          });
        }
        if (response.data.status === "processing" || response.data.status === "pending") {
          timer = setTimeout(fetchPoster, 2500);
        }
      } catch (fetchError) {
        if (active) setError(fetchError.response?.data?.message || "Unable to load poster.");
      }
    }

    fetchPoster();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, refreshKey]);

  async function handleRegenerate(event) {
    event.preventDefault();
    if (!edit) return;

    setSaving(true);
    setError("");
    try {
      if (backgroundFile) {
        const formData = new FormData();
        formData.append("title", edit.poster_title?.trim() || "Untitled poster");
        formData.append("fields_json", JSON.stringify(fieldsForApi(edit)));
        formData.append("background", backgroundFile);
        await api.patch(`/api/posters/${id}/regenerate`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        await api.patch(`/api/posters/${id}/regenerate`, {
          title: edit.poster_title?.trim() || "Untitled poster",
          fields_json: fieldsForApi(edit),
        });
      }
      setPoster((current) => current ? { ...current, status: "processing" } : current);
      setEdit(null);
      setBackgroundFile(null);
      setRefreshKey((value) => value + 1);
    } catch (saveError) {
      setError(saveError.response?.data?.message || "Unable to apply poster edits.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload() {
    if (!poster) return;

    setDownloading(true);
    setError("");
    try {
      const response = await api.get(`/api/posters/${id}/download`, { responseType: "blob" });
      const disposition = response.headers["content-disposition"] || "";
      const match = disposition.match(/filename="?([^"]+)"?/i);
      downloadBlob(response.data, match?.[1] || `${poster.title || "poster"}.jpg`);
    } catch (downloadError) {
      setError(downloadError.response?.data?.message || "Unable to download poster.");
    } finally {
      setDownloading(false);
    }
  }

  function updateCursorVars(event) {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const rotateY = ((x / rect.width) - 0.5) * 8;
    const rotateX = ((0.5 - y / rect.height)) * 6;

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

  function updateEditField(name, value) {
    setEdit((current) => ({ ...current, [name]: value }));
  }

  function isRemovedLayer(layer) {
    return Array.isArray(edit?.removed_layers) && edit.removed_layers.includes(layer);
  }

  function toggleLayerRemoval(layer) {
    setEdit((current) => {
      const nextRemoved = new Set(Array.isArray(current.removed_layers) ? current.removed_layers : []);
      if (nextRemoved.has(layer)) {
        nextRemoved.delete(layer);
      } else {
        nextRemoved.add(layer);
      }
      return { ...current, removed_layers: [...nextRemoved] };
    });
    if (selectedLayer === layer) setSelectedLayer("");
  }

  function getDragPosition(item) {
    const fallback = { x: 0.5, y: 0.5 };
    const valueX = Number(edit?.[`${item}_x`]);
    const valueY = Number(edit?.[`${item}_y`]);
      const fallbackMap = {
        qr: { x: qrDragX, y: qrDragY },
        logo: { x: logoDragX, y: logoDragY },
        institution: { x: institutionDragX, y: institutionDragY },
        clipart: { x: clipartDragX, y: clipartDragY },
        footer: { x: footerDragX, y: footerDragY },
        date: { x: dateDragX, y: dateDragY },
        time: { x: timeDragX, y: timeDragY },
      venue: { x: venueDragX, y: venueDragY },
      contact: { x: contactDragX, y: contactDragY },
    };
    const base = fallbackMap[item] || fallback;
    return {
      x: Number.isFinite(valueX) ? valueX : base.x,
      y: Number.isFinite(valueY) ? valueY : base.y,
    };
  }

  function beginPosterDrag(item, event) {
    if (!posterCanvasRef.current) return;
    event.preventDefault();
    setSelectedLayer(item);

    const startRect = posterCanvasRef.current.getBoundingClientRect();
    const startPos = getDragPosition(item);
    const startX = clamp(Number(startPos.x), 0.03, 0.97);
    const startY = clamp(Number(startPos.y), 0.03, 0.97);
    const offsetX = (event.clientX - startRect.left) / startRect.width - startX;
    const offsetY = (event.clientY - startRect.top) / startRect.height - startY;

    const updatePosition = (clientX, clientY) => {
      const rect = posterCanvasRef.current.getBoundingClientRect();
      const x = clamp((clientX - rect.left) / rect.width - offsetX, 0.03, 0.97);
      const y = clamp((clientY - rect.top) / rect.height - offsetY, 0.03, 0.97);
      setEdit((current) => ({
        ...current,
        [`${item}_x`]: Number(x.toFixed(4)),
        [`${item}_y`]: Number(y.toFixed(4)),
      }));
    };

    const onPointerMove = (moveEvent) => updatePosition(moveEvent.clientX, moveEvent.clientY);
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    updatePosition(event.clientX, event.clientY);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  function beginLayerResize(scaleKey, event) {
    if (!posterCanvasRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    const rect = posterCanvasRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const baseScale = Number(edit?.[scaleKey] || 1);
    const minScale = scaleKey === "qr_scale" ? 0.7 : 0.55;
    const maxScale = scaleKey === "badge_height_scale" ? 2 : scaleKey.endsWith("_scale") ? 1.9 : 1.9;

    const onPointerMove = (moveEvent) => {
      const delta = (moveEvent.clientX - startX) / Math.max(220, rect.width);
      const nextScale = clamp(baseScale + delta, minScale, maxScale);
      setEdit((current) => ({ ...current, [scaleKey]: Number(nextScale.toFixed(2)) }));
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  function resetDraggedPosition(item) {
    setEdit((current) => {
      const next = { ...current };
      delete next[`${item}_x`];
      delete next[`${item}_y`];
      return next;
    });
  }

  function nudgeSelectedLayer(event) {
    if (!selectedLayer || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.02 : 0.005;
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    setEdit((current) => ({
      ...current,
      [`${selectedLayer}_x`]: Number(clamp(Number(current[`${selectedLayer}_x`] || 0.5) + dx, 0.03, 0.97).toFixed(4)),
      [`${selectedLayer}_y`]: Number(clamp(Number(current[`${selectedLayer}_y`] || 0.5) + dy, 0.03, 0.97).toFixed(4)),
    }));
  }

  function updateSchedule(index, name, value) {
    setEdit((current) => ({
      ...current,
      schedule: (current.schedule || [{ ...emptyPeriod }]).map((period, periodIndex) =>
        periodIndex === index ? { ...period, [name]: value } : period
      ),
    }));
  }

  function addPeriod() {
    setEdit((current) => ({
      ...current,
      schedule: [...(current.schedule || []), { ...emptyPeriod }],
    }));
  }

  function removePeriod(index) {
    setEdit((current) => ({
      ...current,
      schedule: (current.schedule || []).filter((_, periodIndex) => periodIndex !== index),
    }));
  }

  const basePosterPath = poster?.final_poster_path || poster?.fields_json?.edit_base_path;
  const cacheKey = poster?.updatedAt ? `?v=${encodeURIComponent(poster.updatedAt)}` : "";
  const imageUrl = basePosterPath ? `${assetUrl(basePosterPath)}${cacheKey}` : "";
  const canvasImageUrl = imageUrl;
  const finalPosterUrl = poster?.final_poster_path ? `${assetUrl(poster.final_poster_path)}${cacheKey}` : "";
  const logoPreviewUrl = poster?.fields_json?.logo_paths?.[0] ? assetUrl(poster.fields_json.logo_paths[0]) : "";
  const qrPreviewUrl = poster?.qr_path ? assetUrl(poster.qr_path) : "";
  const isLoading = poster?.status === "processing" || poster?.status === "pending" || !poster;
  const hasLogo = Boolean(poster?.fields_json?.logo_paths?.length);
  const hasQr = Boolean(poster?.qr_path || edit?.contact_url);
  const storedLogoX = Number(edit?.logo_x);
  const storedLogoY = Number(edit?.logo_y);
  const hasStoredLogoPosition = Number.isFinite(storedLogoX) && Number.isFinite(storedLogoY);
  const hasLegacyBadgePosition = edit?.badge_enabled
    && hasStoredLogoPosition
    && storedLogoX >= 0.08
    && storedLogoX <= 0.13
    && storedLogoY >= 0.06
    && storedLogoY <= 0.11;
  const hasManualLogoPosition = hasStoredLogoPosition && !hasLegacyBadgePosition;
  const logoDragX = Number.isFinite(storedLogoX)
    ? (hasLegacyBadgePosition ? 0.055 : storedLogoX)
    : (edit?.badge_enabled && edit?.logo_align === "left" ? 0.055 : alignToX(edit?.logo_align));
  const logoDragY = Number.isFinite(storedLogoY)
    ? (hasLegacyBadgePosition ? 0.082 : storedLogoY)
    : (edit?.badge_enabled ? 0.082 : 0.07);
  const qrDragX = Number.isFinite(Number(edit?.qr_x)) ? Number(edit.qr_x) : alignToX(edit?.qr_align, 0.86);
  const qrDragY = Number.isFinite(Number(edit?.qr_y)) ? Number(edit.qr_y) : 0.85;
  const clipartDragX = Number.isFinite(Number(edit?.clipart_x)) ? Number(edit.clipart_x) : 0.08;
  const clipartDragY = Number.isFinite(Number(edit?.clipart_y)) ? Number(edit.clipart_y) : 0.72;
  const footerDragX = Number.isFinite(Number(edit?.footer_x)) ? Number(edit.footer_x) : 0.5;
  const footerDragY = Number.isFinite(Number(edit?.footer_y)) ? Number(edit.footer_y) : (edit?.footer_y ?? 0.78);
  const baseLogoPreviewSize = 42;
  const logoPreviewBase = Math.round(baseLogoPreviewSize * Number(edit?.logo_scale ?? 1));
  const badgeWidthScale = Number(edit?.badge_scale || 1);
  const badgeHeightScale = Number(edit?.badge_height_scale || 1);
  const badgePreviewPadding = 9;
  const badgeBaseWidth = Math.round(baseLogoPreviewSize * 1.32);
  const badgeBaseBodyHeight = Math.round(baseLogoPreviewSize + 18);
  const badgeBaseTail = Math.round(baseLogoPreviewSize * 0.62);
  const badgePreviewTail = Math.round(badgeBaseTail * badgeHeightScale);
  const badgePreviewWidth = Math.round(badgeBaseWidth * badgeWidthScale);
  const badgePreviewHeight = Math.max(
    logoPreviewBase + badgePreviewPadding * 2 + badgePreviewTail,
    Math.round(badgeBaseBodyHeight * badgeHeightScale + badgePreviewTail)
  );
  const badgeBodyStop = `${Math.round(((badgePreviewHeight - badgePreviewTail) / badgePreviewHeight) * 100)}%`;
  const logoPreviewSize = edit?.badge_enabled
    ? {
        width: `${badgePreviewWidth}px`,
        height: `${badgePreviewHeight}px`,
        "--logo-size": `${logoPreviewBase}px`,
        "--badge-pad": `${badgePreviewPadding}px`,
        "--badge-body-stop": badgeBodyStop,
        "--badge-transform": !hasManualLogoPosition ? "translate(0, -50%)" : "translate(-50%, -50%)",
      }
    : { width: `${logoPreviewBase}px`, height: `${logoPreviewBase}px` };
  const hasInstitution = Boolean(edit?.institution_name);
  const hasTitle = Boolean(edit?.poster_title || poster?.title);
  const hasHeading = Boolean(edit?.manual_heading || poster?.ai_heading);
  const hasBody = Boolean(edit?.manual_body || poster?.ai_body);
  const hasDetails = Boolean(poster?.category);
  const dateText = compactText(edit?.date || edit?.due_date || edit?.valid_from, "Date");
  const timeText = compactText(edit?.time, "Time");
  const venueText = compactText(edit?.branch || edit?.hall || edit?.room || edit?.department, "Venue");
  const contactText = [edit?.contact_primary, edit?.contact_secondary].filter(Boolean).join(" | ");
  const hasDate = Boolean(edit?.date || edit?.due_date || edit?.valid_from);
  const hasTime = Boolean(edit?.time);
  const hasVenue = Boolean(edit?.branch || edit?.hall || edit?.room || edit?.department);
  const hasContact = Boolean(contactText);
  const institutionDragX = Number.isFinite(Number(edit?.institution_x)) ? Number(edit.institution_x) : 0.5;
  const institutionDragY = Number.isFinite(Number(edit?.institution_y)) ? Number(edit.institution_y) : 0.12;
  const titleDragX = Number.isFinite(Number(edit?.title_x)) ? Number(edit.title_x) : 0.5;
  const titleDragY = Number.isFinite(Number(edit?.title_y)) ? Number(edit.title_y) : 0.28;
  const headingDragX = Number.isFinite(Number(edit?.heading_x)) ? Number(edit.heading_x) : 0.5;
  const headingDragY = Number.isFinite(Number(edit?.heading_y)) ? Number(edit.heading_y) : 0.44;
  const bodyDragX = Number.isFinite(Number(edit?.body_x)) ? Number(edit.body_x) : 0.5;
  const bodyDragY = Number.isFinite(Number(edit?.body_y)) ? Number(edit.body_y) : 0.52;
  const detailsDragX = Number.isFinite(Number(edit?.details_x)) ? Number(edit.details_x) : 0.5;
  const detailsDragY = Number.isFinite(Number(edit?.details_y)) ? Number(edit.details_y) : 0.63;
  const dateDragX = Number.isFinite(Number(edit?.date_x)) ? Number(edit.date_x) : 0.22;
  const dateDragY = Number.isFinite(Number(edit?.date_y)) ? Number(edit.date_y) : 0.72;
  const timeDragX = Number.isFinite(Number(edit?.time_x)) ? Number(edit.time_x) : 0.22;
  const timeDragY = Number.isFinite(Number(edit?.time_y)) ? Number(edit.time_y) : 0.78;
  const venueDragX = Number.isFinite(Number(edit?.venue_x)) ? Number(edit.venue_x) : 0.22;
  const venueDragY = Number.isFinite(Number(edit?.venue_y)) ? Number(edit.venue_y) : 0.84;
  const contactDragX = Number.isFinite(Number(edit?.contact_x)) ? Number(edit.contact_x) : 0.28;
  const contactDragY = Number.isFinite(Number(edit?.contact_y)) ? Number(edit.contact_y) : 0.93;
  const qrPreviewSize = `${Math.round(74 * Number(edit?.qr_scale || 1))}px`;
  const previewScale = Number(edit?.text_scale || 1.15);
  const liveTextColor = edit?.text_color || "#ffffff";
  const liveTitleColor = edit?.title_color || liveTextColor;
  const liveAccentColor = edit?.accent_color || "#f8d56b";
  const liveHeaderColor = edit?.header_color || poster?.fields_json?.resolved_palette?.header || "#e0f2fe";
  const isFeePoster = poster?.category === "fee" || poster?.fields_json?.resolved_design === "fee_notice" || edit?.poster_design === "fee_notice";
  const previewTitleFont = posterPreviewFont(edit, poster, "Arial Black, Impact, system-ui, sans-serif");
  const previewBodyFont = "Inter, Segoe UI, system-ui, Arial, sans-serif";
  const titlePreviewWidth = isFeePoster ? "310px" : "300px";
  const bodyPreviewWidth = isFeePoster ? "300px" : "280px";
  return (
    <section className="page-section preview-section">
      <div className="page-heading compact">
        <p className="eyebrow">Preview</p>
        <h1>{poster?.title || "Generating poster"}</h1>
      </div>

      {error && <div className="notice error">{error}</div>}

      {isLoading && !error && (
        <div className="loading-panel">
          <span className="spinner" />
          <p>Your poster is being generated.</p>
        </div>
      )}

      {poster?.status === "failed" && (
        <div className="notice error">Poster generation failed. Check API keys and server logs, then try again.</div>
      )}

      {poster?.status === "done" && (
        <div className="preview-layout">
          <div className="preview-workspace">
            {edit && (
              <form id="poster-edit-form" className="editor-panel interactive-panel" onMouseMove={updateCursorVars} onMouseLeave={resetCursorVars} onSubmit={handleRegenerate}>
                <div className="section-row">
                  <h2>Edit poster</h2>
                  <button className="button primary" type="submit" disabled={saving}>
                    {saving ? "Applying..." : "Apply changes"}
                  </button>
                </div>

                {selectedLayer && (
                  <div className="section-row layer-actions">
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => toggleLayerRemoval(selectedLayer)}
                    >
                      {isRemovedLayer(selectedLayer) ? `Restore ${selectedLayer}` : `Remove ${selectedLayer}`}
                    </button>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => resetDraggedPosition(selectedLayer)}
                    >
                      Reset position
                    </button>
                  </div>
                )}

                <label>
                  Poster Title
                  <input
                    value={edit.poster_title}
                    onChange={(event) => updateEditField("poster_title", event.target.value)}
                  />
                </label>

                <label>
                  Heading
                  <input
                    value={edit.manual_heading}
                    onChange={(event) => updateEditField("manual_heading", event.target.value)}
                  />
                </label>

                <label>
                  Body
                  <textarea
                    rows="3"
                    value={edit.manual_body}
                    onChange={(event) => updateEditField("manual_body", event.target.value)}
                  />
                </label>

                <label>
                  Footer
                  <input
                    value={edit.manual_footer}
                    onChange={(event) => updateEditField("manual_footer", event.target.value)}
                  />
                </label>

                <div className="details-edit-panel">
                  <span className="field-title">Poster details</span>
                  <div className="control-grid">
                    {(detailFieldSets[poster.category] || []).filter((field) => field.type !== "schedule").map((field) => (
                      <label key={field.name} className={field.type === "textarea" ? "wide-field" : ""}>
                        {field.label}
                        {field.type === "textarea" ? (
                          <textarea
                            rows="3"
                            value={edit[field.name] || ""}
                            onChange={(event) => updateEditField(field.name, event.target.value)}
                          />
                        ) : (
                          <input
                            type={field.type}
                            value={edit[field.name] || ""}
                            onChange={(event) => updateEditField(field.name, event.target.value)}
                          />
                        )}
                      </label>
                    ))}
                  </div>

                  {(detailFieldSets[poster.category] || []).some((field) => field.type === "schedule") && (
                    <div className="schedule-editor compact-schedule">
                      <div className="section-row">
                        <h2>Schedule</h2>
                        <button type="button" className="button secondary small" onClick={addPeriod}>Add Period</button>
                      </div>
                      {(edit.schedule || [{ ...emptyPeriod }]).map((period, index) => (
                        <div className="period-grid" key={`${period.day}-${index}`}>
                          {Object.keys(emptyPeriod).map((key) => (
                            <label key={key}>
                              {key.charAt(0).toUpperCase() + key.slice(1)}
                              <input
                                value={period[key] || ""}
                                onChange={(event) => updateSchedule(index, key, event.target.value)}
                              />
                            </label>
                          ))}
                          {(edit.schedule || []).length > 1 && (
                            <button type="button" className="button danger small" onClick={() => removePeriod(index)}>Remove</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="control-grid">
                  <label>
                    Design
                    <select value={edit.poster_design} onChange={(event) => updateEditField("poster_design", event.target.value)}>
                      {posterDesigns.map((design) => (
                        <option key={design.value} value={design.value}>{design.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Orientation
                    <select value={edit.orientation} onChange={(event) => updateEditField("orientation", event.target.value)}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </label>
                  <label>
                    Clipart source
                    <select value={edit.clipart_source} onChange={(event) => updateEditField("clipart_source", event.target.value)}>
                      <option value="none">No clipart</option>
                      <option value="internet">Internet clipart</option>
                      <option value="local">Built-in clipart</option>
                    </select>
                  </label>
                  <label>
                    Clipart keyword
                    <input
                      value={edit.clipart_keyword}
                      onChange={(event) => updateEditField("clipart_keyword", event.target.value)}
                    />
                  </label>
                  <label>
                    QR align
                    <select value={edit.qr_align} onChange={(event) => updateEditField("qr_align", event.target.value)}>
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                  <div className="drag-helper-row wide-field">
                    <span>Drag QR on the poster preview. Select it and use arrow keys to nudge.</span>
                    <button className="button secondary small" type="button" onClick={() => resetDraggedPosition("qr")}>Reset QR drag</button>
                  </div>
                  <div className="position-info">
                    <span>QR X: {Number(edit.qr_x ?? qrDragX).toFixed(3)}</span>
                    <span>QR Y: {Number(edit.qr_y ?? qrDragY).toFixed(3)}</span>
                  </div>
                </div>

                <div className="color-panel">
                  <span className="field-title">Poster colors</span>
                  <div className="color-grid">
                    {[
                      ["title_color", "Title"],
                      ["text_color", "Text"],
                      ["accent_color", "Accent"],
                      ["header_color", "Header"],
                    ].map(([name, label]) => (
                      <label className="color-control" key={name}>
                        <span>{label}</span>
                        <input
                          type="color"
                          value={edit[name]}
                          onChange={(event) => updateEditField(name, event.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="background-edit-panel">
                  <span className="field-title">Background image</span>
                  <label>
                    Upload new background
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => setBackgroundFile(event.target.files?.[0] || null)}
                    />
                  </label>
                  {backgroundFile && <p className="helper-text">{backgroundFile.name}</p>}
                </div>

                <div className="slider-grid">
                  {[
                    ["logo_scale", "Logo size", 0.55, 1.8, 0.05],
                    ["badge_scale", "Badge width", 0.65, 1.8, 0.05],
                    ["badge_height_scale", "Badge height", 0.65, 2, 0.05],
                    ["text_scale", "Text size", 0.75, 1.5, 0.05],
                    ["date_scale", "Date size", 0.75, 1.7, 0.05],
                    ["time_scale", "Time size", 0.75, 1.7, 0.05],
                    ["venue_scale", "Venue size", 0.75, 1.7, 0.05],
                    ["clipart_scale", "Clipart size", 0.75, 1.7, 0.05],
                    ["qr_scale", "QR size", 0.7, 1.45, 0.05],
                    ["background_scale", "Background zoom", 1, 1.4, 0.05],
                    ["title_y", "Title position", 0.15, 0.44, 0.01],
                    ["heading_y", "Heading position", 0.32, 0.64, 0.01],
                    ["body_y", "Body position", 0.4, 0.74, 0.01],
                    ["details_y", "Details position", 0.5, 0.82, 0.01],
                    ["footer_y", "Footer position", 0.7, 0.93, 0.01],
                    ["clipart_y", "Clipart position", 0.48, 0.82, 0.01],
                  ].map(([name, label, min, max, step]) => (
                    <label key={name} className="range-control">
                      <span>{label}: {Number(edit[name]).toFixed(2)}x</span>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={edit[name]}
                        onChange={(event) => updateEditField(name, Number(event.target.value))}
                      />
                    </label>
                  ))}
                </div>
              </form>
            )}

            <div className="poster-stage interactive-poster-stage" onMouseMove={updateCursorVars} onMouseLeave={resetCursorVars}>
              <div className="poster-stage-toolbar">
                <div>
                  <p className="eyebrow">Live poster</p>
                  <h2>Edit preview</h2>
                </div>
                <div className="poster-stage-actions">
                  <button className="button secondary small" type="submit" form="poster-edit-form" disabled={saving || !edit}>
                    {saving ? "Applying..." : "Apply changes"}
                  </button>
                </div>
              </div>
              <div
                className="poster-canvas-wrap final-poster-editor"
                ref={posterCanvasRef}
                tabIndex="0"
                onKeyDown={nudgeSelectedLayer}
              >
                <img className="poster-preview" src={canvasImageUrl} alt={poster.title} draggable="false" />
                {edit && hasLogo && !isRemovedLayer("logo") && (
                  <button
                    className={`drag-handle drag-logo ${edit.badge_enabled ? "badge-preview" : ""} ${selectedLayer === "logo" ? "selected" : ""}`}
                    type="button"
                    style={{ left: `${logoDragX * 100}%`, top: `${logoDragY * 100}%`, ...logoPreviewSize }}
                    onPointerDown={(event) => beginPosterDrag("logo", event)}
                    onClick={() => setSelectedLayer("logo")}
                    aria-label="Drag logo and badge"
                  >
                    {logoPreviewUrl && <img src={logoPreviewUrl} alt="" draggable="false" />}
                    <i className="resize-edge" onPointerDown={(event) => beginLayerResize("logo_scale", event)} />
                  </button>
                )}
                {edit && hasQr && !isRemovedLayer("qr") && (
                  <button
                    className={`drag-handle drag-qr ${selectedLayer === "qr" ? "selected" : ""}`}
                    type="button"
                    style={{ left: `${qrDragX * 100}%`, top: `${qrDragY * 100}%`, width: qrPreviewSize, height: qrPreviewSize }}
                    onPointerDown={(event) => beginPosterDrag("qr", event)}
                    onClick={() => setSelectedLayer("qr")}
                    aria-label="Drag QR"
                  >
                    <span>QR</span>
                    {qrPreviewUrl && <img src={qrPreviewUrl} alt="" draggable="false" />}
                    <i className="resize-edge" onPointerDown={(event) => beginLayerResize("qr_scale", event)} />
                  </button>
                )}
                {edit && hasInstitution && !isRemovedLayer("institution") && (
                  <div
                    className={`drag-handle drag-institution ${selectedLayer === "institution" ? "selected" : ""}`}
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck={false}
                    style={{
                      left: `${institutionDragX * 100}%`,
                      top: `${institutionDragY * 100}%`,
                      width: "260px",
                      maxWidth: "76%",
                      height: "auto",
                      padding: "4px 8px",
                      color: liveHeaderColor,
                      fontSize: `${Math.round(11 * previewScale * Number(edit?.institution_scale || 1))}px`,
                      fontFamily: previewBodyFont,
                    }}
                    onPointerDown={(event) => beginPosterDrag("institution", event)}
                    onClick={() => setSelectedLayer("institution")}
                    onInput={(event) => updateEditField("institution_name", event.currentTarget.textContent || "")}
                    aria-label="Edit and drag institution name"
                  >
                    <strong>{edit.institution_name}</strong>
                  </div>
                )}
                {edit && hasTitle && !isRemovedLayer("title") && (
                  <div
                    className={`drag-handle drag-title ${selectedLayer === "title" ? "selected" : ""}`}
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck={false}
                    style={{
                      left: `${titleDragX * 100}%`,
                      top: `${titleDragY * 100}%`,
                      width: titlePreviewWidth,
                      maxWidth: "86%",
                      height: "auto",
                      padding: "6px 10px",
                      color: liveTitleColor,
                      fontSize: `${Math.round((isFeePoster ? 27 : 30) * previewScale)}px`,
                      fontFamily: previewTitleFont,
                      lineHeight: 0.9,
                      textTransform: "uppercase",
                    }}
                    onPointerDown={(event) => beginPosterDrag("title", event)}
                    onClick={() => setSelectedLayer("title")}
                    onInput={(event) => updateEditField("poster_title", event.currentTarget.textContent || "")}
                    aria-label="Edit and drag title"
                  >
                    <strong>{edit.poster_title || poster.title || "Title text"}</strong>
                  </div>
                )}
                {edit && hasHeading && !isRemovedLayer("heading") && (
                  <div
                    className={`drag-handle drag-heading ${selectedLayer === "heading" ? "selected" : ""}`}
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck={false}
                    style={{
                      left: `${headingDragX * 100}%`,
                      top: `${headingDragY * 100}%`,
                      width: bodyPreviewWidth,
                      maxWidth: "82%",
                      height: "auto",
                      padding: "4px 8px",
                      color: liveTextColor,
                      fontSize: `${Math.round(19 * previewScale)}px`,
                      fontFamily: previewBodyFont,
                    }}
                    onPointerDown={(event) => beginPosterDrag("heading", event)}
                    onClick={() => setSelectedLayer("heading")}
                    onInput={(event) => updateEditField("manual_heading", event.currentTarget.textContent || "")}
                    aria-label="Edit and drag heading"
                  >
                    <strong>{edit.manual_heading || poster.ai_heading || "Heading text"}</strong>
                  </div>
                )}
                {edit && hasBody && !isRemovedLayer("body") && (
                  <div
                    className={`drag-handle drag-body ${selectedLayer === "body" ? "selected" : ""}`}
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck={false}
                    style={{
                      left: `${bodyDragX * 100}%`,
                      top: `${bodyDragY * 100}%`,
                      width: bodyPreviewWidth,
                      maxWidth: "82%",
                      height: "auto",
                      padding: "4px 8px",
                      color: liveTextColor,
                      fontSize: `${Math.round((isFeePoster ? 11 : 14) * previewScale)}px`,
                      fontFamily: previewBodyFont,
                    }}
                    onPointerDown={(event) => beginPosterDrag("body", event)}
                    onClick={() => setSelectedLayer("body")}
                    onInput={(event) => updateEditField("manual_body", event.currentTarget.textContent || "")}
                    aria-label="Edit and drag body"
                  >
                    <strong>{edit.manual_body || poster.ai_body || "Body text"}</strong>
                  </div>
                )}
                {edit && hasDetails && !isRemovedLayer("details") && (
                  <div
                    className={`drag-handle drag-details ${selectedLayer === "details" ? "selected" : ""}`}
                    style={{
                      left: `${detailsDragX * 100}%`,
                      top: `${detailsDragY * 100}%`,
                      width: bodyPreviewWidth,
                      maxWidth: "82%",
                      height: "auto",
                      padding: "4px 8px",
                      color: liveTextColor,
                      fontSize: `${Math.round(11 * previewScale)}px`,
                      fontFamily: previewBodyFont,
                    }}
                    onPointerDown={(event) => beginPosterDrag("details", event)}
                    onClick={() => setSelectedLayer("details")}
                    aria-label="Drag details"
                  >
                    <strong>{detailSummary(edit) || "Poster details"}</strong>
                  </div>
                )}
                {edit && hasDate && !isRemovedLayer("date") && (
                  <div
                    className={`drag-handle drag-data-pill drag-date ${selectedLayer === "date" ? "selected" : ""}`}
                    style={{ left: `${dateDragX * 100}%`, top: `${dateDragY * 100}%`, width: "auto", minWidth: "96px", height: "auto", padding: "4px 6px", color: liveTextColor, "--accent-color": liveAccentColor, fontFamily: previewBodyFont, fontSize: `${Math.round(11 * previewScale * Number(edit?.date_scale || 1))}px` }}
                    onPointerDown={(event) => beginPosterDrag("date", event)}
                    onClick={() => setSelectedLayer("date")}
                    aria-label="Drag date"
                  >
                    <strong><span>Date</span>{dateText}</strong>
                  </div>
                )}
                {edit && hasTime && !isRemovedLayer("time") && (
                  <div
                    className={`drag-handle drag-data-pill drag-time ${selectedLayer === "time" ? "selected" : ""}`}
                    style={{ left: `${timeDragX * 100}%`, top: `${timeDragY * 100}%`, width: "auto", minWidth: "96px", height: "auto", padding: "4px 6px", color: liveTextColor, "--accent-color": liveAccentColor, fontFamily: previewBodyFont, fontSize: `${Math.round(11 * previewScale * Number(edit?.time_scale || 1))}px` }}
                    onPointerDown={(event) => beginPosterDrag("time", event)}
                    onClick={() => setSelectedLayer("time")}
                    aria-label="Drag time"
                  >
                    <strong><span>Time</span>{timeText}</strong>
                  </div>
                )}
                {edit && hasVenue && !isRemovedLayer("venue") && (
                  <div
                    className={`drag-handle drag-data-pill drag-venue ${selectedLayer === "venue" ? "selected" : ""}`}
                    style={{ left: `${venueDragX * 100}%`, top: `${venueDragY * 100}%`, width: "auto", minWidth: "120px", height: "auto", padding: "4px 6px", color: liveTextColor, "--accent-color": liveAccentColor, fontFamily: previewBodyFont, fontSize: `${Math.round(11 * previewScale * Number(edit?.venue_scale || 1))}px` }}
                    onPointerDown={(event) => beginPosterDrag("venue", event)}
                    onClick={() => setSelectedLayer("venue")}
                    aria-label="Drag venue"
                  >
                    <strong><span>Venue</span>{venueText}</strong>
                  </div>
                )}
                {edit && hasContact && !isRemovedLayer("contact") && (
                  <div
                    className={`drag-handle drag-data-pill drag-contact ${selectedLayer === "contact" ? "selected" : ""}`}
                    style={{ left: `${contactDragX * 100}%`, top: `${contactDragY * 100}%`, width: "auto", minWidth: "120px", height: "auto", padding: "4px 6px", color: liveTextColor, fontFamily: previewBodyFont }}
                    onPointerDown={(event) => beginPosterDrag("contact", event)}
                    onClick={() => setSelectedLayer("contact")}
                    aria-label="Drag mobile number"
                  >
                    <strong>{contactText}</strong>
                  </div>
                )}
                {edit && edit.clipart_source !== "none" && !isRemovedLayer("clipart") && (
                  <button
                    className={`drag-handle drag-clipart ${selectedLayer === "clipart" ? "selected" : ""}`}
                    type="button"
                    style={{ left: `${clipartDragX * 100}%`, top: `${clipartDragY * 100}%`, width: "100px", height: "100px" }}
                    onPointerDown={(event) => beginPosterDrag("clipart", event)}
                    onClick={() => setSelectedLayer("clipart")}
                    aria-label="Drag clipart"
                  >
                    <span>Clipart</span>
                    <i className="resize-edge" onPointerDown={(event) => beginLayerResize("clipart_scale", event)} />
                  </button>
                )}
                {edit && !isRemovedLayer("footer") && (
                  <div
                    className={`drag-handle drag-footer ${selectedLayer === "footer" ? "selected" : ""}`}
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck={false}
                    style={{
                      left: `${footerDragX * 100}%`,
                      top: `${footerDragY * 100}%`,
                      width: "auto",
                      minWidth: "220px",
                      height: "auto",
                      padding: "10px 14px",
                      color: liveAccentColor,
                      fontSize: `${Math.round(13 * previewScale)}px`,
                    }}
                    onPointerDown={(event) => beginPosterDrag("footer", event)}
                    onClick={() => setSelectedLayer("footer")}
                    onInput={(event) => updateEditField("manual_footer", event.currentTarget.textContent || "")}
                    aria-label="Edit and drag footer text"
                  >
                    <strong>{edit.manual_footer || "Scan QR for location"}</strong>
                  </div>
                )}
              </div>
            </div>

            {finalPosterUrl && (
              <section className="download-preview-panel" aria-label="Downloadable poster preview">
                <div className="section-row">
                  <div>
                    <p className="eyebrow">Download preview</p>
                    <h2>Final poster</h2>
                  </div>
                  <button className="button primary small" type="button" onClick={handleDownload} disabled={downloading}>
                    {downloading ? "Downloading..." : "Download"}
                  </button>
                </div>
                <img className="download-poster-preview" src={finalPosterUrl} alt={`${poster.title} final downloadable poster`} draggable="false" />
              </section>
            )}
          </div>

          <div className="preview-actions">
            <Link className="button secondary" to="/">Create another</Link>
          </div>
        </div>
      )}
    </section>
  );
}

export default Preview;
