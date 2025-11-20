export default function InitialAvatar({ initials, size = 48 }) {
  return (
    <div
      className="rounded-full bg-[#2E4bff] text-white font-bold grid place-items-center"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        letterSpacing: 1,
      }}
    >
      {initials || "?"}
    </div>
  );
}
