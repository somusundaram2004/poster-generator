import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Gallery from "./pages/Gallery.jsx";
import Preview from "./pages/Preview.jsx";
import PosterForm from "./components/PosterForm.jsx";

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="topbar">
          <Link to="/" className="brand">
            <span className="brand-icon" aria-hidden="true">PDS</span>
            <span>Poster Design Studio</span>
          </Link>
          <nav>
            <Link to="/">Home</Link>
            <Link to="/gallery">Gallery</Link>
          </nav>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/create/:category" element={<PosterForm />} />
            <Route path="/preview/:id" element={<Preview />} />
            <Route path="/gallery" element={<Gallery />} />
          </Routes>
        </main>
        <footer className="site-footer">
          <span className="developer-credit">Developed by Somusundaram</span>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
