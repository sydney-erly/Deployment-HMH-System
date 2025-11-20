import React, { useEffect, useState } from "react";
import Confetti from "react-confetti";
import { useNavigate } from "react-router-dom";

export default function Celebration({ stars }) {
  const nav = useNavigate();
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    function handleResize() {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-hmhBeige z-50">
      <Confetti width={dimensions.width} height={dimensions.height} />

      <h1 className="text-3xl font-bold mb-6">🎉 Lesson Completed!</h1>

      <div className="flex gap-4 text-5xl mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <span key={i}>{i < stars ? "⭐" : "☆"}</span>
        ))}
      </div>

      <button
        className="hmh-btn hmh-btn-check"
        onClick={() => nav("/dashboard")}
      >
        Back to Dashboard
      </button>
    </div>
  );
}
