// src/pages/LessonManagement.jsx
// Teacher-friendly Lesson Management
// Chapters -> Lessons -> Activities -> Add Question (dropdown) -> Edit modal (upload dropzones)
// updated 23/12/2025 (+ hover pencil edit for chapter/lesson)
// updated 27/12/2025 (+ drag-drop reorder + long-press drag on mobile)
// updated 27/12/2025 (+ soft-delete activity + resequence-safe UI numbering)

import hmhIcon from "../assets/hmh_icon.png";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { auth } from "../lib/auth";
import { Link, useLocation, Navigate, useNavigate } from "react-router-dom";
import { GoHome } from "react-icons/go";
import { PiStudentBold } from "react-icons/pi";
import { SiGoogleanalytics } from "react-icons/si";
import { MdMenuBook } from "react-icons/md";
import {
  FiLogOut,
  FiArrowLeft,
  FiUploadCloud,
  FiImage,
  FiMusic,
  FiEdit2,
  FiX,
  FiMove,
} from "react-icons/fi";

import CreateChapterDrawer from "../components/CreateChapterDrawer";
import CreateLessonDrawer from "../components/CreateLessonDrawer";
import RightDrawer from "../components/RightDrawer";

//  Drag & Drop (DnD Kit)
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/* -------------------------
   DnD: Drag handle + wrappers
-------------------------- */
function DragHandle({ listeners, attributes, className = "" }) {
  return (
    <button
      type="button"
      className={
        "opacity-0 group-hover:opacity-100 transition rounded-2xl bg-white/95 border border-gray-200 shadow-sm p-2 hover:bg-gray-50 cursor-grab active:cursor-grabbing " +
        className
      }
      title="Long-press (mobile) or drag (desktop) to reorder"
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseDown={(e) => {
        // prevent “click” drag handle from triggering card click
        e.preventDefault();
        e.stopPropagation();
      }}
      onTouchStart={(e) => {
        // prevent immediate tap from triggering parent click
        e.stopPropagation();
      }}
    >
      <FiMove />
    </button>
  );
}

// Grid card (chapters/lessons)
function SortableCard({ id, children }) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <DragHandle
        attributes={attributes}
        listeners={listeners}
        className="absolute top-3 left-3 z-10"
      />
      {children}
    </div>
  );
}

// Vertical row (activities)
function SortableRow({ id, children }) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <DragHandle
        attributes={attributes}
        listeners={listeners}
        className="absolute top-4 left-3 z-10 bg-white"
      />
      <div className="pl-14">{children}</div>
    </div>
  );
}

export default function LessonManagement() {
  const nav = useNavigate();
  const location = useLocation();

  // 🔒 Auth guard
  const isTeacher = auth.isTeacher();
  if (!isTeacher) return <Navigate to="/login" replace />;

  const API_BASE = import.meta.env.VITE_API_BASE || "/api";

  // Token reactive
  const [token, setToken] = useState(() => auth.token());
  useEffect(() => {
    const unsub = auth.onChange?.(() => setToken(auth.token()));
    if (!unsub && !token) {
      const id = setInterval(() => {
        const t = auth.token();
        if (t) {
          setToken(t);
          clearInterval(id);
        }
      }, 100);
      return () => clearInterval(id);
    }
    return () => unsub?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------
  // ✅ DnD sensors (desktop + mobile long-press)
  // -------------------------
  // - PointerSensor: drag after moving 8px (prevents accidental click-drag)
  // - TouchSensor: drag after long-press delay (prevents scroll hijack)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 280, tolerance: 6 },
    })
  );

  async function saveReorder(path, ids) {
    // expects backend endpoints to accept: { ids: [..] }
    await apiFetch(path, {
      token,
      method: "PATCH",
      body: { ids },
    });
  }

  // -------------------------
  // Mobile nav drawer (left)
  // -------------------------
  const [navOpen, setNavOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);

  const EDGE_WIDTH = 24,
    OPEN_THRESHOLD = 80,
    CLOSE_THRESHOLD = -80;

  function onEdgeTouchStart(e) {
    if (navOpen) return;
    const t = e.touches?.[0];
    if (!t || t.clientX > EDGE_WIDTH) return;
    draggingRef.current = true;
    startXRef.current = t.clientX;
    setDragX(0);
  }
  function onEdgeTouchMove(e) {
    if (!draggingRef.current || navOpen) return;
    const t = e.touches?.[0];
    if (!t) return;
    setDragX(Math.max(0, t.clientX - startXRef.current));
  }
  function onEdgeTouchEnd() {
    if (!draggingRef.current || navOpen) return;
    draggingRef.current = false;
    if (dragX > OPEN_THRESHOLD) setNavOpen(true);
    setDragX(0);
  }
  function onDrawerTouchStart(e) {
    const t = e.touches?.[0];
    if (!t) return;
    draggingRef.current = true;
    startXRef.current = t.clientX;
    setDragX(0);
  }
  function onDrawerTouchMove(e) {
    if (!draggingRef.current) return;
    const t = e.touches?.[0];
    if (!t) return;
    setDragX(Math.min(0, t.clientX - startXRef.current));
  }
  function onDrawerTouchEnd() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (dragX < CLOSE_THRESHOLD) setNavOpen(false);
    setDragX(0);
  }

  const drawerStyle = {};
  let drawerClasses =
    "fixed inset-y-0 left-0 w-64 bg-[#2E4bff] text-white p-6 flex flex-col z-50 shadow-lg will-change-transform transition-transform duration-200 ease-out";
  if (navOpen) {
    drawerStyle.transform = `translateX(${Math.min(0, dragX)}px)`;
  } else if (!navOpen && dragX > 0) {
    drawerStyle.transform = `translateX(calc(-100% + ${dragX}px))`;
  } else {
    drawerClasses += " -translate-x-full";
  }

  // -------------------------
  // Step state
  // -------------------------
  const [step, setStep] = useState("chapters"); // chapters | lessons | activities
  const [lang, setLang] = useState("en"); // en | tl

  const [chapters, setChapters] = useState([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);

  const [selectedChapter, setSelectedChapter] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);

  const [selectedLesson, setSelectedLesson] = useState(null);
  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  // -------------------------
  // Create drawers
  // -------------------------
  const [showCreateChapter, setShowCreateChapter] = useState(false);
  const [showCreateLesson, setShowCreateLesson] = useState(false);

  // -------------------------
  // Chapter/Lesson Edit Modal
  // -------------------------
  const [metaEditOpen, setMetaEditOpen] = useState(false);
  const [metaEditKind, setMetaEditKind] = useState(null); // "chapter" | "lesson"
  const [metaEditItem, setMetaEditItem] = useState(null);
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaErr, setMetaErr] = useState("");

  const [metaForm, setMetaForm] = useState({
    title_en: "",
    title_tl: "",
    description_en: "",
    description_tl: "",
    file: null,
    filePreview: "",
  });

  function openMetaEditor(kind, item) {
    setMetaErr("");
    setMetaEditKind(kind);
    setMetaEditItem(item);

    if (kind === "chapter") {
      setMetaForm({
        title_en: item?.title_en || "",
        title_tl: item?.title_tl || "",
        description_en: "",
        description_tl: "",
        file: null,
        filePreview: item?.bg_path_resolved || "",
      });
    } else {
      setMetaForm({
        title_en: item?.title_en || "",
        title_tl: item?.title_tl || "",
        description_en: item?.description_en || "",
        description_tl: item?.description_tl || "",
        file: null,
        filePreview: item?.cover_path_resolved || "",
      });
    }

    setMetaEditOpen(true);
  }

  function closeMetaEditor() {
    setMetaEditOpen(false);
    setMetaEditKind(null);
    setMetaEditItem(null);
    setMetaErr("");
    setMetaSaving(false);
  }

  function pickMetaFile(file) {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setMetaForm((p) => ({ ...p, file, filePreview: preview }));
  }

  function openFilePicker(accept, onPick) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) onPick(file);
    };
    input.click();
  }

  async function saveMeta() {
    if (!token || !metaEditKind || !metaEditItem?.id) return;

    setMetaSaving(true);
    setMetaErr("");

    try {
      const fd = new FormData();

      if (metaEditKind === "chapter") {
        fd.append("title_en", metaForm.title_en || "");
        fd.append("title_tl", metaForm.title_tl || "");
        if (metaForm.file) fd.append("chapter_bg", metaForm.file);

        const res = await fetch(
          `${API_BASE}/teacher/manage-lessons/chapters/${metaEditItem.id}`,
          {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          }
        );

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Failed to update chapter");

        const updated = data?.chapter;
        setChapters((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        if (selectedChapter?.id === updated.id) setSelectedChapter(updated);
      } else {
        fd.append("lesson_title_en", metaForm.title_en || "");
        fd.append("lesson_title_tl", metaForm.title_tl || "");
        fd.append("lesson_description_en", metaForm.description_en ?? "");
        fd.append("lesson_description_tl", metaForm.description_tl ?? "");
        if (metaForm.file) fd.append("lesson_cover", metaForm.file);

        const res = await fetch(
          `${API_BASE}/teacher/manage-lessons/lessons/${metaEditItem.id}`,
          {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          }
        );

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Failed to update lesson");

        const updated = data?.lesson;
        setLessons((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
        if (selectedLesson?.id === updated.id) setSelectedLesson(updated);
      }

      closeMetaEditor();
    } catch (e) {
      console.error(e);
      setMetaErr(e?.message || "Save failed");
    } finally {
      setMetaSaving(false);
    }
  }

  // -------------------------
  // Editor modal (Activities)
  // -------------------------
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState({});

  const [form, setForm] = useState({
    type: "",
    layout: "",
    prompt: "",
    prompt_image: "",
    prompt_image_path: "",
    prompt_audio: "",
    prompt_audio_path: "",
    choices: [],
    correct: "",
    expected_emotion: "",
    expected_speech: "",
    temp: {
      prompt_image: null,
      prompt_audio: null,
      choices: [],
    },
  });

  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState("sound");

  // Body bg
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#F6F7FB";
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, []);

  // -------------------------
  // Fetch chapters
  // -------------------------
  useEffect(() => {
    if (!token) return;
    (async () => {
      setChaptersLoading(true);
      try {
        const res = await apiFetch("/teacher/manage-lessons/chapters", { token });
        setChapters(res?.chapters ?? []);
      } catch (e) {
        console.error("Chapters fetch failed:", e);
        setChapters([]);
      } finally {
        setChaptersLoading(false);
      }
    })();
  }, [token]);

  // Fetch lessons when chapter selected
  useEffect(() => {
    if (!token || !selectedChapter?.id) return;
    (async () => {
      setLessonsLoading(true);
      setLessons([]);
      setSelectedLesson(null);
      setActivities([]);
      try {
        const res = await apiFetch(
          `/teacher/manage-lessons/chapters/${selectedChapter.id}/lessons`,
          { token }
        );
        setLessons(res?.lessons ?? []);
      } catch (e) {
        console.error("Lessons fetch failed:", e);
        setLessons([]);
      } finally {
        setLessonsLoading(false);
      }
    })();
  }, [token, selectedChapter?.id]);

  // Fetch activities when lesson or lang changes
  useEffect(() => {
    if (!token || !selectedLesson?.id) return;
    (async () => {
      setActivitiesLoading(true);
      setEditing(null);
      setDirty(false);
      setErrors({});
      setStatusMsg("");
      try {
        const res = await apiFetch(
          `/teacher/manage-lessons/lessons/${selectedLesson.id}/activities?lang=${lang}`,
          {
            token,
          }
        );
        setActivities(res?.activities ?? []);
      } catch (e) {
        console.error("Activities fetch failed:", e);
        setActivities([]);
      } finally {
        setActivitiesLoading(false);
      }
    })();
  }, [token, selectedLesson?.id, lang]);

  // ✅ refresh helper (used after soft-delete)
  async function refreshActivities() {
    if (!token || !selectedLesson?.id) return;
    setActivitiesLoading(true);
    try {
      const res = await apiFetch(
        `/teacher/manage-lessons/lessons/${selectedLesson.id}/activities?lang=${lang}`,
        { token }
      );
      setActivities(res?.activities ?? []);
    } catch (e) {
      console.error("Activities refresh failed:", e);
      setActivities([]);
    } finally {
      setActivitiesLoading(false);
    }
  }

  // -------------------------
  // Helpers
  // -------------------------
  function chapterLabel(ch) {
    if (!ch) return "Chapter";
    const m = String(ch.code || "").match(/CH(\d+)/i);
    const n = m?.[1] ? parseInt(m[1], 10) : null;
    const num = Number.isFinite(n) ? n : ch.sort_order;
    return Number.isFinite(num) ? `Chapter ${num}` : "Chapter";
  }

  function activityDisplayName(a) {
    if (!a) return "Activity";
    const t = String(a.type || "").toLowerCase();
    const layout = String(a.layout || "").toLowerCase();

    if (t === "asr" || layout === "asr") return "Speech Practice";
    if (t === "emotion" || layout === "emotion") return "Emotion Imitation";

    if (layout === "choose") return "Object Recognition";
    if (layout === "sound") return "Sound Recognition";
    if (layout === "image") return "Emotion Identification";
    if (layout === "sequence") return "Sequence Awareness";

    return "Multiple Choice";
  }

  function setFormDirty(updater) {
    setForm((prev) => (typeof updater === "function" ? updater(prev) : updater));
    setDirty(true);
  }

  function resolveMediaUrl(x) {
    if (!x) return "";
    if (typeof x !== "string") return "";
    if (/^https?:\/\//i.test(x)) return x;

    const origin = String(API_BASE).replace(/\/api\/?$/i, "");
    if (x.startsWith("/")) return `${origin}${x}`;
    return `${origin}/${x}`;
  }

  function pickChoiceImage(c) {
    return resolveMediaUrl(
      c?.image_path || c?.image || c?.image_resolved || c?.image_url || ""
    );
  }
  function pickChoiceAudio(c) {
    return resolveMediaUrl(
      c?.audio_path || c?.audio || c?.audio_resolved || c?.audio_url || ""
    );
  }
  function pickPromptImage(p) {
    return resolveMediaUrl(
      p?.prompt_image_path || p?.prompt_image || p?.prompt_image_url || ""
    );
  }
  function pickPromptAudio(p) {
    return resolveMediaUrl(
      p?.prompt_audio_path || p?.prompt_audio || p?.prompt_audio_url || ""
    );
  }

  function openEditor(a) {
    setEditing(a);
    setDirty(false);
    setErrors({});
    setStatusMsg("");

    const p = a?.payload || {};
    const choicesArr = Array.isArray(p?.choices) ? p.choices : [];

    setForm({
      type: a?.type || "",
      layout: a?.layout || "",
      prompt: a?.prompt || "",
      prompt_image: resolveMediaUrl(p?.prompt_image || ""),
      prompt_image_path: p?.prompt_image || "",
      prompt_audio: resolveMediaUrl(p?.prompt_audio || ""),
      prompt_audio_path: p?.prompt_audio || "",
      choices: choicesArr.map((c, idx) => ({
        key: (c?.key ?? c?.label ?? `choice_${idx + 1}`) || "",
        image: resolveMediaUrl(c?.image || ""),
        image_path: c?.image || "",
        audio: resolveMediaUrl(c?.audio || ""),
        audio_path: c?.audio || "",
      })),
      correct: p?.correct ?? "",
      expected_emotion: (p?.expected_emotion ?? a?.expected_emotion ?? "").toString(),
      expected_speech: (p?.expected_speech ?? a?.expected_speech ?? "").toString(),
      temp: {
        prompt_image: null,
        prompt_audio: null,
        choices: choicesArr.map(() => ({ image: null, audio: null })),
      },
    });
  }

  function goBackOneStep() {
    if (editing && dirty) {
      const ok = confirm("Discard unsaved changes?");
      if (!ok) return;
      setEditing(null);
      setDirty(false);
      setErrors({});
      setStatusMsg("");
    }

    if (step === "activities") {
      setStep("lessons");
      setSelectedLesson(null);
      setActivities([]);
      return;
    }
    if (step === "lessons") {
      setStep("chapters");
      setSelectedChapter(null);
      setLessons([]);
      return;
    }
  }

  function closeEditor() {
    if (dirty) {
      const ok = confirm("Discard unsaved changes?");
      if (!ok) return;
    }
    setEditing(null);
    setDirty(false);
    setErrors({});
    setStatusMsg("");
  }

  // -------------------------
  // Add Question: kind -> type+layout + defaults
  // -------------------------
  function kindToTypeLayout(kind) {
    if (kind === "choose") return { type: "mcq", layout: "choose" };
    if (kind === "sound") return { type: "mcq", layout: "sound" };
    if (kind === "image") return { type: "mcq", layout: "image" };
    if (kind === "sequence") return { type: "mcq", layout: "sequence" };
    if (kind === "asr") return { type: "asr", layout: "asr" };
    if (kind === "emotion") return { type: "emotion", layout: "emotion" };
    return { type: "mcq", layout: "choose" };
  }

  function defaultPromptForKind(kind) {
    if (kind === "sound") return "Which sound do you hear?";
    if (kind === "choose") return "Which one is correct?";
    if (kind === "image") return "What emotion do you see?";
    if (kind === "sequence") return "Look! Which one comes first?";
    if (kind === "asr") return "Say “I am happy.”";
    if (kind === "emotion") return "Show your face for this emotion!";
    return "New question";
  }

  function defaultChoicesForKind(kind) {
    if (kind === "choose") {
      return [
        { key: lang === "tl" ? "Pagpipilian 1" : "Choice 1" },
        { key: lang === "tl" ? "Pagpipilian 2" : "Choice 2" },
      ];
    }
    if (kind === "sound") {
      return [
        { key: lang === "tl" ? "Tunog 1" : "Sound 1" },
        { key: lang === "tl" ? "Tunog 2" : "Sound 2" },
        { key: lang === "tl" ? "Tunog 3" : "Sound 3" },
        { key: lang === "tl" ? "Tunog 4" : "Sound 4" },
      ];
    }
    if (kind === "image") {
      return [
        { key: lang === "tl" ? "Masaya" : "Happy" },
        { key: lang === "tl" ? "Malungkot" : "Sad" },
        { key: lang === "tl" ? "Galit" : "Angry" },
        { key: lang === "tl" ? "Gulat" : "Surprised" },
      ];
    }
    if (kind === "sequence") {
      return [
        { key: lang === "tl" ? "Hakbang 1" : "Step 1" },
        { key: lang === "tl" ? "Hakbang 2" : "Step 2" },
      ];
    }
    return [];
  }

  function startDraftFromKind(kind) {
    const { type, layout } = kindToTypeLayout(kind);
    const baseChoices = defaultChoicesForKind(kind);

    setDirty(false);
    setErrors({});
    setStatusMsg("");

    setEditing({ id: null, sort_order: "—", type, layout });

    setForm({
      type,
      layout,
      prompt: "",
      prompt_image: "",
      prompt_image_path: "",
      prompt_audio: "",
      prompt_audio_path: "",
      choices: baseChoices.map((c) => ({
        key: c.key || "",
        image: "",
        image_path: "",
        audio: "",
        audio_path: "",
      })),
      correct: baseChoices?.[0]?.key || "",
      expected_emotion: kind === "emotion" ? (lang === "tl" ? "masaya" : "happy") : "",
      expected_speech: kind === "asr" ? (lang === "tl" ? "Sabihin ito" : "Say this") : "",
      temp: {
        prompt_image: null,
        prompt_audio: null,
        choices: baseChoices.map(() => ({ image: null, audio: null })),
      },
    });

    setAddOpen(false);
  }

  // -------------------------
  // Validation (required fields) - blocks Save
  // -------------------------
  function validateForm(nextForm = form) {
    const e = {};
    const t = (nextForm.type || "").toLowerCase();
    const lay = (nextForm.layout || "").toLowerCase();

    const mcqLayouts = ["choose", "sound", "image", "sequence"];
    const isMCQ = t === "mcq" && mcqLayouts.includes(lay);
    const isAsrLocal = t === "asr" && lay === "asr";
    const isEmotionLocal = t === "emotion" && lay === "emotion";

    if (!nextForm.prompt?.trim()) e.prompt = "Prompt is required.";

    if (isEmotionLocal && !nextForm.expected_emotion?.trim()) {
      e.expected_emotion = "Emotion is required.";
    }

    if (isAsrLocal && !nextForm.expected_speech?.trim()) {
      e.expected_speech = "Expected speech is required.";
    }

    if (isMCQ) {
      const choices = nextForm.choices || [];
      if (choices.length < 2) e.choices = "At least 2 choices are required.";

      choices.forEach((c, idx) => {
        if (!c.key?.trim()) e[`choice_${idx}_key`] = `Choice ${idx + 1} key is required.`;
      });

      const keys = new Set(choices.map((c) => (c.key || "").trim()).filter(Boolean));
      if (!nextForm.correct || !keys.has(nextForm.correct)) {
        e.correct = "Select a correct answer (must match a choice key).";
      }
    }

    return e;
  }

  const computedErrors = useMemo(() => validateForm(form), [form]);
  const isFormValid = useMemo(
    () => Object.keys(computedErrors).length === 0,
    [computedErrors]
  );

  // -------------------------
  // Upload (TEMP-first)
  // -------------------------
  async function tempUpload(kind, file) {
    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch(
      `${API_BASE}/teacher/manage-lessons/uploads/temp?kind=${kind}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      }
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Upload failed");
    return data; // { url, path, temp_key }
  }

  async function uploadPromptMedia(kind) {
    if (!token) return;
    const accept = kind === "image" ? "image/*" : "audio/*";

    openFilePicker(accept, async (file) => {
      try {
        setUploading(true);
        setStatusMsg(kind === "image" ? "Uploading picture..." : "Uploading audio...");

        const data = await tempUpload(kind, file);

        setFormDirty((p) => ({
          ...p,
          ...(kind === "image"
            ? {
                prompt_image: resolveMediaUrl(data.url),
                prompt_image_path: data.path || "",
                temp: { ...p.temp, prompt_image: data.path || data.url },
              }
            : {
                prompt_audio: resolveMediaUrl(data.url),
                prompt_audio_path: data.path || "",
                temp: { ...p.temp, prompt_audio: data.path || data.url },
              }),
        }));

        setStatusMsg("");
      } catch (e) {
        console.error(e);
        setStatusMsg(e.message || "Upload failed");
        alert(e.message || "Upload failed");
      } finally {
        setUploading(false);
      }
    });
  }

  async function uploadChoiceMedia(idx, kind) {
    if (!token) return;
    const accept = kind === "image" ? "image/*" : "audio/*";

    openFilePicker(accept, async (file) => {
      try {
        setUploading(true);
        setStatusMsg(
          kind === "image" ? "Uploading choice picture..." : "Uploading choice audio..."
        );

        const data = await tempUpload(kind, file);

        setFormDirty((p) => {
          const nextChoices = [...(p.choices || [])];
          if (!nextChoices[idx]) return p;

          nextChoices[idx] = {
            ...nextChoices[idx],
            ...(kind === "image"
              ? { image: resolveMediaUrl(data.url), image_path: data.path || "" }
              : { audio: resolveMediaUrl(data.url), audio_path: data.path || "" }),
          };

          const nextTempChoices = [...(p.temp?.choices || [])];
          if (!nextTempChoices[idx]) nextTempChoices[idx] = { image: null, audio: null };
          nextTempChoices[idx] = {
            ...nextTempChoices[idx],
            ...(kind === "image"
              ? { image: data.path || data.url }
              : { audio: data.path || data.url }),
          };

          return {
            ...p,
            choices: nextChoices,
            temp: { ...p.temp, choices: nextTempChoices },
          };
        });

        setStatusMsg("");
      } catch (e) {
        console.error(e);
        setStatusMsg(e.message || "Upload failed");
        alert(e.message || "Upload failed");
      } finally {
        setUploading(false);
      }
    });
  }

  function removePromptMedia(kind) {
    if (kind === "image") {
      setFormDirty((p) => ({
        ...p,
        prompt_image: "",
        prompt_image_path: "",
        temp: { ...p.temp, prompt_image: null },
      }));
    } else {
      setFormDirty((p) => ({
        ...p,
        prompt_audio: "",
        prompt_audio_path: "",
        temp: { ...p.temp, prompt_audio: null },
      }));
    }
  }

  function removeChoiceMedia(idx, kind) {
    setFormDirty((p) => {
      const next = [...(p.choices || [])];
      if (!next[idx]) return p;

      next[idx] = {
        ...next[idx],
        ...(kind === "image" ? { image: "", image_path: "" } : { audio: "", audio_path: "" }),
      };

      const nextTempChoices = [...(p.temp?.choices || [])];
      if (!nextTempChoices[idx]) nextTempChoices[idx] = { image: null, audio: null };
      nextTempChoices[idx] = {
        ...nextTempChoices[idx],
        ...(kind === "image" ? { image: null } : { audio: null }),
      };

      return { ...p, choices: next, temp: { ...p.temp, choices: nextTempChoices } };
    });
  }

  function addChoiceRow() {
    setFormDirty((p) => ({
      ...p,
      choices: [
        ...(p.choices || []),
        {
          key: `choice_${(p.choices?.length || 0) + 1}`,
          image: "",
          image_path: "",
          audio: "",
          audio_path: "",
        },
      ],
      temp: { ...p.temp, choices: [...(p.temp?.choices || []), { image: null, audio: null }] },
    }));
  }

  function removeChoiceRow(idx) {
    setFormDirty((p) => {
      const next = [...(p.choices || [])];
      next.splice(idx, 1);

      const nextTempChoices = [...(p.temp?.choices || [])];
      nextTempChoices.splice(idx, 1);

      const validKeys = new Set(next.map((c) => c.key));
      const correct = validKeys.has(p.correct) ? p.correct : "";

      return { ...p, choices: next, correct, temp: { ...p.temp, choices: nextTempChoices } };
    });
  }

  // -------------------------
  // Save / Delete Activity
  // -------------------------
  async function saveActivitySafe() {
    if (!editing) return;

    const v = validateForm(form);
    setErrors(v);
    if (Object.keys(v).length > 0) {
      setStatusMsg("Please complete the required fields.");
      return;
    }

    setSaving(true);
    setStatusMsg(editing?.id ? "Saving changes..." : "Creating question...");

    try {
      const choicesForDb = (form.choices || [])
        .map((c, idx) => ({
          key: (c.key || `choice_${idx + 1}`).trim(),
          label: null,
          image: c.image_path || c.image || null,
          audio: c.audio_path || c.audio || null,
        }))
        .filter((c) => c.key);

      const validKeys = new Set(choicesForDb.map((c) => c.key));
      const correctKey = validKeys.has(form.correct) ? form.correct : null;

      const body = {
        lang,
        type: form.type,
        layout: form.layout,
        prompt: (form.prompt || "").trim(),
        i18n: {
          prompt_image: form.prompt_image_path || form.prompt_image || null,
          prompt_audio: form.prompt_audio_path || form.prompt_audio || null,
          choices: choicesForDb,
          correct: correctKey,
          expected_emotion: form.expected_emotion?.trim() || null,
          expected_speech: form.expected_speech?.trim() || null,
        },
      };

      let updatedOrCreated = null;

      if (!editing?.id) {
        if (!selectedLesson?.id)
          throw new Error("Missing lesson context. Please re-open the lesson.");

        const res = await apiFetch(
          `/teacher/manage-lessons/lessons/${selectedLesson.id}/activities`,
          {
            token,
            method: "POST",
            body,
          }
        );
        updatedOrCreated = res?.activity;

        if (updatedOrCreated) {
          setActivities((prev) =>
            [...prev, updatedOrCreated].sort(
              (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
            )
          );
          setEditing(updatedOrCreated);
          openEditor(updatedOrCreated);
        }
      } else {
        const res = await apiFetch(
          `/teacher/manage-lessons/activities/${editing.id}`,
          {
            token,
            method: "PATCH",
            body,
          }
        );
        updatedOrCreated = res?.activity;

        if (updatedOrCreated) {
          setActivities((prev) => prev.map((x) => (x.id === updatedOrCreated.id ? updatedOrCreated : x)));
          setEditing(updatedOrCreated);
          openEditor(updatedOrCreated);
        }
      }

      setDirty(false);
      setErrors({});
      setStatusMsg("Saved!");
      setTimeout(() => setStatusMsg(""), 1000);
    } catch (e) {
      console.error(e);
      setStatusMsg(e.message || "Save failed");
      alert(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // ✅ Soft-delete friendly: backend marks inactive + resequences sort_order.
  async function deleteActivity() {
    if (!editing) return;

    if (!editing?.id) {
      closeEditor();
      return;
    }

    if (!confirm("Delete this activity?")) return;

    try {
      setStatusMsg("Deleting...");
      await apiFetch(`/teacher/manage-lessons/activities/${editing.id}`, {
        token,
        method: "DELETE",
      });

      // ✅ refetch so list is correct and resequenced
      await refreshActivities();

      setEditing(null);
      setDirty(false);
      setErrors({});
      setStatusMsg("");
    } catch (e) {
      console.error(e);
      setStatusMsg(e.message || "Delete failed");
      alert(e.message || "Delete failed");
    }
  }

  // -------------------------
  // UI flags based on type+layout
  // -------------------------
  const t = (form.type || "").toLowerCase();
  const lay = (form.layout || "").toLowerCase();

  const isChoose = t === "mcq" && lay === "choose";
  const isSound = t === "mcq" && lay === "sound";
  const isImage = t === "mcq" && lay === "image";
  const isSequence = t === "mcq" && lay === "sequence";
  const isAsr = t === "asr" && lay === "asr";
  const isEmotion = t === "emotion" && lay === "emotion";

  const showPromptImage = isImage || isAsr;
  const showPromptAudio = isSound || isAsr;

  const showChoices = isChoose || isSound || isImage || isSequence;
  const choiceNeedsImage = isChoose || isSound || isImage || isSequence;
  const choiceNeedsAudio = isSound;

  const chapterTitle = selectedChapter
    ? lang === "tl"
      ? selectedChapter.title_tl
      : selectedChapter.title_en
    : "";
  const lessonTitle = selectedLesson
    ? lang === "tl"
      ? selectedLesson.title_tl
      : selectedLesson.title_en
    : "";

  // -------------------------
  // Dropzone UI component
  // -------------------------
  function Dropzone({
    icon,
    title,
    subtitle,
    hasFile,
    preview,
    onBrowse,
    onRemove,
    kind,
  }) {
    return (
      <div className="rounded-3xl bg-white">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-gray-800">{title}</div>
          {hasFile ? (
            <button
              className="px-3 py-1.5 rounded-xl text-xs bg-gray-100 hover:bg-gray-200"
              onClick={onRemove}
              type="button"
            >
              Remove
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onBrowse}
          className="mt-2 w-full text-left rounded-2xl border border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 transition p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white grid place-items-center border border-gray-200">
              {icon}
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-gray-800">
                {hasFile ? "Replace file" : "Upload file"}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>
            </div>

            <div className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-white border border-gray-200 text-sm">
              <FiUploadCloud />
              Browse
            </div>
          </div>

          <div className="mt-3 rounded-2xl bg-white border border-gray-200 overflow-hidden">
            <div className="h-32 grid place-items-center">
              {preview ? (
                kind === "image" ? (
                  <img src={preview} alt="preview" className="max-h-28 object-contain" />
                ) : (
                  <audio controls src={preview} className="w-full px-3" />
                )
              ) : (
                <div className="text-sm text-gray-400">No file selected</div>
              )}
            </div>
          </div>
        </button>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .soft-ring:focus { outline: none; box-shadow: 0 0 0 4px rgba(46,75,255,.12); border-color: rgba(46,75,255,.35); }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="min-h-[100dvh] bg-[#F6F7FB] flex flex-col lg:flex-row lg:pl-64">
        {/* Sidebar (DO NOT REMOVE) */}
        <aside className="hidden lg:flex fixed top-0 left-0 h-screen w-64 bg-[#2E4bff] text-white px-6 py-8 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex flex-col items-center mb-8">
              <img src={hmhIcon} alt="HearMyHeart" className="w-auto h-18 mb-3 object-contain" />
              <div className="text-2xl font-bold">HearMyHeart</div>
            </div>

            <Link
              to="/teacher"
              className={`flex items-center gap-3 px-3 py-2 rounded-2xl mb-2 transition-all font-medium ${
                location.pathname === "/teacher"
                  ? "bg-white text-[#2E4bff] font-semibold"
                  : "hover:bg-white/10"
              }`}
            >
              <GoHome className="text-xl" />
              <span>Dashboard</span>
            </Link>

            <Link
              to="/teacher/students"
              className={`flex items-center gap-3 px-3 py-2 rounded-2xl mb-2 transition-all font-medium ${
                location.pathname.startsWith("/teacher/students")
                  ? "bg-white text-[#2E4bff] font-semibold"
                  : "hover:bg-white/10"
              }`}
            >
              <PiStudentBold className="text-xl" />
              <span>Students</span>
            </Link>

            <Link
              to="/teacher/analytics"
              className={`flex items-center gap-3 px-3 py-2 rounded-2xl mb-2 transition-all font-medium ${
                location.pathname.startsWith("/teacher/analytics")
                  ? "bg-white text-[#2E4bff] font-semibold"
                  : "hover:bg-white/10"
              }`}
            >
              <SiGoogleanalytics className="text-xl" />
              <span>Analytics</span>
            </Link>

            <Link
              to="/teacher/lesson-management"
              className={`flex items-center gap-3 px-3 py-2 rounded-2xl mb-2 transition-all font-medium ${
                location.pathname.startsWith("/teacher/lesson-management")
                  ? "bg-white text-[#2E4bff] font-semibold"
                  : "hover:bg-white/10"
              }`}
            >
              <MdMenuBook className="text-xl" />
              <span>Manage</span>
            </Link>
          </div>

          <div className="pt-2 border-t border-white/20 flex justify-center">
            <button
              className="p-3 rounded-full hover:bg-white/10 transition-transform"
              onClick={() => {
                auth.signout();
                nav("/login");
              }}
              aria-label="Logout"
              title="Logout"
            >
              <FiLogOut className="text-2xl transform rotate-180" />
            </button>
          </div>
        </aside>

        {/* Mobile Drawer */}
        {!navOpen && (
          <div
            className="lg:hidden fixed inset-y-0 left-0 w-15 z-40"
            onTouchStart={onEdgeTouchStart}
            onTouchMove={onEdgeTouchMove}
            onTouchEnd={onEdgeTouchEnd}
          />
        )}
        <div
          className={`lg:hidden ${drawerClasses}`}
          style={drawerStyle}
          onTouchStart={onDrawerTouchStart}
          onTouchMove={onDrawerTouchMove}
          onTouchEnd={onDrawerTouchEnd}
        >
          <div className="flex flex-col items-center mb-6">
            <img src={hmhIcon} alt="HearMyHeart" className="w-auto h-15 mb-2 object-contain" />
            <div className="text-2xl font-bold">HearMyHeart</div>
          </div>

          <Link
            to="/teacher"
            onClick={() => setNavOpen(false)}
            className="flex items-center gap-3 px-3 py-2 rounded-2xl mb-2 hover:bg-white/10"
          >
            <GoHome className="text-xl" /> <span>Dashboard</span>
          </Link>
          <Link
            to="/teacher/students"
            onClick={() => setNavOpen(false)}
            className="flex items-center gap-3 px-3 py-2 rounded-2xl mb-2 hover:bg-white/10"
          >
            <PiStudentBold className="text-xl" /> <span>Students</span>
          </Link>
          <Link
            to="/teacher/analytics"
            onClick={() => setNavOpen(false)}
            className="flex items-center gap-3 px-3 py-2 rounded-2xl mb-2 hover:bg-white/10"
          >
            <SiGoogleanalytics className="text-xl" /> <span>Analytics</span>
          </Link>
          <Link
            to="/teacher/lesson-management"
            onClick={() => setNavOpen(false)}
            className="flex items-center gap-3 px-3 py-2 rounded-2xl mb-2 hover:bg-white/10"
          >
            <MdMenuBook className="text-xl" /> <span>Manage</span>
          </Link>

          <div className="mt-auto pt-2 border-t border-white/20 flex justify-center">
            <button
              className="p-3 rounded-full hover:bg-white/10 transition-transform"
              onClick={() => {
                auth.signout();
                nav("/login");
              }}
              aria-label="Logout"
              title="Logout"
            >
              <FiLogOut className="text-2xl transform rotate-180" />
            </button>
          </div>
        </div>

        {navOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/40 z-40"
            onClick={() => setNavOpen(false)}
          />
        )}

        {/* Main */}
        <main className="flex-1 p-4 md:p-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex flex-col gap-2">
              {step !== "chapters" && (
                <button
                  className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition w-fit"
                  onClick={goBackOneStep}
                  aria-label="Go back"
                  title="Back"
                >
                  <FiArrowLeft className="text-base" />
                  <span>Back</span>
                </button>
              )}

              <h1 className="text-3xl font-bold">Lesson Management</h1>

              {step === "lessons" && selectedChapter && (
                <div className="text-sm text-gray-600">
                  <span className="font-semibold">{chapterLabel(selectedChapter)}</span>
                  {chapterTitle ? (
                    <>
                      <span className="text-gray-400"> • </span>
                      <span>{chapterTitle}</span>
                    </>
                  ) : null}
                </div>
              )}

              {step === "activities" && selectedChapter && selectedLesson && (
                <div className="text-sm text-gray-600">
                  <span className="font-semibold">{chapterLabel(selectedChapter)}</span>
                  <span className="text-gray-400"> • </span>
                  <span className="font-semibold">{lessonTitle || "Lesson"}</span>
                  <span className="text-gray-400"> • </span>
                  <span className="font-semibold text-gray-800">Activities</span>
                </div>
              )}

             
            </div>

            <div className="flex gap-2">
              <button
                className={`px-4 py-2 rounded-2xl border transition ${
                  lang === "en"
                    ? "bg-[#2E4bff] text-white border-[#2E4bff]"
                    : "bg-white border-gray-200 hover:bg-gray-50"
                }`}
                onClick={() => setLang("en")}
              >
                English
              </button>
              <button
                className={`px-4 py-2 rounded-2xl border transition ${
                  lang === "tl"
                    ? "bg-[#2E4bff] text-white border-[#2E4bff]"
                    : "bg-white border-gray-200 hover:bg-gray-50"
                }`}
                onClick={() => setLang("tl")}
              >
                Tagalog
              </button>
            </div>
          </div>

          {/* STEP 1: Chapters */}
          {step === "chapters" && (
            <div className="mt-6">
              <div className="font-semibold text-gray-800 mb-3">Chapters</div>

              {chaptersLoading ? (
                <div className="text-gray-500">Loading chapters...</div>
              ) : chapters.length === 0 ? (
                <div className="text-gray-500">No chapters found.</div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={async ({ active, over }) => {
                    if (!over || active.id === over.id) return;

                    const oldIndex = chapters.findIndex((c) => c.id === active.id);
                    const newIndex = chapters.findIndex((c) => c.id === over.id);
                    if (oldIndex < 0 || newIndex < 0) return;

                    const prev = chapters;
                    const next = arrayMove(chapters, oldIndex, newIndex).map((c, i) => ({
                      ...c,
                      sort_order: i + 1,
                    }));
                    setChapters(next);

                    try {
                      await saveReorder(
                        "/teacher/manage-lessons/chapters/reorder",
                        next.map((c) => c.id)
                      );
                    } catch (e) {
                      console.error(e);
                      setChapters(prev);
                      alert(e?.message || "Failed to save chapter order");
                    }
                  }}
                >
                  <SortableContext
                    items={chapters.map((c) => c.id)}
                    strategy={rectSortingStrategy}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {chapters.map((ch) => {
                        const title = lang === "tl" ? ch.title_tl : ch.title_en;

                        return (
                          <SortableCard key={ch.id} id={ch.id}>
                            <button
                              className="w-full text-left bg-white rounded-3xl shadow-sm border border-gray-200 hover:shadow-md transition overflow-hidden"
                              onClick={() => {
                                setSelectedChapter(ch);
                                setStep("lessons");
                              }}
                            >
                              <div className="h-44 w-full bg-gray-50">
                                {ch.bg_path_resolved ? (
                                  <img
                                    src={ch.bg_path_resolved}
                                    alt={title}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full grid place-items-center text-gray-400 text-sm">
                                    No image
                                  </div>
                                )}
                              </div>

                              <div className="p-4">
                                <div className="text-xs font-semibold tracking-wide text-gray-500">
                                  {chapterLabel(ch).toUpperCase()}
                                </div>
                                <div className="mt-1 font-bold text-gray-900 text-lg">
                                  {title}
                                </div>
                              </div>
                            </button>

                            {/* hover pencil */}
                            <button
                              type="button"
                              className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition rounded-2xl bg-white/95 border border-gray-200 shadow-sm p-2 hover:bg-gray-50"
                              title="Edit chapter"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                openMetaEditor("chapter", ch);
                              }}
                            >
                              <FiEdit2 />
                            </button>
                          </SortableCard>
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          )}

          {/* STEP 2: Lessons */}
          {step === "lessons" && (
            <div className="mt-6">
              {lessonsLoading ? (
                <div className="text-gray-500">Loading lessons...</div>
              ) : lessons.length === 0 ? (
                <div className="text-gray-500">No lessons found for this chapter.</div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={async ({ active, over }) => {
                    if (!over || active.id === over.id) return;

                    const oldIndex = lessons.findIndex((l) => l.id === active.id);
                    const newIndex = lessons.findIndex((l) => l.id === over.id);
                    if (oldIndex < 0 || newIndex < 0) return;

                    const prev = lessons;
                    const next = arrayMove(lessons, oldIndex, newIndex).map((l, i) => ({
                      ...l,
                      sort_order: i + 1,
                    }));
                    setLessons(next);

                    try {
                      await saveReorder(
                        `/teacher/manage-lessons/chapters/${selectedChapter.id}/lessons/reorder`,
                        next.map((l) => l.id)
                      );
                    } catch (e) {
                      console.error(e);
                      setLessons(prev);
                      alert(e?.message || "Failed to save lesson order");
                    }
                  }}
                >
                  <SortableContext items={lessons.map((l) => l.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {lessons.map((l) => {
                        const title = lang === "tl" ? l.title_tl : l.title_en;
                        const desc = lang === "tl" ? l.description_tl : l.description_en;

                        return (
                          <SortableCard key={l.id} id={l.id}>
                            <button
                              className="w-full text-left bg-white rounded-3xl shadow-sm border border-gray-200 hover:shadow-md transition overflow-hidden"
                              onClick={() => {
                                setSelectedLesson(l);
                                setStep("activities");
                              }}
                            >
                              <div className="h-44 w-full bg-gray-50">
                                {l.cover_path_resolved ? (
                                  <img
                                    src={l.cover_path_resolved}
                                    alt={title}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full grid place-items-center text-gray-400 text-sm">
                                    No image
                                  </div>
                                )}
                              </div>

                              <div className="p-4">
                                <div className="font-bold text-gray-900 text-lg">{title}</div>
                                {desc ? (
                                  <div className="text-sm text-gray-600 mt-1 line-clamp-2">
                                    {desc}
                                  </div>
                                ) : (
                                  <div className="text-sm text-gray-400 mt-1">
                                    No description
                                  </div>
                                )}
                                <div className="text-xs text-gray-500 mt-2">{l.code}</div>
                              </div>
                            </button>

                            <button
                              type="button"
                              className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition rounded-2xl bg-white/95 border border-gray-200 shadow-sm p-2 hover:bg-gray-50"
                              title="Edit lesson"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                openMetaEditor("lesson", l);
                              }}
                            >
                              <FiEdit2 />
                            </button>
                          </SortableCard>
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          )}

          {/* STEP 3: Activities list */}
          {step === "activities" && (
            <div className="mt-6">
              <div className="flex items-center justify-end">
                <button
                  className="px-4 py-2 rounded-2xl bg-[#2E4bff] text-white hover:brightness-110 transition"
                  onClick={() => {
                    setAddKind("sound");
                    setAddOpen(true);
                  }}
                >
                  + Add Question
                </button>
              </div>

              <div className="mt-4 bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                {activitiesLoading ? (
                  <div className="p-4 text-gray-500">Loading activities...</div>
                ) : activities.length === 0 ? (
                  <div className="p-4 text-gray-500">No activities found.</div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={async ({ active, over }) => {
                      if (!over || active.id === over.id) return;

                      const oldIndex = activities.findIndex((a) => a.id === active.id);
                      const newIndex = activities.findIndex((a) => a.id === over.id);
                      if (oldIndex < 0 || newIndex < 0) return;

                      const prev = activities;
                      const next = arrayMove(activities, oldIndex, newIndex).map((a, i) => ({
                        ...a,
                        sort_order: i + 1,
                      }));
                      setActivities(next);

                      try {
                        await saveReorder(
                          `/teacher/manage-lessons/lessons/${selectedLesson.id}/activities/reorder`,
                          next.map((a) => a.id)
                        );
                        // optional: refresh to match backend normalization
                        // await refreshActivities();
                      } catch (e) {
                        console.error(e);
                        setActivities(prev);
                        alert(e?.message || "Failed to save activity order");
                      }
                    }}
                  >
                    <SortableContext
                      items={activities.map((a) => a.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="divide-y divide-gray-100">
                        {activities.map((a, idx) => {
                          const typeLabel = activityDisplayName(a);
                          const prompt = a.prompt || "Untitled question";

                          return (
                            <SortableRow key={a.id} id={a.id}>
                              <div className="p-4 flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  {/* ✅ always a clean 1..N list */}
                                  <div className="font-semibold text-gray-900 break-words">
                                    {idx + 1}. {prompt}
                                  </div>

                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">
                                      {typeLabel}
                                    </span>
                                  </div>
                                </div>

                                <button
                                  className="shrink-0 px-4 py-2 rounded-2xl bg-[#2E4bff] text-white hover:brightness-110 transition"
                                  onClick={() => openEditor(a)}
                                >
                                  Edit
                                </button>
                              </div>
                            </SortableRow>
                          );
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Floating (+) Chapters */}
      {step === "chapters" && (
        <button
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#2E4bff] text-white shadow-lg hover:brightness-110 transition text-3xl grid place-items-center z-50"
          onClick={() => setShowCreateChapter(true)}
          aria-label="Add chapter"
          title="Add chapter"
        >
          +
        </button>
      )}

      {/* Floating (+) Lessons */}
      {step === "lessons" && selectedChapter && (
        <button
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#2E4bff] text-white shadow-lg hover:brightness-110 transition text-3xl grid place-items-center z-50"
          onClick={() => setShowCreateLesson(true)}
          aria-label="Add lesson"
          title="Add lesson"
        >
          +
        </button>
      )}

      <CreateChapterDrawer
        open={showCreateChapter}
        onClose={() => setShowCreateChapter(false)}
        token={token}
        onCreated={(chapter) => {
          if (!chapter) return;
          setChapters((prev) => {
            const next = [...prev, chapter];
            next.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
            return next;
          });
        }}
      />

      <CreateLessonDrawer
        open={showCreateLesson}
        onClose={() => setShowCreateLesson(false)}
        chapterId={selectedChapter?.id}
        token={token}
        onCreated={(lesson) => {
          if (!lesson) return;
          setLessons((prev) => {
            const next = [...prev, lesson];
            next.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
            return next;
          });
        }}
      />

      {/* ✅ CHAPTER/LESSON EDIT MODAL */}
      {metaEditOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeMetaEditor();
          }}
        >
          <div className="w-[min(980px,96vw)] bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-4 md:px-5 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <div className="text-base font-semibold text-gray-900">Edit</div>

              <button
                className="w-10 h-10 rounded-2xl border border-gray-200 hover:bg-gray-50 grid place-items-center"
                onClick={closeMetaEditor}
                aria-label="Close"
                title="Close"
                type="button"
              >
                <FiX className="text-lg" />
              </button>
            </div>

            {metaErr && (
              <div className="px-4 md:px-5 py-3 border-b border-gray-200 shrink-0">
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {metaErr}
                </div>
              </div>
            )}

            <div className="p-4 md:p-5 space-y-5 overflow-y-auto hide-scrollbar">
              <div>
                <div className="text-xs text-gray-500 mb-2">Photo</div>

                <button
                  type="button"
                  onClick={() => openFilePicker("image/*", pickMetaFile)}
                  className="group relative w-full rounded-3xl border border-gray-200 overflow-hidden bg-gray-50 focus:outline-none"
                  aria-label="Upload photo"
                  title="Upload photo"
                >
                  <div className="h-40 md:h-48 w-full">
                    {metaForm.filePreview ? (
                      <img
                        src={metaForm.filePreview}
                        alt="preview"
                        className="w-full h-full object-cover transition duration-200 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="h-full grid place-items-center text-gray-400 text-sm">
                        Click to upload image
                      </div>
                    )}
                  </div>

                  <div className="pointer-events-none absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2 text-white">
                      <FiUploadCloud className="text-3xl" />
                      <span className="text-sm font-medium">
                        {metaForm.filePreview ? "Change photo" : "Upload photo"}
                      </span>
                    </div>
                  </div>
                </button>

                <div className="mt-2 text-xs text-gray-500">
                  Click the image to {metaForm.filePreview ? "change" : "upload"} a photo.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500">Title (English)</label>
                  <input
                    className="w-full mt-1 px-3 py-2 rounded-2xl border border-gray-200 soft-ring"
                    value={metaForm.title_en}
                    onChange={(e) => setMetaForm((p) => ({ ...p, title_en: e.target.value }))}
                    placeholder="English title"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-500">Title (Tagalog)</label>
                  <input
                    className="w-full mt-1 px-3 py-2 rounded-2xl border border-gray-200 soft-ring"
                    value={metaForm.title_tl}
                    onChange={(e) => setMetaForm((p) => ({ ...p, title_tl: e.target.value }))}
                    placeholder="Tagalog title"
                  />
                </div>
              </div>

              {metaEditKind === "lesson" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500">Description (English)</label>
                    <textarea
                      className="w-full mt-1 px-3 py-2 rounded-2xl border border-gray-200 soft-ring min-h-[140px] resize-none"
                      value={metaForm.description_en}
                      onChange={(e) => setMetaForm((p) => ({ ...p, description_en: e.target.value }))}
                      placeholder="English description"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-500">Description (Tagalog)</label>
                    <textarea
                      className="w-full mt-1 px-3 py-2 rounded-2xl border border-gray-200 soft-ring min-h-[140px] resize-none"
                      value={metaForm.description_tl}
                      onChange={(e) => setMetaForm((p) => ({ ...p, description_tl: e.target.value }))}
                      placeholder="Tagalog description"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 md:p-5 border-t border-gray-200 flex items-center justify-end gap-2 shrink-0 bg-white">
              <button
                className="px-4 py-2 rounded-2xl bg-gray-100 hover:bg-gray-200"
                onClick={closeMetaEditor}
                type="button"
              >
                Cancel
              </button>

              <button
                className="px-5 py-2 rounded-2xl bg-[#2E4bff] text-white hover:brightness-110 disabled:opacity-60"
                onClick={saveMeta}
                disabled={metaSaving}
                type="button"
              >
                {metaSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD QUESTION MODAL (Dropdown) */}
      {addOpen && (
        <div className="fixed inset-0 z-[65] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="p-4 md:p-5 border-b border-gray-200 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold text-gray-900">Add Question</div>
                <div className="text-sm text-gray-500">Choose an activity type to start.</div>
              </div>
              <button
                className="px-3 py-2 rounded-2xl border border-gray-200 hover:bg-gray-50"
                onClick={() => setAddOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="p-4 md:p-5 space-y-4">
              <div>
                <label className="text-xs text-gray-500">Activity Type</label>
                <select
                  className="w-full mt-1 px-3 py-2 rounded-2xl border border-gray-200 soft-ring"
                  value={addKind}
                  onChange={(e) => setAddKind(e.target.value)}
                >
                  <option value="choose">Object Recognition</option>
                  <option value="sound">Sound Recognition</option>
                  <option value="image">Emotion Identification</option>
                  <option value="sequence">Sequence Awareness</option>
                  <option value="asr">Speech Practice</option>
                  <option value="emotion">Emotion Imitation</option>
                </select>
              </div>
            </div>

            <div className="p-4 md:p-5 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                className="px-4 py-2 rounded-2xl bg-gray-100 hover:bg-gray-200"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-5 py-2 rounded-2xl bg-[#2E4bff] text-white hover:brightness-110"
                onClick={() => startDraftFromKind(addKind)}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL (Activities) */}
      {editing && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-6xl bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 md:p-5 border-b border-gray-200 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold text-gray-900">
                  {editing?.id ? "Edit Activity" : "New Question"}
                </div>
                <div className="text-sm text-gray-500">
                  {activityDisplayName(editing)} •{" "}
                  {editing?.id ? `#${editing.sort_order}` : "Not saved yet"} • Lang:{" "}
                  {lang.toUpperCase()}
                </div>
              </div>
              <button
                className="px-3 py-2 rounded-2xl border border-gray-200 hover:bg-gray-50"
                onClick={closeEditor}
              >
                Close
              </button>
            </div>

            {(statusMsg || Object.keys(errors).length > 0) && (
              <div className="px-4 md:px-5 py-3 border-b border-gray-200">
                {Object.keys(errors).length > 0 ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <div className="font-semibold">Please fix:</div>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                      {Object.values(errors).slice(0, 6).map((msg, i) => (
                        <li key={i}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                    {statusMsg}
                  </div>
                )}
              </div>
            )}

            <div className="p-4 md:p-5 overflow-auto flex-1 hide-scrollbar">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="space-y-5">
                  <div>
                    <label className="text-xs text-gray-500">
                      Question / Prompt <span className="text-red-500">*</span>
                    </label>

                    <input
                      className={`w-full mt-1 px-3 py-2 rounded-2xl border soft-ring ${
                        computedErrors.prompt ? "border-red-300 bg-red-50" : "border-gray-200"
                      }`}
                      value={form.prompt}
                      onChange={(e) => setFormDirty((p) => ({ ...p, prompt: e.target.value }))}
                      placeholder={defaultPromptForKind(lay)}
                    />

                    {computedErrors.prompt && (
                      <div className="text-xs text-red-600 mt-1">{computedErrors.prompt}</div>
                    )}
                  </div>

                  {isEmotion && (
                    <div>
                      <label className="text-xs text-gray-500">
                        Emotion to imitate <span className="text-red-500">*</span>
                      </label>
                      <input
                        className={`w-full mt-1 px-3 py-2 rounded-2xl border soft-ring ${
                          computedErrors.expected_emotion
                            ? "border-red-300 bg-red-50"
                            : "border-gray-200"
                        }`}
                        value={form.expected_emotion || ""}
                        onChange={(e) => setFormDirty((p) => ({ ...p, expected_emotion: e.target.value }))}
                        placeholder={lang === "tl" ? "hal: masaya" : "e.g., happy"}
                      />
                      {computedErrors.expected_emotion && (
                        <div className="text-xs text-red-600 mt-1">{computedErrors.expected_emotion}</div>
                      )}
                    </div>
                  )}

                  {isAsr && (
                    <div>
                      <label className="text-xs text-gray-500">
                        Expected speech <span className="text-red-500">*</span>
                      </label>
                      <input
                        className={`w-full mt-1 px-3 py-2 rounded-2xl border soft-ring ${
                          computedErrors.expected_speech
                            ? "border-red-300 bg-red-50"
                            : "border-gray-200"
                        }`}
                        value={form.expected_speech || ""}
                        onChange={(e) => setFormDirty((p) => ({ ...p, expected_speech: e.target.value }))}
                        placeholder={lang === "tl" ? "hal: baka" : "e.g., cow"}
                      />
                      {computedErrors.expected_speech && (
                        <div className="text-xs text-red-600 mt-1">{computedErrors.expected_speech}</div>
                      )}
                    </div>
                  )}

                  {showChoices && (
                    <div>
                      <label className="text-xs text-gray-500">
                        Correct Answer (Key) <span className="text-red-500">*</span>
                      </label>
                      <select
                        className={`w-full mt-1 px-3 py-2 rounded-2xl border soft-ring ${
                          computedErrors.correct ? "border-red-300 bg-red-50" : "border-gray-200"
                        }`}
                        value={form.correct || ""}
                        onChange={(e) => setFormDirty((p) => ({ ...p, correct: e.target.value }))}
                      >
                        <option value="">Select correct answer</option>
                        {(form.choices || []).map((c, idx) => (
                          <option key={idx} value={c.key}>
                            {c.key || `Choice ${idx + 1}`}
                          </option>
                        ))}
                      </select>
                      {computedErrors.correct && (
                        <div className="text-xs text-red-600 mt-1">{computedErrors.correct}</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-5">
                  {(showPromptImage || showPromptAudio) && (
                    <div className="rounded-3xl border border-gray-200 p-4 bg-white">
                      <div className="font-semibold text-gray-800">Prompt Media</div>

                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {showPromptImage && (
                          <Dropzone
                            kind="image"
                            icon={<FiImage />}
                            title="Prompt Picture"
                            subtitle="PNG, JPG, WEBP"
                            hasFile={!!form.prompt_image}
                            preview={pickPromptImage(form)}
                            onBrowse={() => uploadPromptMedia("image")}
                            onRemove={() => removePromptMedia("image")}
                          />
                        )}

                        {showPromptAudio && (
                          <Dropzone
                            kind="audio"
                            icon={<FiMusic />}
                            title="Prompt Sound"
                            subtitle="MP3, WAV, M4A"
                            hasFile={!!form.prompt_audio}
                            preview={pickPromptAudio(form)}
                            onBrowse={() => uploadPromptMedia("audio")}
                            onRemove={() => removePromptMedia("audio")}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {showChoices && (
                <div className="mt-5 rounded-3xl border border-gray-200 p-4 bg-white">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="font-semibold text-gray-800">Choices</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {isSound
                          ? "SoundRecognition: choices can have picture + sound."
                          : isImage
                          ? "EmotionIdentification: picture choices."
                          : isChoose
                          ? "ObjectRecognition: picture choices."
                          : "SequenceAwareness: steps (optional pictures)."}
                      </div>
                      {computedErrors.choices && (
                        <div className="text-xs text-red-600 mt-1">{computedErrors.choices}</div>
                      )}
                    </div>

                    <button
                      className="px-4 py-2 rounded-2xl bg-gray-100 hover:bg-gray-200 text-sm"
                      onClick={addChoiceRow}
                      type="button"
                    >
                      + Add Choice
                    </button>
                  </div>

                  <div className="mt-4 space-y-4">
                    {(form.choices || []).map((c, idx) => (
                      <div key={idx} className="rounded-3xl border border-gray-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <label className="text-xs text-gray-500">
                              Choice Key <span className="text-red-500">*</span>
                            </label>
                            <input
                              className={`w-full mt-1 px-3 py-2 rounded-2xl border soft-ring ${
                                computedErrors[`choice_${idx}_key`]
                                  ? "border-red-300 bg-red-50"
                                  : "border-gray-200"
                              }`}
                              value={c.key}
                              onChange={(e) =>
                                setFormDirty((p) => {
                                  const next = [...(p.choices || [])];
                                  next[idx] = { ...next[idx], key: e.target.value };
                                  return { ...p, choices: next };
                                })
                              }
                            />
                            {computedErrors[`choice_${idx}_key`] && (
                              <div className="text-xs text-red-600 mt-1">
                                {computedErrors[`choice_${idx}_key`]}
                              </div>
                            )}
                          </div>

                          <button
                            className="shrink-0 px-3 py-2 rounded-2xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 text-sm"
                            onClick={() => removeChoiceRow(idx)}
                            type="button"
                            title="Remove choice"
                          >
                            Remove
                          </button>
                        </div>

                        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {choiceNeedsImage && (
                            <Dropzone
                              kind="image"
                              icon={<FiImage />}
                              title="Choice Picture"
                              subtitle="PNG, JPG, WEBP"
                              hasFile={!!pickChoiceImage(c)}
                              preview={pickChoiceImage(c)}
                              onBrowse={() => uploadChoiceMedia(idx, "image")}
                              onRemove={() => removeChoiceMedia(idx, "image")}
                            />
                          )}

                          {choiceNeedsAudio && (
                            <Dropzone
                              kind="audio"
                              icon={<FiMusic />}
                              title="Choice Sound"
                              subtitle="MP3, WAV, M4A"
                              hasFile={!!pickChoiceAudio(c)}
                              preview={pickChoiceAudio(c)}
                              onBrowse={() => uploadChoiceMedia(idx, "audio")}
                              onRemove={() => removeChoiceMedia(idx, "audio")}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 md:p-5 border-t border-gray-200 bg-white flex items-center justify-between gap-3 flex-wrap">
              <button
                className="px-4 py-2 rounded-2xl bg-gray-100 hover:bg-gray-200"
                onClick={closeEditor}
                type="button"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2">
                {editing?.id && (
                  <button
                    className="px-4 py-2 rounded-2xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                    onClick={deleteActivity}
                    type="button"
                  >
                    Delete
                  </button>
                )}

                <button
                  className="px-5 py-2 rounded-2xl bg-[#2E4bff] text-white hover:brightness-110 disabled:opacity-60"
                  onClick={saveActivitySafe}
                  disabled={saving || uploading || !isFormValid}
                  type="button"
                  title={!isFormValid ? "Fill in all required fields to save" : ""}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
