import { useRef, useState } from "react";
import { FiUploadCloud } from "react-icons/fi";

export default function FileDropzone({
  label = "Upload a File",
  hint = "Click to browse, or drag & drop a file here",
  accept = "image/*",
  required = false,
  valueFile = null, // File | null
  valuePreviewUrl = "", // string (object URL or remote)
  onPick, // (file: File) => void
  onClear, // optional
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  function openPicker() {
    if (disabled) return;
    inputRef.current?.click();
  }

  function onInputChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    onPick?.(file);
    // reset so selecting same file again still triggers change
    e.target.value = "";
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (disabled) return;

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    onPick?.(file);
  }

  function prevent(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const hasFile = Boolean(valueFile || valuePreviewUrl);

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-gray-800">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </div>

      <div
        className={[
          "w-full rounded-2xl border border-dashed p-6 transition cursor-pointer select-none",
          "bg-white",
          dragOver ? "border-[#2E4bff] bg-[#2E4bff]/5" : "border-gray-200 hover:bg-gray-50",
          disabled ? "opacity-60 cursor-not-allowed hover:bg-white" : "",
        ].join(" ")}
        role="button"
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openPicker()}
        onDragEnter={(e) => {
          prevent(e);
          if (!disabled) setDragOver(true);
        }}
        onDragOver={(e) => {
          prevent(e);
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={(e) => {
          prevent(e);
          setDragOver(false);
        }}
        onDrop={handleDrop}
      >
        {/* Centered upload prompt (matches your screenshot) */}
        {!hasFile ? (
          <div className="flex flex-col items-center text-center gap-2">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 grid place-items-center">
              <FiUploadCloud className="text-xl text-gray-600" />
            </div>
            <div className="text-sm font-semibold text-gray-800">Upload a File</div>
            <div className="text-xs text-gray-500">{hint}</div>

            <button
              type="button"
              className="mt-2 px-4 py-2 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 text-sm"
              onClick={(e) => {
                e.stopPropagation();
                openPicker();
              }}
              disabled={disabled}
            >
              Browse File
            </button>
          </div>
        ) : (
          // Preview mode
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-800">
                  {valueFile?.name || "Selected file"}
                </div>
                <div className="text-xs text-gray-500">Click to change, or drag & drop a new file</div>
              </div>

              {onClear ? (
                <button
                  type="button"
                  className="shrink-0 px-3 py-2 rounded-2xl bg-gray-100 hover:bg-gray-200 text-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClear();
                  }}
                  disabled={disabled}
                >
                  Remove
                </button>
              ) : null}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white h-44 overflow-hidden grid place-items-center">
              {valuePreviewUrl ? (
                <img src={valuePreviewUrl} alt="preview" className="w-full h-full object-cover" />
              ) : (
                <div className="text-sm text-gray-400">Preview</div>
              )}
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={onInputChange}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
