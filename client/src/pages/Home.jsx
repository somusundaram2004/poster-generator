import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api.js";

const categories = [
  { key: "exam", icon: "A+", name: "Exam Poster", description: "Formal exam schedules, halls, and instructions." },
  { key: "fee", icon: "₹", name: "Fee Notice", description: "Clear payment posters with due dates and account details." },
  { key: "wishes", icon: "★", name: "Wishes Card", description: "Warm greeting posters for celebrations and special occasions." },
  { key: "announcement", icon: "!", name: "Announcement", description: "Bold institutional poster layouts for important updates." },
  { key: "class", icon: "Aa", name: "Class Poster", description: "Class reminder posters with room, teacher, and timing details." },
  { key: "timetable", icon: "▦", name: "Timetable", description: "Structured schedule poster grids for batches and departments." },
];

const workflowSteps = [
  {
    step: "01",
    title: "Select",
    description: "Choose the poster type that matches the campus notice.",
    visual: "format",
  },
  {
    step: "02",
    title: "Fill Form",
    description: "Add only the details you need, then upload logos or a background.",
    visual: "form",
  },
  {
    step: "03",
    title: "Generate",
    description: "The studio creates the layout, artwork, text blocks, and QR placement.",
    visual: "generate",
  },
  {
    step: "04",
    title: "Edit",
    description: "Tune wording, colors, sizes, and spacing before downloading.",
    visual: "edit",
  },
];

const typingFields = ["Exam Poster", "Subject", "Date", "Hall"];

function Home() {
  const navigate = useNavigate();
  const [dailyStats, setDailyStats] = useState({ count: 0, limit: 20, remaining: 20, percent: 0, windowLabel: "today" });

  function updateHomePointer(event) {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const depthX = ((x / rect.width) - 0.5) * 26;
    const depthY = ((y / rect.height) - 0.5) * 22;

    target.style.setProperty("--home-pointer-x", `${x}px`);
    target.style.setProperty("--home-pointer-y", `${y}px`);
    target.style.setProperty("--home-depth-x", `${depthX}px`);
    target.style.setProperty("--home-depth-y", `${depthY}px`);
  }

  function resetHomePointer(event) {
    const target = event.currentTarget;
    target.style.setProperty("--home-depth-x", "0px");
    target.style.setProperty("--home-depth-y", "0px");
  }

  function updateCursorVars(event) {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const rotateY = ((x / rect.width) - 0.5) * 12;
    const rotateX = ((0.5 - y / rect.height)) * 10;

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

  useEffect(() => {
    let active = true;
    api.get("/api/posters/stats/daily")
      .then((response) => {
        if (active) setDailyStats(response.data);
      })
      .catch(() => {
        if (active) setDailyStats({ count: 0, limit: 20, remaining: 20, percent: 0, windowLabel: "today" });
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="page-section home-studio-page" onMouseMove={updateHomePointer} onMouseLeave={resetHomePointer}>
      <div className="home-hero">
        <div className="page-heading">
          <p className="eyebrow">Centralized campus communications</p>
          <h1>Poster Design Studio</h1>
          <p>Create AI-assisted campus posters with editable text, logos, backgrounds, clipart, color controls, and print-ready downloads.</p>
          <div className="studio-toolstrip" aria-label="Poster design tools">
            {["Type", "Logo", "QR", "Art", "Color"].map((tool) => (
              <span key={tool}>{tool}</span>
            ))}
          </div>
        </div>

        <div className="poster-studio-preview" aria-hidden="true" onMouseMove={updateCursorVars} onMouseLeave={resetCursorVars}>
          <div className="studio-canvas">
            <div className="cursor-depth-rig">
              <span className="cursor-ring" />
              <span className="cursor-lift-card" />
              <span className="cursor-depth-line" />
            </div>
            <span className="crop-mark top-left" />
            <span className="crop-mark top-right" />
            <span className="crop-mark bottom-left" />
            <span className="crop-mark bottom-right" />
            <div className="mini-poster-sheet sheet-main">
              <span className="mini-logo" />
              <span className="mini-title" />
              <span className="mini-line short" />
              <span className="mini-line" />
              <span className="mini-qr" />
            </div>
            <div className="mini-poster-sheet sheet-back" />
            <div className="floating-swatch swatch-one" />
            <div className="floating-swatch swatch-two" />
            <div className="floating-ruler">1080 x 1530</div>
          </div>
        </div>
      </div>

      <div className="daily-meter" aria-label="Daily poster generation usage">
        <div>
          <p className="eyebrow">Daily limit</p>
          <h2>{dailyStats.count} of {dailyStats.limit} posters generated {dailyStats.windowLabel || "today"}</h2>
          <p>{dailyStats.remaining} poster{dailyStats.remaining === 1 ? "" : "s"} remaining in this daily window.</p>
        </div>
        <div className="meter-track" role="progressbar" aria-valuenow={dailyStats.percent} aria-valuemin="0" aria-valuemax="100">
          <span style={{ width: `${dailyStats.percent}%` }} />
        </div>
      </div>

      <div className="workflow-strip" aria-label="Poster creation workflow">
        {[
          ["01", "Pick format"],
          ["02", "Place content"],
          ["03", "Tune layout"],
          ["04", "Export poster"],
        ].map(([step, label]) => (
          <div className="workflow-step" key={step}>
            <span>{step}</span>
            <strong>{label}</strong>
          </div>
        ))}
      </div>

      <section className="how-it-works cinematic-flow" aria-labelledby="how-it-works-title">
        <div className="section-heading">
          <p className="eyebrow">How the site works</p>
          <h2 id="how-it-works-title">From form to finished poster</h2>
        </div>

        <div className="workflow-movie" aria-hidden="true">
          <div className="movie-screen">
            <div className="movie-scene scene-select">
              <span className="movie-label">Select</span>
              <div className="movie-option active">Exam Poster</div>
              <div className="movie-option">Fee Notice</div>
              <div className="movie-option">Timetable</div>
            </div>
            <div className="movie-scene scene-form">
              <span className="movie-label">Fill Form</span>
              {typingFields.map((field, index) => (
                <div className="typing-row" style={{ "--typing-delay": `${index * 0.35}s` }} key={field}>
                  <span>{field}</span>
                  <i />
                </div>
              ))}
            </div>
            <div className="movie-scene scene-generate">
              <span className="movie-label">Generate</span>
              <span className="generate-ring" />
              <span className="generate-spark one" />
              <span className="generate-spark two" />
              <span className="generate-spark three" />
            </div>
            <div className="movie-scene scene-edit">
              <span className="movie-label">Edit</span>
              <div className="edit-slider"><span /></div>
              <div className="edit-slider short"><span /></div>
              <div className="color-dots"><i /><i /><i /></div>
            </div>
            <div className="movie-scene scene-final">
              <span className="movie-label">Final Poster</span>
              <div className="final-poster-card">
                <span className="final-logo" />
                <span className="final-title" />
                <span className="final-line" />
                <span className="final-line short" />
              </div>
            </div>
          </div>
          <div className="movie-timeline">
            {workflowSteps.map((item) => (
              <span key={item.step}>{item.title}</span>
            ))}
          </div>
        </div>

        <div className="movie-copy">
          {workflowSteps.map((item) => (
            <article key={item.step}>
              <span>{item.step}</span>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="category-grid">
        {categories.map((category) => (
          <button
            key={category.key}
            className="category-card"
            type="button"
            onMouseMove={updateCursorVars}
            onMouseLeave={resetCursorVars}
            onClick={() => navigate(`/create/${category.key}`)}
          >
            <span className="category-icon">{category.icon}</span>
            <span className="category-name">{category.name}</span>
            <span className="category-description">{category.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default Home;
