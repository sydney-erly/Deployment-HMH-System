// src/components/CreateLessonDrawer.jsx
import { useEffect, useMemo, useState } from "react";
import RightDrawer from "./RightDrawer";
import FileDropzone from "./FileDropzone";

export default function CreateLessonDrawer({ open, onClose, chapterId, onCreated, token }) {
  const API_BASE = import.meta.env.VITE_API_BASE || "/api";


  const [form, setForm] = useState({
    title_en: "",
    title_tl: "",
    desc_en: "",
    desc_tl: "",
  });

  const [cover, setCover] = useState(null); // REQUIRED
  const [preview, setPreview] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pickCover(file) {
    setCover(file);
    const url = URL.createObjectURL(file);
    setPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return url;
    });
  }

  function clearCover() {
    setCover(null);
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
      //  BACKEND EXPECTS THESE KEYS:
      fd.append("lesson_title_en", form.title_en.trim());
      fd.append("lesson_title_tl", form.title_tl.trim());
      fd.append("lesson_description_en", form.desc_en || "");
      fd.append("lesson_description_tl", form.desc_tl || "");
      fd.append("lesson_cover", cover); // REQUIRED

      //  BACKEND ROUTE (chapterId IN URL):
      const res = await fetch(`${API_BASE}/teacher/manage-lessons/chapters/${chapterId}/lessons`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Create failed");

      onCreated?.(data.lesson);
      onClose?.();

      setForm({ title_en: "", title_tl: "", desc_en: "", desc_tl: "" });
      clearCover();
    } catch (e) {
      alert(e?.message || "Create failed");
    } finally {
      setCreating(false);
    }
  }

  const canCreate = useMemo(() => {
    return Boolean(token && chapterId && form.title_en.trim() && form.title_tl.trim() && cover);
  }, [token, chapterId, form.title_en, form.title_tl, cover]);

  return (
    <RightDrawer
      open={open}
      onClose={onClose}
      title="Add Lesson"
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
            {creating ? "Creating..." : "Create Lesson"}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500">
              Lesson Title (English) <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full mt-1 px-3 py-2 rounded-2xl border border-gray-200 soft-ring"
              value={form.title_en}
              onChange={(e) => setForm((p) => ({ ...p, title_en: e.target.value }))}
              placeholder="Lesson 1"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500">
              Lesson Title (Tagalog) <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full mt-1 px-3 py-2 rounded-2xl border border-gray-200 soft-ring"
              value={form.title_tl}
              onChange={(e) => setForm((p) => ({ ...p, title_tl: e.target.value }))}
              placeholder="Aralin 1"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500">Description (English)</label>
            <textarea
              className="w-full mt-1 px-3 py-2 rounded-2xl border border-gray-200 soft-ring resize-none"
              rows={4}
              value={form.desc_en}
              onChange={(e) => setForm((p) => ({ ...p, desc_en: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500">Description (Tagalog)</label>
            <textarea
              className="w-full mt-1 px-3 py-2 rounded-2xl border border-gray-200 soft-ring resize-none"
              rows={4}
              value={form.desc_tl}
              onChange={(e) => setForm((p) => ({ ...p, desc_tl: e.target.value }))}
            />
          </div>
        </div>

        <FileDropzone
          label="Lesson Cover"
          required
          accept="image/*"
          valueFile={cover}
          valuePreviewUrl={preview}
          onPick={pickCover}
          onClear={clearCover}
          disabled={creating}
        />
      </div>
    </RightDrawer>
  );
}
