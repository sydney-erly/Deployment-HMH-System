import React from "react";
import lockImg from "../assets/heartlock.png";
import unlockImg from "../assets/unlocked.png";
import medalImg from "../assets/medal.png";

export default function LessonCard({ lesson, onOpen }) {
  const unlocked = lesson?.status === "unlocked";
  const completed = lesson?.status === "completed";
  const locked = lesson?.status === "locked";

  const handleClick = () => {
    if (unlocked || completed) onOpen?.(lesson);
  };

  //  Language handling
  const lang = (localStorage.getItem("hmh_lang") || "en").toLowerCase();
  const title =
    lang === "tl"
      ? lesson.title_tl || lesson.title_en || lesson.title || "Walang Pamagat"
      : lesson.title_en || lesson.title_tl || lesson.title || "Untitled Lesson";
  const desc =
    lang === "tl"
      ? lesson.description_tl || lesson.description_en || ""
      : lesson.description_en || lesson.description_tl || "";

  return (
    <button
      onClick={handleClick}
      disabled={locked}
      className={[
        "group relative w-full sm:w-[300px] md:w-[320px] lg:w-[340px]",
        "rounded-3xl overflow-hidden transition-all duration-300",
        "shadow-md hover:shadow-xl backdrop-blur-sm text-left",
        locked ? "opacity-60 grayscale cursor-not-allowed" : "hover:-translate-y-1",
      ].join(" ")}
    >
      {/* COVER */}
      <div className="relative aspect-[16/10] bg-[#D7E6FF] overflow-hidden">
        {lesson?.cover_path ? (
          <img
            src={lesson.cover_path}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-black/40 text-sm">
            No image
          </div>
        )}

        {/*  Locked */}
        {locked && (
          <img
            src={lockImg}
            alt="Locked"
            className="absolute top-3 left-3 w-7 h-7 sm:w-8 sm:h-8 drop-shadow"
          />
        )}

        {/*  Unlocked */}
        {unlocked && !completed && (
          <img
            src={unlockImg}
            alt="Unlocked"
            className="absolute top-3 left-3 w-7 h-7 sm:w-8 sm:h-8 drop-shadow"
          />
        )}
      </div>

      {/* BODY */}
      <div className="p-4 bg-white flex flex-col justify-between rounded-b-3xl min-h-[125px]">
        <div>
          <h3
            className="font-bold text-[#1C4211] text-[16px] line-clamp-1 mb-1 text-left"
            title={title}
          >
            {title}
          </h3>
          <p className="text-xs text-black/70 line-clamp-2 text-left">{desc}</p>
        </div>

        {/* 🏅 Medal — aligned with description */}
        {completed && (
          <div className="flex justify-end mt-2">
            <img
              src={medalImg}
              alt="Completed"
              className="w-6 h-6 sm:w-7 sm:h-7 drop-shadow-md"
            />
          </div>
        )}
      </div>
    </button>
  );
}
