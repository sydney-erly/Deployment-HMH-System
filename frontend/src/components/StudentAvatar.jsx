import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { auth } from "../lib/auth";

/**
 * Simple circle avatar with name below.
 *
 * Props:
 * - name: string
 * - photoUrl?: string
 * - size?: "sm" | "md" | "lg"         // 48 / 64 / 96 px
 * - onClick?: () => void              // default: nav('/student/profile')
 * - editable?: boolean                // show hover overlay to change photo (use on Profile)
 * - onUpdated?: (newUrl?: string) => void  // fires after successful upload
 * - subtext?: string                  // optional gray line under the name (e.g., "42% • Progress")
 */
export default function StudentAvatarCircle({
  name = "Student",
  photoUrl,
  size = "md",
  onClick,
  editable = false,
  onUpdated,
  subtext,
}) {
  const nav = useNavigate();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const px = size === "lg" ? 96 : size === "sm" ? 48 : 64;
  const initials = (name?.trim()?.[0] || "S").toUpperCase();

  async function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("photo", f);
      const res = await apiFetch("/student/profile", {
        method: "PUT",
        token: auth.token(),
        body: form,
      });
      onUpdated?.(res?.student?.photo_url);
    } catch (err) {
      console.error("Photo upload failed:", err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const open = () => !editable && (onClick ? onClick() : nav("/student/profile"));

  return (
    <div className="inline-flex flex-col items-center">
      <button
        type="button"
        onClick={open}
        className="group relative rounded-full overflow-hidden border border-black/5 shadow-sm"
        style={{ width: px, height: px }}
        aria-label="Open student profile"
      >
        {photoUrl ? (
          <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-white font-semibold"
               style={{ background: "linear-gradient(135deg,#7db6ff 0%,#5676ff 100%)" }}>
            {initials}
          </div>
        )}

        {editable && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
            <div
              onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
              className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/40 text-white text-xs font-semibold"
              title="Change photo"
            >
              {uploading ? "Uploading…" : "Change"}
            </div>
          </>
        )}
      </button>

      <div className="mt-2 text-sm font-medium text-gray-900 text-center max-w-[10rem] truncate">
        {name || "Student"}
      </div>
      {subtext ? (
        <div className="text-[11px] text-gray-500 -mt-0.5 text-center">{subtext}</div>
      ) : null}
    </div>
  );
}
