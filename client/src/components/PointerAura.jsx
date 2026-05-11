import { useEffect } from "react";

function PointerAura() {
  useEffect(() => {
    function handlePointerMove(event) {
      document.documentElement.style.setProperty("--page-cursor-x", `${event.clientX}px`);
      document.documentElement.style.setProperty("--page-cursor-y", `${event.clientY}px`);
    }

    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  return <div className="pointer-aura" aria-hidden="true" />;
}

export default PointerAura;
