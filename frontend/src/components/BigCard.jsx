export default function BigCard({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`card w-full sm:w-64 h-48 flex items-center justify-center text-center transition
                  ${active ? "ring-4 ring-crimson" : "hover:shadow-lg"}`}
    >
      <div className="text-4xl">{children}</div>
    </button>
  );
}
