// src/pages/Mood.jsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";

import CTAButton from "../components/CTAButton";

// mood images (place in src/assets/)
import HappyImg from "../assets/happy.png";
import SadImg from "../assets/sad.png";
import AngryImg from "../assets/angry.png";
import CalmImg from "../assets/calm.png";

const MOODS = [
  { key: "happy", img: HappyImg },
  { key: "sad", img: SadImg },
  { key: "angry", img: AngryImg },
  { key: "calm", img: CalmImg },
];

/* ---------------- Mood Circle ---------------- */
function MoodCircle({ label, img, active, onClick }) {
  return (
    <div className="flex flex-col items-center select-none">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={label}
        className={[
          "aspect-square",
          "w-28 sm:w-32 md:w-24 lg:w-36", // ⬅️ shrink in tablet (md) to fit 4 in one row
          "rounded-full overflow-hidden transition-all duration-200 ease-out",
          "flex items-center justify-center",
          "focus:outline-none focus-visible:outline-none",
          active
            ? "ring-4 ring-[#FFC84A] shadow-[0_0_12px_#FFC84A80] scale-105"
            : "ring-0 hover:ring-2 hover:ring-[#FFC84A] hover:shadow-[0_0_8px_#FFC84A50]",
        ].join(" ")}
      >
        <img
          src={img}
          alt={label}
          className="w-full h-full object-contain rounded-full"
          draggable={false}
        />
      </button>
      <span
        className={`mt-3 font-bold text-base sm:text-lg transition-colors ${
          active ? "text-[#2E4BFF]" : "text-black"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

/* ---------------- Floating CTA ---------------- */
function FloatingCTA({ disabled, onClick, children }) {
  return createPortal(
    <div
      className="fixed z-[9999] pointer-events-auto"
      style={{
        right: "calc(env(safe-area-inset-right, 0px) + 1.5rem)",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)",
      }}
    >
      <CTAButton onClick={onClick} disabled={disabled}>
        {children}
      </CTAButton>
    </div>,
    document.body
  );
}

/* ---------------- Main Page ---------------- */
export default function Mood() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [mood, setMood] = useState(null);

  function next() {
    if (!mood) return;
    localStorage.setItem("hmh_mood", mood);
    nav("/time");
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden"
      style={{ background: "#D7E6FF" }}
    >
      {/* Title */}
      <header className="text-center mb-2">
        <h1
          className="
            text-xl
            sm:text-2xl
            md:text-4xl
            lg:text-5xl
            font-extrabold text-[#2e4bff] mb-7 whitespace-nowrap
          "
        >
          {t("mood_title")}
        </h1>
        <p
          className="
            mb-10
            text-sm
            sm:text-base
            md:text-lg
            lg:text-xl
            text-[#000000]
          "
        >
          {t("tap_mood")}
        </p>
      </header>

      {/* Mood options → flex with wrap, shrink buttons only on tablet */}
      <main className="flex items-center justify-center gap-10 sm:gap-16 flex-wrap mb-15">
        {MOODS.map((m) => (
          <MoodCircle
            key={m.key}
            img={m.img}
            label={t(m.key)}
            active={mood === m.key}
            onClick={() => setMood(m.key)}
          />
        ))}
      </main>

      {/* Floating CTA */}
      <FloatingCTA disabled={!mood} onClick={next}>
        {t("next")}
      </FloatingCTA>
    </div>
  );
}
