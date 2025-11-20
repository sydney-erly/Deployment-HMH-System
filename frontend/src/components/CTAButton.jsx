import React from "react";

export default function CTAButton({
  children,
  disabled,
  onClick,
  className = "",
  variant = "yellow", // 'yellow' | 'red'
  size = "medium", // 'small' | 'medium' | 'large'
}) {
  // Base layout
  const baseStyles =
    "inline-flex items-center justify-center rounded-xl font-semibold transition-transform";

  // 🔸 Size variations
  const sizeStyles = {
    small: "px-4 py-2 text-sm shadow-[0_3px_0_rgba(0,0,0,0.15)]",
    medium: "px-6 py-3 text-base shadow-[0_5px_0_rgba(0,0,0,0.15)]",
    large: "px-8 py-4 text-lg shadow-[0_6px_0_rgba(0,0,0,0.15)]",
  };

  // 🎨 Color variations
  const colorStyles =
    variant === "red"
      ? "bg-[#E65460] text-white shadow-[0_5px_0_#751F07] hover:brightness-105 active:translate-y-[1px] active:shadow-[0_4px_0_#751F07]"
      : "bg-[#FFC84A] text-black shadow-[0_5px_0_#D9A73A] hover:brightness-105 active:translate-y-[1px] active:shadow-[0_4px_0_#D9A73A]";

  // 📴 Disabled state
  const disabledStyles =
    "bg-gray-300 text-gray-500 cursor-not-allowed shadow-none";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        baseStyles,
        sizeStyles[size],
        disabled ? disabledStyles : colorStyles,
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}
