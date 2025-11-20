//frontend/src/pages/Language.jsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";

import UsFlag from "../assets/us.svg";
import PhFlag from "../assets/ph.svg";
import CTAButton from "../components/CTAButton";

/* ---------------- Flag Card ---------------- */
function LangCard({ label, img, alt, active, onClick }) {
  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={label}
        className={[
          "flex items-center justify-center",
      "aspect-square", // ⬅️ keeps it always a square
    "h-32 sm:h-40 md:h-48 lg:h-56", // height defines the square size
          "rounded-3xl bg-white shadow-md transition-all duration-200 ease-out",
          active
            ? "ring-8 ring-[#FFC84A] shadow-[0_0_25px_#FFC84A80] scale-105"
            : "ring-2 ring-gray-200 hover:ring-4 hover:ring-[#FFC84A] hover:shadow-[0_0_15px_#FFC84A60]"
        ].join(" ")}
      >
        <img
          src={img}
          alt={alt}
          className="h-18 w-26 sm:h-22 sm:w-30 md:h-26 md:w-34 lg:h-34 lg:w-38 object-contain"
          draggable={false}
        />
      </button>


      <span
        className={[
          "mt-8 font-semibold tracking-wide",
          "text-sm sm:text-base lg:text-2xl",
          active ? "text-[#2e4bff]" : "text-[#000000]"
        ].join(" ")}
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
      className="fixed z-[9999]"
      style={{
        right: "calc(env(safe-area-inset-right, 0px) + 1.5rem)",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)"
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
export default function Language() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const [lang, setLang] = useState(null);

  function next() {
    if (!lang) return;
    i18n.changeLanguage(lang);
    localStorage.setItem("hmh_lang", lang);
    nav("/mood");
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden"
      style={{ background: "#D7E6FF" }}
    >
  <header className = "text-center mb-10">
    {/* ⬇️ THIS is the "Which language do you like" title */}
  <h1 className="
    text-2xl        /* mobile */
    sm:text-3xl     /* small screens (≥640px) */
    md:text-4xl     /* tablets (≥768px) */
    lg:text-5xl     /* desktops (≥1024px) */
    font-extrabold text-[#2e4bff] mb-7 whitespace-nowrap
  ">
  {t("language_title")}
  </h1>


    <p className="
      mt-2
      text-lg        /* mobile */
      sm:text-1xl   /* small screens (≥640px) */
      md:text-2xl     /* tablets (≥768px) */
      lg:text-2xl     /* desktops (≥1024px) */
    text-[#000000]">
    {t("tap_language")}
  </p>

  </header>


      {/* Cards */}
      <main className="flex items-center justify-center gap-10 sm:gap-16 flex-wrap">
        <LangCard
          label={t("english")}
          img={UsFlag}
          alt="English"
          active={lang === "en"}
          onClick={() => setLang("en")}
        />
        <LangCard
          label={t("tagalog")}
          img={PhFlag}
          alt="Tagalog"
          active={lang === "tl"}
          onClick={() => setLang("tl")}
        />
      </main>

      {/* CTA Button in Bottom Right */}
      <FloatingCTA disabled={!lang} onClick={next}>
        {t("next")}
      </FloatingCTA>
    </div>
  );
}
