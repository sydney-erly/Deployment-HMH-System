// src/pages/GraduationScene.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";

export default function GraduationScene({ videoSrc = "/assets/graduation.mp4" }) {
  const nav = useNavigate();
  const videoRef = useRef(null);
  const [started, setStarted] = useState(false);
  const [showStart, setShowStart] = useState(false); // iOS autoplay fallback
  const [rotate, setRotate] = useState(false);
  const MAX_MS = 15000; // safety timeout (match your 10–15s video)

  const goToDashboard = () => nav("/student-dashboard");

  const tryOrientationLock = async () => {
    try {
      if (screen.orientation?.lock) {
        await screen.orientation.lock("landscape");
      }
    } catch {
      /* ignore */
    }
  };

  const markGraduated = async () => {
    try {
      await apiFetch("/api/student/mark-graduated", { method: "POST" });
    } catch {
      /* ignore silently */
    }
  };

  // rotate UI if device is portrait (CSS fallback when lock not possible)
  useEffect(() => {
    const checkRotate = () => {
      setRotate(window.innerHeight > window.innerWidth);
    };
    checkRotate();
    window.addEventListener("resize", checkRotate);
    return () => window.removeEventListener("resize", checkRotate);
  }, []);

  // attempt autoplay (muted) for best cross-device behavior
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    v.muted = true;
    const p = v.play();
    if (p?.catch) {
      p.catch(() => setShowStart(true));
    }

    // fail-safe
    const t = setTimeout(goToDashboard, MAX_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCanPlay = () => {
    // if autoplay succeeded, we may already be playing
    if (!started) {
      setStarted(true);
      tryOrientationLock();
      markGraduated();
    }
  };

  const beginWithGesture = async () => {
    const v = videoRef.current;
    if (!v) return;
    await tryOrientationLock();
    setStarted(true);
    setShowStart(false);
    v.muted = false; // after user gesture, let audio play
    try {
      await v.play();
    } catch {
      // if still blocked, revert to muted
      v.muted = true;
      try { await v.play(); } catch { /* give up gracefully */ }
    }
    markGraduated();
  };

  return (
    <div className="fixed inset-0 bg-black text-white flex items-center justify-center">
      <div
        className={`relative w-full h-full ${rotate ? "rotate-90" : ""} origin-center overflow-hidden`}
        style={{ touchAction: "manipulation" }}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          src={videoSrc}
          autoPlay
          playsInline
          onEnded={goToDashboard}
          onCanPlay={onCanPlay}
        />

        {/* Skip shows after 3s */}
        <SkipButton onClick={goToDashboard} />

        {/* iOS / autoplay fallback */}
        {showStart && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={beginWithGesture}
              className="px-6 py-3 rounded-2xl bg-white text-black text-lg font-semibold shadow"
            >
              Tap to Play
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SkipButton({ onClick }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <button
      onClick={onClick}
      className="absolute top-4 right-4 bg-white/90 text-black px-4 py-2 rounded-xl shadow"
    >
      Skip
    </button>
  );
}
