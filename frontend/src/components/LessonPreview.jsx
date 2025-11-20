import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "../lib/api";
import { auth } from "../lib/auth";
import CTAButton from "../components/CTAButton";

export default function LessonPreview({ lesson, onClose, onPlay }) {
  const overlayRef = useRef(null);

  // Close on ESC + lock scroll
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const onOverlayClick = (e) => e.target === overlayRef.current && onClose?.();

  const lang = (localStorage.getItem("hmh_lang") || "en").toLowerCase();

  const title =
    (lang === "tl"
      ? lesson.title_tl || lesson.title_en || lesson.title
      : lesson.title_en || lesson.title_tl || lesson.title) || "Lesson";

  const desc =
    lang === "tl"
      ? lesson.description_tl || lesson.description_en || ""
      : lesson.description_en || lesson.description_tl || "";

  const img =
    lesson?.cover_url || lesson?.preview_url || lesson?.cover_path || "";

  async function handlePlay() {
    try {
      const raw = localStorage.getItem("hmh_session");
      const sess = raw ? JSON.parse(raw) : null;
      if (!sess) {
        alert(
          lang === "tl"
            ? "Pumili muna ng oras bago magsimula!"
            : "Please select a session duration first!"
        );
        return;
      }

      // Only activate if still pending
      if (sess.status === "pending") {
        const res = await apiFetch("/student/activate-session", {
          method: "POST",
          token: auth.token(),
          body: { session_id: sess.session_id },
        });

        const updated = res.session;
        const now = Date.now();
        const endAt = now + (updated.minutes_allowed || sess.minutes) * 60 * 1000;

        localStorage.setItem(
          "hmh_session",
          JSON.stringify({
            session_id: updated.id,
            minutes: updated.minutes_allowed,
            status: updated.status, // "active"
            startAt: now, // ms (frontend)
            endAt, // ms (frontend)
            started_at: updated.started_at, // ISO (backend)
          })
        );
      }

      onPlay?.(lesson);
    } catch (err) {
      console.error("Failed to start lesson:", err);
      alert(
        lang === "tl"
          ? "Hindi masimulan ang aralin. Pakisubukang muli."
          : "Could not start the lesson. Please try again."
      );
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        ref={overlayRef}
        onMouseDown={onOverlayClick}
        className="fixed inset-0 z-[60] bg-black/50 flex justify-center items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          className="relative w-[min(96vw,1100px)] max-h-[95vh] 
                     bg-white rounded-[28px] shadow-2xl overflow-hidden border border-black/10 
                     grid grid-cols-1 md:grid-cols-2"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-1 left-4 z-10 bg-white/80 hover:bg-white text-black
                       rounded-full w-10 h-10 flex items-center justify-center shadow-lg"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* LEFT: Info (below image on mobile) */}
          <div className="order-2 md:order-1 p-10 sm:p-12 flex flex-col justify-center text-left bg-[#FFFDF8]">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#000000] leading-tight mb-4">
              {title}
            </h2>
            {desc && (
              <p className="text-base sm:text-lg text-black/70 leading-relaxed mb-8">
                {desc}
              </p>
            )}

            {/* Play Button */}
            <div className="mt-8">
              {/* Mobile fixed Start button */}
              <div className="block md:hidden absolute bottom-6 right-6">
                <CTAButton
                  onClick={handlePlay}
                  className="text-base sm:text-lg gap-2 px-8 py-3 font-bold"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-5 h-5"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  {lang === "tl" ? "Simulan" : "Start"}
                </CTAButton>
              </div>

              {/* Desktop inline Start button */}
              <div className="hidden md:block">
                <CTAButton
                  onClick={handlePlay}
                  className="text-base sm:text-lg gap-2 px-8 py-3 font-bold"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-5 h-5"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  {lang === "tl" ? "Simulan" : "Start"}
                </CTAButton>
              </div>
            </div>
          </div>

          {/* RIGHT: Image (above text on mobile) */}
          <div className="order-1 md:order-2 relative bg-[#f3f3f3] h-[280px] md:h-auto">
            {img ? (
              <img
                src={img}
                alt={title}
                className="w-full h-full object-cover"
                draggable="false"
              />
            ) : (
              <div className="w-full h-full grid place-items-center text-black/40 text-base sm:text-lg">
                {lang === "tl" ? "Walang larawan" : "No image available"}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
