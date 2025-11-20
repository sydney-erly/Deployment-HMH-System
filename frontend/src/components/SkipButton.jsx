// frontend/src/components/SkipButton.jsx
import React from "react";

export default function SkipButton({ onClick, disabled = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        fixed bottom-6 right-6 
        px-6 py-3 text-lg font-bold 
        rounded-2xl select-none
        transition-transform
        ${disabled 
          ? "bg-gray-300 text-gray-500 cursor-not-allowed shadow-none" 
          : "bg-[#FFC84A] text-white shadow-[0_4px_0_#E39A25] hover:brightness-110 active:translate-y-1 active:shadow-[0_2px_0_#E39A25]"
        }
      `}
      style={{ zIndex: 9999 }}
    >
      Skip
    </button>
  );
}
