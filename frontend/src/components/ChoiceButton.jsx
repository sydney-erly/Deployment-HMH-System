export default function ChoiceButton({
  index,
  label,
  onClick,
  selected = false,
  state = "idle",        // "idle" | "answered"
  isWinner = false       // true iff this selected choice is correct after check
}) {
  const isAnswered = state === "answered";

  // Base + 3D look
  const base =
    "relative w-full rounded-2xl border p-6 text-center bg-gradient-to-br from-white to-neutral-50 " +
    "shadow-md hover:shadow-xl transition will-change-transform " +
    "active:translate-y-[1px]";
  const indexBadge =
    "absolute left-3 top-3 rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500 bg-white";

  // Selection / feedback styling
  let visual = "border-neutral-200";
  if (!isAnswered && selected) visual = "ring-2 ring-sky-400 border-sky-400";
  if (isAnswered && selected && isWinner)
    visual = "ring-2 ring-lime-500 border-lime-500 bg-lime-50 hmh-pop";
  if (isAnswered && selected && !isWinner)
    visual = "ring-2 ring-rose-500 border-rose-500 bg-rose-50";

  return (
    <button
      onClick={onClick}
      disabled={isAnswered}
      className={[base, visual].join(" ")}
      style={{
        boxShadow:
          "0 8px 0 rgba(0,0,0,0.10), 0 2px 18px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
        transform: !isAnswered && selected ? "translateY(-2px)" : undefined,
      }}
      title="tap_to_hear"
    >
      <span className={indexBadge}>{index}</span>
      <div className="select-none text-4xl sm:text-5xl font-extrabold tracking-wide drop-shadow-sm">
        {label}
      </div>
    
    </button>
  );
}
