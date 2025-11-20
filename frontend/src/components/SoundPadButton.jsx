export default function SoundPadButton({ onClick, size = 112, title = "Play" }) {
  const s = `${size}px`;
  const icon = Math.round(size * 0.42);

  return (
    <button
      onClick={onClick}
      aria-label={title}
      className="relative inline-flex items-center justify-center rounded-3xl shadow-lg active:translate-y-[2px] transition"
      style={{
        width: s, height: s,
        background: "linear-gradient(180deg, #60A5FA 0%, #2563EB 100%)",
      }}
      title={title}
    >
      <span
        aria-hidden
        className="absolute inset-0 rounded-3xl"
        style={{
          boxShadow:
            "inset 0 6px 10px rgba(255,255,255,.35), inset 0 -10px 14px rgba(0,0,0,.25)",
        }}
      />
      <svg
        viewBox="0 0 24 24"
        width={icon}
        height={icon}
        className="relative z-10 fill-white drop-shadow"
      >
        <path d="M11 4.5 6.75 8H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.75L11 19.5a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1z"/>
        <path d="M15.5 8.5a4 4 0 0 1 0 7" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/>
        <path d="M17.5 6a7 7 0 0 1 0 12" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/>
      </svg>
    </button>
  );
}
