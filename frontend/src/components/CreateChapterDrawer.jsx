// src/components/CreateChapterDrawer.jsx
import { useEffect, useMemo, useState } from "react";
import RightDrawer from "./RightDrawer";
import FileDropzone from "./FileDropzone";

export default function CreateChapterDrawer({ open, onClose, onCreated, token }) {
  const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000/api";

  const [form, setForm] = useState({ title_en: "", title_tl: "" });
  const [image, setImage] = useState(null); // REQUIRED
  const [preview, setPreview] = useState("");
  const [creating, setCreating] = useState(false);

  // cleanup object URL
  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pickImage(file) {
    setImage(file);
    const url = URL.createObjectURL(file);
    setPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return url;
    });
  }

  function clearImage() {
    setImage(null);
    setPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return "";
    });
  }

  async function submit() {
    if (!canCreate) return;

    setCreating(true);
    try {
      const fd = new FormData();
      // ✅ BACKEND EXPECTS THESE KEYS:
      fd.append("title_en", form.title_en.trim());
      fd.append("title_tl", form.title_tl.trim());
      fd.append("chapter_bg", image); // REQUIRED

      // ✅ BACKEND ROUTE:
      const res = await fetch(`${API_BASE}/teacher/manage-lessons/chapters`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Create failed");

      onCreated?.(data.chapter);
      onClose?.();

      setForm({ title_en: "", title_tl: "" });
      clearImage();
    } catch (e) {
      alert(e?.message || "Create failed");
    } finally {
      setCreating(false);
    }
  }

  const canCreate = useMemo(() => {
    return Boolean(token && form.title_en.trim() && form.title_tl.trim() && image);
  }, [token, form.title_en, form.title_tl, image]);

  return (
    <RightDrawer
      open={open}
      onClose={onClose}
      title="Add Chapter"
      footer={
        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 rounded-2xl bg-gray-100 hover:bg-gray-200 disabled:opacity-60"
            onClick={onClose}
            disabled={creating}
            type="button"
          >
            Cancel
          </button>
          <button
            className="px-5 py-2 rounded-2xl bg-[#2E4bff] text-white disabled:opacity-60"
            disabled={!canCreate || creating}
            onClick={submit}
            type="button"
          >
            {creating ? "Creating..." : "Create Chapter"}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500">
              Chapter Title (English) <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full mt-1 px-3 py-2 rounded-2xl border border-gray-200 soft-ring"
              value={form.title_en}
              onChange={(e) => setForm((p) => ({ ...p, title_en: e.target.value }))}
              placeholder="e.g., Sound Explorers"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500">
              Chapter Title (Tagalog) <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full mt-1 px-3 py-2 rounded-2xl border border-gray-200 soft-ring"
              value={form.title_tl}
              onChange={(e) => setForm((p) => ({ ...p, title_tl: e.target.value }))}
              placeholder="hal., Mga Tunog"
            />
          </div>
        </div>

        <FileDropzone
          label="Chapter Picture"
          required
          accept="image/*"
          valueFile={image}
          valuePreviewUrl={preview}
          onPick={pickImage}
          onClear={clearImage}
          disabled={creating}
        />
      </div>
    </RightDrawer>
  );
}
