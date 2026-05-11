import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api.js";

const categories = ["all", "exam", "fee", "wishes", "announcement", "class", "timetable"];

function Gallery() {
  const navigate = useNavigate();
  const [posters, setPosters] = useState([]);
  const [brokenThumbs, setBrokenThumbs] = useState({});
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchPosters(nextFilter = filter) {
    setLoading(true);
    setError("");
    try {
      const url = nextFilter === "all" ? "/api/posters" : `/api/posters?category=${nextFilter}`;
      const response = await api.get(url);
      setPosters(response.data);
    } catch (fetchError) {
      setError(fetchError.response?.data?.message || "Unable to load gallery.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPosters("all");
  }, []);

  async function handleFilter(category) {
    setFilter(category);
    await fetchPosters(category);
  }

  async function deletePoster(event, id) {
    event.stopPropagation();
    await api.delete(`/api/posters/${id}`);
    setPosters((current) => current.filter((poster) => poster.id !== id));
  }

  function updateCursorVars(event) {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const rotateY = ((x / rect.width) - 0.5) * 10;
    const rotateX = ((0.5 - y / rect.height)) * 8;

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
    <section className="page-section">
      <div className="page-heading compact">
        <p className="eyebrow">Generated assets</p>
        <h1>Gallery</h1>
      </div>

      <div className="filter-row">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className={`filter-button ${filter === category ? "active" : ""}`}
            onClick={() => handleFilter(category)}
          >
            {category}
          </button>
        ))}
      </div>

      {error && <div className="notice error">{error}</div>}
      {loading && <div className="loading-inline">Loading posters...</div>}

      {!loading && posters.length === 0 && <div className="empty-state">No posters found.</div>}

      <div className="gallery-grid">
        {posters.map((poster) => {
          const thumb = poster.final_poster_path ? `${api.defaults.baseURL}${poster.final_poster_path}` : "";
          const showThumb = thumb && !brokenThumbs[poster.id];
          return (
            <article
              className="poster-card"
              key={poster.id}
              onMouseMove={updateCursorVars}
              onMouseLeave={resetCursorVars}
              onClick={() => navigate(`/preview/${poster.id}`)}
            >
              <div className="thumb-wrap">
                {showThumb ? (
                  <img
                    src={thumb}
                    alt={poster.title}
                    onError={() => setBrokenThumbs((current) => ({ ...current, [poster.id]: true }))}
                  />
                ) : (
                  <span>{poster.status}</span>
                )}
              </div>
              <div className="poster-card-body">
                <span className="badge">{poster.category}</span>
                <h2>{poster.title}</h2>
                <p>{new Date(poster.createdAt).toLocaleDateString()}</p>
                <button className="button danger small" type="button" onClick={(event) => deletePoster(event, poster.id)}>
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default Gallery;
