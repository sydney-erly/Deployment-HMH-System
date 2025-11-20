// src/pages/Time.jsx
import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";

import { apiFetch } from "../lib/api";
import { auth } from "../lib/auth";
import CTAButton from "../components/CTAButton";

const OPTIONS = [5, 10, 15, 20];

/* --- Time Option Card --- */
function TimeOption({ minutes, active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-56 sm:w-64 h-14 rounded-xl font-semibold text-lg",
        "transition-all duration-200 ease-out",
        "bg-[#FFC84A] text-[#1A1A1A]",
        "shadow-[0_5px_0_#D9A73A] hover:brightness-105 active:translate-y-[2px] active:shadow-[0_3px_0_#D9A73A]",
        active
          ? "ring-4 ring-[#FFC84A] shadow-[0_0_15px_#FFC84A80] scale-105"
          : "ring-0 hover:ring-2 hover:ring-[#FFC84A] hover:shadow-[0_0_8px_#FFC84A50]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

/* --- Floating CTA --- */
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

/* --- Main Page --- */
export default function Time() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth.token()) nav("/login");
  }, [nav]);

  const lang = (localStorage.getItem("hmh_lang") || i18n.language || "en").toLowerCase();
  const mood = localStorage.getItem("hmh_mood") || "neutral";

  /* --- Start Session --- */
  async function start() {
    if (!sel || busy) return;
    setBusy(true);
    try {
      const res = await apiFetch("/student/create-session", {
        method: "POST",
        token: auth.token(),
        body: { minutes: sel, mood, language: lang },
      });

      // Handle cooldown or active block from backend
      if (res.blocked) {
        if (res.reason === "session_recent") {
          alert(
            lang === "tl"
              ? "Nakumpleto mo na ang iyong sesyon ngayon. Subukang muli bukas!"
              : "You already finished a session today. Please try again tomorrow!"
          );
          localStorage.removeItem("hmh_session");
          window.location.href = "/session-over";
          return;
        }

        if (res.reason === "session_active") {
          const existing = localStorage.getItem("hmh_session");
          if (existing) {
            //  Resume dashboard instead of ending
            window.location.href = "/student-dashboard";
          } else {
            alert(
              lang === "tl"
                ? "May aktibo o nakabinbing sesyon pa."
                : "You still have an active or pending session."
            );
            window.location.href = "/session-over";
          }
          return;
        }
      }


      //  Normal flow: save session and go to dashboard
      const { session } = res;
      const endAt = Date.now() + sel * 60 * 1000;

      localStorage.setItem(
        "hmh_session",
        JSON.stringify({
          session_id: session.id,
          minutes: session.minutes_allowed,
          status: session.status,
          endAt,
        })
      );

      nav("/student-dashboard");
    } catch (e) {
      console.error("Failed to create session:", e);
      alert(e.message || "Failed to start session. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /* --- UI --- */
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden"
      style={{
        background: "#D7E6FF",
      }}
    >
      {/* Title */}
      <header className="text-center mb-12 ">
        <h1
          className="
            text-2xl        /* mobile */
            sm:text-3xl     /* ≥640px */
            md:text-4xl     /* ≥768px */
            lg:text-5xl     /* ≥1024px */
            font-extrabold text-[#2e4bff] mb-7 tracking-tight
          "
        >
          {t("time_title")}
        </h1>
        <p
          className="
            text-sm         /* mobile */
            sm:text-base    /* ≥640px */
            md:text-lg      /* ≥768px */
            lg:text-xl      /* ≥1024px */
            text-[#000000] mt-2
          "
        >
          {t("tap_time")}
        </p>
      </header>

      {/* Time Options */}
      <main className="grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-12 mb-20">
        {OPTIONS.map((n) => (
          <TimeOption
            key={n}
            minutes={n}
            active={sel === n}
            onClick={() => setSel(n)}
            label={t("min_per_day", { n })}
          />
        ))}
      </main>

      {/* Floating CTA */}
      <FloatingCTA disabled={!sel || busy} onClick={start}>
        {busy ? t("starting") : t("start")}
      </FloatingCTA>
    </div>
  );
}
