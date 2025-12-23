//src/components/RightDrawer.jsx
import { useEffect } from "react";
import { FiX } from "react-icons/fi";

export default function RightDrawer({ open, onClose, title, children, footer }) {
  // ESC closes drawer
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-[80] bg-black/40 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={`fixed inset-y-0 right-0 z-[90] w-full sm:w-[520px] bg-white shadow-2xl transform transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <div className="text-lg font-bold text-gray-900">{title}</div>
          <button
            className="w-10 h-10 rounded-2xl grid place-items-center bg-gray-100 hover:bg-gray-200"
            onClick={onClose}
            aria-label="Close"
          >
            <FiX className="text-xl" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-auto h-[calc(100dvh-140px)]">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="p-5 border-t border-gray-200 bg-white">
            {footer}
          </div>
        )}
      </aside>
    </>
  );
}
