import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import LessonCard from "../components/LessonCard";

import nextImg from "../assets/next.png";
import prevImg from "../assets/previous.png";

export default function StudentDashboardChapterView({ chapter, onLessonOpen }) {
  const [index, setIndex] = useState(0);
  const [layout, setLayout] = useState([3, 2]); // default desktop layout

  const lessons = chapter?.lessons || [];

  // Dynamically update layout based on screen width (tablet support)
  useEffect(() => {
    const updateLayout = () => {
      const width = window.innerWidth;
      if (width < 768) {
        // mobile: show all
        setLayout([lessons.length]);
      } else if (width >= 768 && width < 1024) {
        // tablet: 2 + 2 + 1
        if (lessons.length >= 5) setLayout([2, 2, 1]);
        else if (lessons.length === 4) setLayout([2, 2]);
        else if (lessons.length === 3) setLayout([2, 1]);
        else setLayout([lessons.length]);
      } else {
        // desktop: 3 + 2
        setLayout([3, 2]);
      }
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, [lessons.length]);

  const totalPages = layout.length;
  const start = layout.slice(0, index).reduce((a, b) => a + b, 0);
  const end = start + layout[index];
  const currentLessons = lessons.slice(start, end);

  const next = () => setIndex((p) => Math.min(p + 1, totalPages - 1));
  const prev = () => setIndex((p) => Math.max(p - 1, 0));

  // Reset page when chapter changes
  useEffect(() => setIndex(0), [chapter]);

  return (
    <motion.div
      key={chapter.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="relative w-full flex flex-col items-center justify-center min-h-screen pt-[50px] md:pt-0"
      style={{
        backgroundImage: `url(${chapter.bg_path || ""})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="absolute inset-0 pointer-events-none" />

      {/* Cards + Arrows */}
      <div className="relative w-full flex justify-center items-center px-4 sm:px-6 py-10 md:py-20 z-10">
        {/* --- Prev (desktop + tablet) --- */}
        {index > 0 && (
          <button
            onClick={prev}
            className="hidden md:flex absolute left-6 top-1/2 -translate-y-1/2 z-20 hover:scale-110 active:scale-95 transition-transform"
          >
            <img src={prevImg} alt="Previous" className="w-14 md:w-16 select-none" />
          </button>
        )}

        {/* --- Lessons --- */}
        {/* Mobile: show all vertically */}
        <div className="block md:hidden w-full max-w-md mx-auto">
          <div className="flex flex-col gap-5 items-center justify-center">
            {lessons.map((lesson) => (
              <div
                key={lesson.id}
                className="w-full sm:w-[280px] md:w-[300px] flex justify-center"
              >
                <LessonCard lesson={lesson} onOpen={onLessonOpen} />
              </div>
            ))}
          </div>
        </div>

        {/* Tablet + Desktop: paginated */}
        <motion.div
          key={index}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.6 }}
          className="
            hidden md:flex md:flex-nowrap md:justify-center md:items-center md:gap-6 md:max-w-7xl
          "
        >
          {currentLessons.map((lesson) => (
            <div
              key={lesson.id}
              className="w-[260px] md:w-[280px] lg:w-[300px] flex-shrink-0"
            >
              <LessonCard lesson={lesson} onOpen={onLessonOpen} />
            </div>
          ))}
        </motion.div>

        {/* --- Next (desktop + tablet) --- */}
        {index < totalPages - 1 && (
          <button
            onClick={next}
            className="hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 z-20 hover:scale-110 active:scale-95 transition-transform"
          >
            <img src={nextImg} alt="Next" className="w-14 md:w-16 select-none" />
          </button>
        )}
      </div>

      {/* Subtle fade bottom */}
      <div className="absolute bottom-0 left-0 w-full h-20 bg-gradient-to-t from-[#EAE4D0]/70 to-transparent pointer-events-none" />
    </motion.div>
  );
}
