export function speak(text, lang = (localStorage.getItem("hmh_language") || "en")) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "tl" ? "fil-PH" : "en-US";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
