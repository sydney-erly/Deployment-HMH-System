import React from "react";
import { assetUrl } from "../lib/assets";

export default function ChoiceCard({
  selected,
  correct,       // when checked, mark correct
  wrong,         // when checked and is the wrong selection
  onClick,
  image,
  label,
  children,
}) {
  const ring = correct
    ? "ring-4 ring-[#66D17A]"
    : wrong
    ? "ring-4 ring-[#F87171]"
    : selected
    ? "ring-4 ring-[#A8E063]"
    : "ring-1 ring-white/20";

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full text-left rounded-2xl bg-white/5 hover:bg-white/10",
        "transition-all p-5",
        ring,
      ].join(" ")}
    >
      {image && (
        <div className="w-full flex items-center justify-center mb-3">
          <img
            src={assetUrl(image)}
            alt={label || ""}
            className="max-h-28 object-contain"
            onError={(e)=>{ e.currentTarget.style.opacity = 0.2; }}
          />
        </div>
      )}
      <div className="font-semibold text-lg">{label}</div>
      {children}
    </button>
  );
}
