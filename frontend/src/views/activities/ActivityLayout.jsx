// frontend/src/views/activities/ActivityLayout.jsx
import React from "react";
import bgActivity from "../../assets/bg_activity.png";

export default function ActivityLayout({ children }) {
  return (
    <div
      className="relative flex flex-col items-center justify-center min-h-screen w-full overflow-hidden"
      style={{
        backgroundImage: `url(${bgActivity})`,
        backgroundSize: "cover", // or 'contain' if you want full image visible
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center center",
        backgroundColor: "#FFFFFF", // fallback
      }}
    >
      {/* Gradient overlay for readability (optional) */}
      <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] pointer-events-none" />
      <div className="relative z-10 flex flex-col w-full items-center">
        {children}
      </div>
    </div>
  );
}
