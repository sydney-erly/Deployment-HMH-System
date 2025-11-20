// src/pages/TeacherStudentProgress.jsx
import { captureNodeToPng, withTempClass } from "../lib/capture";
import * as htmlToImage from "html-to-image";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { auth } from "../lib/auth";
import hmhIcon from "../assets/hmh_icon.png";
import hmhIconBlue from "../assets/hmh_icon_blue.png";
import { FiLogOut, FiDownload, FiArrowLeft } from "react-icons/fi";
import { GoHome } from "react-icons/go";
import { PiStudentBold } from "react-icons/pi";
import { SiGoogleanalytics } from "react-icons/si";
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  BarChart,
  Bar,
  RadialBarChart,
  RadialBar,
  Cell,
} from "recharts";
import jsPDF from "jspdf";


export default function TeacherStudentProgress() {
  const nav = useNavigate();
  const location = useLocation();
  const { students_id } = useParams();
  const token = auth.token();


  const [student, setStudent] = useState(null);
  const [progress, setProgress] = useState({
    speech: [],
    emotion: [],
    lesson_avg: [],
    engagement: [],
    letter_accuracy: [],
    mastered_words: [],
    needs_practice_words: [],
    emotion_breakdown: [],
    emotion_trend: [],
    activity_heatmap: [],
  });
  const [recommendations, setRecommendations] = useState(null);


  const palette = {
    blue: "#2E4bff",
    yellow: "#FFC84A",
    red: "#E65460",
    green: "#1C4211",
    beige: "#EAE4D0",
    navy: "#0E3048",
    grayStroke: "#E5E7EB",
    textGray: "#6B7280",
  };
  const CHART_FONT_PX = 15;


  useEffect(() => {
    (async () => {
      try {
        const s = await apiFetch(`/teacher/student/${students_id}`, { token });
        setStudent(s);


        const p = await apiFetch(`/teacher/student/${students_id}/progress`, { token });
        setProgress({
          speech: p?.speech ?? [],
          emotion: p?.emotion ?? [],
          lesson_avg: p?.lesson_avg ?? [],
          engagement: p?.engagement ?? [],
          letter_accuracy: p?.letter_accuracy ?? [],
          mastered_words: p?.mastered_words ?? [],
          needs_practice_words: p?.needs_practice_words ?? [],
          emotion_breakdown: p?.emotion_breakdown ?? [],
          emotion_trend: p?.emotion_trend ?? [],
          activity_heatmap: p?.activity_heatmap ?? [],
        });


        const r = await apiFetch(`/teacher/student/${students_id}/recommendations`, { token });
        setRecommendations(r?.recommendations ?? null);
      } catch (e) {
        console.error("Failed to load progress:", e);
      }
    })();
  }, [students_id, token]);


  const overallSpeech = useMemo(() => {
    const arr = progress.speech.map((d) => d.avg ?? 0);
    return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  }, [progress.speech]);


  const overallEmotion = useMemo(() => {
    const src = progress.emotion_trend.length ? progress.emotion_trend : progress.emotion;
    const arr = src.map((d) => d.avg ?? 0);
    return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  }, [progress.emotion, progress.emotion_trend]);


  /* ========================= PDF HELPERS ========================= */
  const PAGE = { w: 210, h: 297, margin: 14 }; // A4 mm
  const FOOTER_SAFE = 8;
  const contentWidth = () => PAGE.w - PAGE.margin * 2;


  const PDF_PRINT_CSS = `
    #reportSections.pdf-zoom { transform-origin: top left; }
    #reportSections.pdf-zoom svg text { font-size: 1.6em !important; }
    #reportSections.pdf-zoom .chart-title-bar { font-size: ${CHART_FONT_PX * 1.25}px !important; }
    #reportSections.pdf-zoom .section-title-bar { font-size: 18px !important; }
    #reportSections.pdf-zoom .word-chip { font-size: 12px !important; }
  `;
  function injectPdfCss() {
    let el = document.getElementById("pdf-zoom-style");
    if (!el) {
      el = document.createElement("style");
      el.id = "pdf-zoom-style";
      el.textContent = PDF_PRINT_CSS;
      document.head.appendChild(el);
    }
  }
  async function withPdfZoom(el, fn) {
    injectPdfCss();
    el.classList.add("pdf-zoom");
    try {
      return await fn();
    } finally {
      el.classList.remove("pdf-zoom");
    }
  }


  async function captureElementToPng(el) {
    const touched = [];
    el.querySelectorAll("*").forEach((node) => {
      const cs = window.getComputedStyle(node);
      if (cs.color?.includes("oklch")) {
        touched.push({ node, prop: "color", prev: node.style.color });
        node.style.color = "rgb(17,17,17)";
      }
      if (cs.backgroundColor?.includes("oklch")) {
        touched.push({ node, prop: "backgroundColor", prev: node.style.backgroundColor });
        node.style.backgroundColor = "rgb(255,255,255)";
      }
    });
    const dataUrl = await htmlToImage.toPng(el, {
      pixelRatio: 3.5,
      cacheBust: true,
      backgroundColor: "#ffffff",
      filter: (node) => {
        if (!(node instanceof Element)) return true;
        const cs = getComputedStyle(node);
        return !(cs.color?.includes("oklch") || cs.backgroundColor?.includes("oklch"));
      },
    });
    touched.forEach(({ node, prop, prev }) => (node.style[prop] = prev));
    return dataUrl;
  }


  async function drawLetterheadAndBanner(pdf) {
    const centerX = PAGE.w / 2;


    pdf.setFont("times", "bold");
    pdf.setFontSize(18);
    pdf.text("Hope Intervention Center", centerX, 16, { align: "center" });


    pdf.setFont("times", "italic");
    pdf.setFontSize(11);
    pdf.text("A center for Autistic and Mentally Challenged Children", centerX, 22, { align: "center" });


    pdf.setDrawColor(30, 30, 30);
    pdf.setLineWidth(0.6);
    pdf.line(PAGE.margin, 26.5, PAGE.w - PAGE.margin, 26.5);


    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("City of Calamba, Laguna, Philippines 4027 | Tel. (049) 545-4235", centerX, 31, { align: "center" });


    const bannerY = 40;
    pdf.setFillColor(14, 48, 72);
    pdf.rect(PAGE.margin, bannerY, contentWidth(), 10, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(
      "STUDENT PROGRESS REPORT IN SPEECH AND EMOTIONAL DEVELOPMENT",
      PAGE.w / 2,
      bannerY + 6.7,
      { align: "center" }
    );
    pdf.setTextColor(0, 0, 0);


    return bannerY + 12;
  }


  function drawCompactInfoTable(pdf, topY) {
    const x = PAGE.margin;
    const w = contentWidth();
    const cols = 4;
    const colW = w / cols;
    const headerH = 8.5;
    const rowH = 11;
    const labelFS = 8;
    const valueFS = 9;


    const reportDate = new Date().toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
    const loginOrId = student?.login_id || student?.students_id || "—";
    const cells = [
      { label: "Student Name:", value: `${student?.first_name ?? ""} ${student?.last_name ?? ""}`.trim() || "—" },
      { label: "Speech Level:", value: student?.speech_level ?? "—" },
      { label: "Diagnosis:", value: student?.diagnosis ?? "—" },
      { label: "Room:", value: student?.room_assignment ?? "—" },
      { label: "Mother’s Name:", value: student?.mother_name ?? "—" },
      { label: "Father’s’ Name:", value: student?.father_name ?? "—" },
      { label: "Report Date:", value: reportDate },
      { label: "Student Login / ID:", value: String(loginOrId) },
    ];


    pdf.setDrawColor(120, 120, 120);
    pdf.rect(x, topY, w, headerH + 2 * rowH, "S");


    pdf.setFillColor(230, 230, 230);
    pdf.rect(x, topY, w, headerH, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("STUDENT INFORMATION", x + 2.5, topY + 5.7);


    pdf.setDrawColor(150, 150, 150);
    pdf.line(x, topY + headerH + rowH, x + w, topY + headerH + rowH);
    for (let i = 1; i < cols; i++) {
      const vx = x + i * colW;
      pdf.line(vx, topY + headerH, vx, topY + headerH + 2 * rowH);
    }


    const startY = topY + headerH;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const cx = x + c * colW;
        const cy = startY + r * rowH;
        if (!cells[idx]) continue;
        const { label, value } = cells[idx];


        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(labelFS);
        pdf.text(String(label), cx + 2.5, cy + 4.2, { maxWidth: colW - 5 });


        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(valueFS);
        pdf.text(String(value), cx + 2.5, cy + 8.6, { maxWidth: colW - 5 });
      }
    }


    return topY + headerH + 2 * rowH + 6;
  }


  function drawSectionHeader(pdf, title, y) {
    const x = PAGE.margin;
    const w = contentWidth();
    const h = 9;
    pdf.setFillColor(14, 48, 72);
    pdf.rect(x, y, w, h, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(title, x + 3, y + 6.2);
    pdf.setTextColor(0, 0, 0);
    return y + h + 4;
  }
  function drawDivider(pdf, y) {
    pdf.setDrawColor(210);
    pdf.setLineWidth(0.6);
    pdf.line(PAGE.margin, y, PAGE.w - PAGE.margin, y);
    return y + 5;
  }


  // ⬇️ Only-touched area: align logo with text by nudging it down a bit
  function drawFooter(pdf, logoImg) {
    const total = pdf.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      pdf.setPage(i);
      const y = PAGE.h - 9;
      const logoW = 6;
      const logoH = 6;


      // Move the logo down slightly so it aligns with the text baseline.
      // Positive = farther down the page.
      const logoYOffset = 2; // tweak 1–3mm as you prefer


      try {
        pdf.addImage(
          logoImg,
          "PNG",
          PAGE.margin,
          y - logoH + 1 + logoYOffset, // ← adjusted Y
          logoW,
          logoH,
          undefined,
          "FAST"
        );
      } catch {}


      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(25, 25, 25);
      pdf.text("HearMyHeart", PAGE.margin + logoW + 2, y + 1);


      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(90, 90, 90);
      const label = `Page ${i} of ${total}`;
      pdf.text(label, PAGE.w - PAGE.margin, y + 1, { align: "right" });


      pdf.setTextColor(0, 0, 0);
    }
  }


  // ---------- Chart primitives ----------
  function norm(v, min, max) { return max === min ? 0 : (v - min) / (max - min); }
  function niceRange(values, fallbackMax = 100) {
    if (!values?.length) return { min: 0, max: fallbackMax };
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) return { min: 0, max: max || fallbackMax };
    return { min, max };
  }
  function drawAxisBox(pdf, x, y, w, h, title) {
    pdf.setDrawColor(220);
    pdf.setLineWidth(0.5);
    pdf.rect(x, y, w, h);
    if (title) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10.5);
      pdf.text(title, x + 1, y - 2);
    }
  }


  function drawLineChart(pdf, x, y, w, h, arr, opts = {}) {
    drawAxisBox(pdf, x, y, w, h, opts.title);
    if (!arr?.length) {
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(10);
      pdf.setTextColor(150);
      pdf.text("No data yet", x + w / 2, y + h / 2, { align: "center" });
      pdf.setTextColor(0, 0, 0);
      return;
    }


    const values = arr.map(d => Number(d[opts.key ?? "value"] ?? d.value ?? d.avg ?? 0));
    let { min, max } = niceRange(values);
    if (max === min) max = min + 1;
    else {
      const pad = 0.05 * (max - min);
      min -= pad; max += pad;
    }
    const left = x + 10, right = x + w - 8, top = y + 10, bottom = y + h - 16;


    pdf.setDrawColor(232);
    pdf.setLineWidth(0.3);
    for (let i = 0; i <= 4; i++) {
      const gy = bottom - (i * (bottom - top) / 4);
      pdf.line(left, gy, right, gy);
    }


    pdf.setDrawColor(30, 90, 255);
    pdf.setLineWidth(1.5);
    pdf.setLineJoin(2);
    pdf.setLineCap(2);
    arr.forEach((d, i) => {
      const v = Number(d[opts.key ?? "value"] ?? d.value ?? d.avg ?? 0);
      const nx = left + (i * (right - left) / Math.max(1, arr.length - 1));
      const ny = bottom - norm(v, min, max) * (bottom - top);
      if (i === 0) pdf.line(nx, ny, nx, ny);
      else {
        const prev = arr[i - 1];
        const pv = Number(prev[opts.key ?? "value"] ?? prev.value ?? prev.avg ?? 0);
        const px = left + ((i - 1) * (right - left) / Math.max(1, arr.length - 1));
        const py = bottom - norm(pv, min, max) * (bottom - top);
        pdf.line(px, py, nx, ny);
      }
    });


    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(90);
    pdf.text(String(Math.round(min)), left - 3, bottom + 4, { align: "right" });
    pdf.text(String(Math.round(max)), left - 3, top + 2, { align: "right" });
    pdf.setTextColor(0, 0, 0);
  }


  function drawBarChart(pdf, x, y, w, h, items, opts = {}) {
    drawAxisBox(pdf, x, y, w, h, opts.title);
    if (!items?.length) {
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(10);
      pdf.setTextColor(150);
      pdf.text("No data yet", x + w / 2, y + h / 2, { align: "center" });
      pdf.setTextColor(0, 0, 0);
      return;
    }


    const values = items.map(d => Number(d[opts.valueKey ?? "value"] ?? d.acc ?? d.avg_match ?? 0));
    const { max } = niceRange(values);
    const left = x + 10, right = x + w - 10, top = y + 12, bottom = y + h - 18;


    const barGap = 6;
    const barW = Math.max(6, (right - left) / items.length - barGap);


    pdf.setDrawColor(232);
    pdf.setLineWidth(0.3);
    for (let i = 0; i <= 4; i++) {
      const gy = bottom - (i * (bottom - top) / 4);
      pdf.line(left, gy, right, gy);
    }


    items.forEach((d, i) => {
      const v = Number(d[opts.valueKey ?? "value"] ?? d.acc ?? d.avg_match ?? 0);
      const nx = left + i * (barW + barGap);
      const bh = norm(v, 0, max) * (bottom - top);
      const [r, g, b] = (opts.fillRgb ?? [46, 75, 255]);
      pdf.setFillColor(r, g, b);
      pdf.rect(nx, bottom - bh, barW, bh, "F");
    });


    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(90);
    const labelKey = opts.labelKey ?? "label";
    const labels = items.map(d => String(d[labelKey] ?? d.emotion ?? ""));
    const step = Math.max(1, Math.ceil(labels.length / 7));
    labels.forEach((lab, i) => {
      if (i % step !== 0) return;
      const nx = left + i * (barW + barGap) + barW / 2;
      pdf.text(lab.slice(0, 12), nx, bottom + 6, { align: "center" });
    });
    pdf.setTextColor(0, 0, 0);
  }


  function drawRadialGauge(pdf, cx, cy, r, percent, opts = {}) {
    const p = Math.max(0, Math.min(100, Number(percent) || 0));
    const color = opts.color ?? [46, 75, 255];


    function drawSemi(colorRGB, lineW, ratio = 1) {
      const steps = 140;
      pdf.setDrawColor(...colorRGB);
      pdf.setLineWidth(lineW);
      pdf.setLineCap(2);
      let prev = null;
      for (let i = 0; i <= Math.floor(steps * ratio); i++) {
        const t = Math.PI - (i / steps) * Math.PI; // PI -> 0
        const x = cx + r * Math.cos(t);
        const y = cy - r * Math.sin(t);
        if (prev) pdf.line(prev.x, prev.y, x, y);
        prev = { x, y };
      }
    }


    drawSemi([218, 218, 218], 6, 1);
    drawSemi(color, 6, p / 100);


    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(34);
    pdf.setFontSize(16);
    pdf.text(`${Math.round(p)}%`, cx, cy + 4, { align: "center" });
    pdf.setTextColor(0, 0, 0);


    if (opts.titleBelow) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text(String(opts.titleBelow), cx, cy + r + 8, { align: "center" });
    }
  }


  function drawHeatmap(pdf, x, y, w, h, rows) {
    drawAxisBox(pdf, x, y, w, h, "Activity-level correctness");
    if (!rows?.length) {
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(10);
      pdf.setTextColor(150);
      pdf.text("No data yet", x + w / 2, y + h / 2, { align: "center" });
      pdf.setTextColor(0, 0, 0);
      return;
    }
    const gridH = h - 14;
    const gridW = w - 10;
    const top = y + 10;
    const left = x + 5;


    const rCount = rows.length;
    const cCount = Math.max(...rows.map(r => r.length));
    const cellW = gridW / Math.max(1, cCount);
    const cellH = gridH / Math.max(1, rCount);


    rows.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        const acc = Number(cell?.acc ?? cell?.accuracy ?? 0);
        const g = Math.round(255 * (acc / 100));
        const r = Math.round(255 * (1 - acc / 100));
        pdf.setFillColor(r, g, 80);
        pdf.rect(left + ci * cellW + 1, top + ri * cellH + 1, cellW - 2, cellH - 2, "F");
      });
    });
  }


  // ---------- Word list columns (no inner borders) ----------
  function drawWordColumn(pdf, x, y, w, h, title, items = []) {
    const padX = 2;
    const topPad = 5;
    const bottomPad = 4;
    const lineH = 4.8;
    const titleFS = 10.5;
    const textFS = 10.5;


    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(titleFS);
    pdf.text(String(title), x + padX, y + topPad);


    const startY = y + topPad + 5.2;
    const usableH = h - (startY - y) - bottomPad;


    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(textFS);


    if (!items.length) {
      pdf.setFont("helvetica", "italic");
      pdf.setTextColor(150);
      pdf.text("No data yet", x + w / 2, y + h / 2, { align: "center" });
      pdf.setTextColor(0, 0, 0);
      return;
    }


    let ly = startY;
    items.forEach((it) => {
      if (ly > y + h - bottomPad) return;
      pdf.text(`• ${String(it)}`, x + padX, ly, { maxWidth: w - 2 * padX });
      ly += lineH;
    });
  }


  function drawTwoWordListsInOneBox_NoInnerBorders(pdf, x, y, w, h, leftTitle, leftItems = [], rightTitle, rightItems = []) {
    drawAxisBox(pdf, x, y, w, h, "Mastered & Needs Practice");
    const pad = 4;
    const innerX = x + pad;
    const innerY = y + 6;
    const innerW = w - pad * 2;
    const innerH = h - 10;


    const colGap = 8;
    const colW = (innerW - colGap) / 2;


    drawWordColumn(pdf, innerX, innerY, colW, innerH, leftTitle, leftItems);
    drawWordColumn(pdf, innerX + colW + colGap, innerY, colW, innerH, rightTitle, rightItems);
  }


  function drawGaugeSquareBox(pdf, x, y, side, percent, title, color) {
    drawAxisBox(pdf, x, y, side, side, "");
    const pad = 6;
    const cx = x + side / 2;
    const r = Math.max(24, (side / 2) - pad - 8);
    const cy = y + side / 2 - 4;
    drawRadialGauge(pdf, cx, cy, r, percent, { titleBelow: title, color });
  }


  function computeRecommendationsLayout(pdf) {
    const paddingX = 4;
    const maxTextW = contentWidth() - paddingX * 2;
    const lineH = 5.0;
    const bullets = [];


    if (recommendations?.remark) bullets.push(`Remark: ${recommendations.remark}`);
    if (Array.isArray(recommendations?.next_lessons) && recommendations.next_lessons.length)
      bullets.push(`Next Lessons: ${recommendations.next_lessons.join(", ")}`);
    if (Array.isArray(recommendations?.focus_areas) && recommendations.focus_areas.length)
      bullets.push(`Focus Areas: ${recommendations.focus_areas.join(", ")}`);
    if (!bullets.length) bullets.push("No recommendations yet.");


    let lines = [];
    bullets.forEach((b) => {
      const wrapped = pdf.splitTextToSize(b, maxTextW - 2);
      wrapped.forEach((ln, idx) => lines.push((idx === 0 ? "• " : "  ") + ln));
    });


    const headerH = 8;
    const bodyH = lines.length * lineH;
    const boxH = headerH + 4 + bodyH + 6;


    return { lines, lineH, boxH, paddingX };
  }


  function drawRecommendationsBox(pdf, layout, yTopOverride = null) {
    const { lines, lineH, boxH, paddingX } = layout;
    const x = PAGE.margin;
    const w = contentWidth();
    const yTop = yTopOverride ?? PAGE.h - PAGE.margin - boxH;


    pdf.setDrawColor(180);
    pdf.setFillColor(255, 255, 255);
    pdf.rect(x, yTop, w, boxH, "S");


    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11.5);
    pdf.text("RECOMMENDATIONS", x + 2.5, yTop + 5.8);


    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    let y = yTop + 11.2;
    lines.forEach((ln) => {
      pdf.text(ln, x + paddingX, y);
      y += lineH;
    });


    return yTop + boxH;
  }


  // ====================== TWO-PAGE LAYOUT ======================
  async function handleDownloadPDF() {
    if (!student) return;
    try {
      const pdf = new jsPDF("p", "mm", "a4");
      pdf.setLineJoin(2);
      pdf.setLineCap(2);


      const logoImg = new Image();
      logoImg.src = hmhIconBlue;
      await new Promise((r) => (logoImg.onload = r));


      // ===== PAGE 1 =====
      let y = await drawLetterheadAndBanner(pdf);
      y = drawCompactInfoTable(pdf, y);
      y = drawDivider(pdf, y);


      y = drawSectionHeader(pdf, "Summary Metrics", y);


      const left = PAGE.margin;
      const w = contentWidth();


      // Engagement (down 5px)
      const engagementEmpty = !(progress.engagement?.length > 0);
      const engagementH = engagementEmpty ? 50 : 78;
      y += 5;
      drawLineChart(
        pdf,
        left,
        y,
        w,
        engagementH,
        progress.engagement,
        { title: "Average Engagement per Session", key: "value" }
      );
      y += engagementH + 10;


      // Big gauges spanning full width (two equal columns)
      const gaugeGap = 8;
      const gaugeColW = (w - gaugeGap) / 2;
      const gaugeSide = Math.min(gaugeColW, 82);
      const gRowY = y + 6;


      const gx1 = left + (gaugeColW - gaugeSide) / 2;
      const gx2 = left + gaugeColW + gaugeGap + (gaugeColW - gaugeSide) / 2;


      drawGaugeSquareBox(pdf, gx1, gRowY, gaugeSide, overallSpeech, "Overall Speech Accuracy", [46, 75, 255]);
      drawGaugeSquareBox(pdf, gx2, gRowY, gaugeSide, overallEmotion, "Overall Emotion Mimic Accuracy", [255, 200, 74]);


      // ===== PAGE 2 =====
      pdf.addPage();
      let y2 = PAGE.margin;


      // SPEECH PERFORMANCE
      y2 = drawSectionHeader(pdf, "Speech Performance", y2);


      const colGap = 6;
      const equalW = (w - colGap) / 2;
      const speechH = 46;
      y2 += 5;


      drawBarChart(
        pdf,
        left,
        y2,
        equalW,
        speechH,
        progress.letter_accuracy,
        { title: "Accuracy per letter/word/activity", valueKey: "acc", labelKey: "label", fillRgb: [46, 75, 255] }
      );
      drawLineChart(
        pdf,
        left + equalW + colGap,
        y2,
        equalW,
        speechH,
        progress.speech,
        { title: "Pronunciation accuracy trend", key: "avg" }
      );


      // Mastered & Needs Practice
      const listTop = y2 + speechH + 8;
      const mastered = progress.mastered_words?.length ? progress.mastered_words : [];
      const np = progress.needs_practice_words?.length ? progress.needs_practice_words : [];
      const listH = (mastered.length || np.length) ? 60 : 42;
      drawTwoWordListsInOneBox_NoInnerBorders(pdf, left, listTop, w, listH, "Mastered", mastered, "Needs Practice", np);


      // divider
      const halfHeight = (PAGE.h - PAGE.margin * 2 - 8) / 2;
      const midY = PAGE.margin + halfHeight;
      pdf.setDrawColor(200);
      pdf.setLineWidth(0.8);
      pdf.line(PAGE.margin, midY, PAGE.w - PAGE.margin, midY);


      // EMOTION PERFORMANCE
      let y3 = midY + 6;
      y3 = drawSectionHeader(pdf, "Emotion Performance", y3);


      y3 += 5;
      const emoRowH = 46;


      drawHeatmap(
        pdf,
        left,
        y3,
        equalW,
        emoRowH,
        Array.isArray(progress.activity_heatmap?.[0]) ? progress.activity_heatmap : (progress.activity_heatmap?.length ? [progress.activity_heatmap] : [])
      );
      drawBarChart(
        pdf,
        left + equalW + colGap,
        y3,
        equalW,
        emoRowH,
        progress.emotion_breakdown,
        { title: "Emotion mimic accuracy per emotion", valueKey: "avg_match", labelKey: "emotion", fillRgb: [255, 200, 74] }
      );


      // Trend
      const afterRow1Gap = 8;
      const trendY = y3 + emoRowH + afterRow1Gap;


      const recLayout = computeRecommendationsLayout(pdf);
      const footerTop = PAGE.h - PAGE.margin - FOOTER_SAFE;
      const minTrendH = 22;
      let trendH = 34;


      const needed = (trendY + trendH + 6) + recLayout.boxH;
      if (needed > footerTop) {
        trendH = Math.max(minTrendH, trendH - (needed - footerTop));
      }


      drawLineChart(
        pdf,
        left,
        trendY,
        w,
        trendH,
        (progress.emotion_trend.length ? progress.emotion_trend : progress.emotion),
        { title: "Emotion mimic improvement trend", key: "avg" }
      );


      // Recommendations
      const recTop = footerTop - recLayout.boxH;
      drawRecommendationsBox(pdf, recLayout, recTop);


      // Footer on both pages
      drawFooter(pdf, logoImg);


      pdf.save(`${student?.last_name || "Report"}_Progress_Report.pdf`);
    } catch (e) {
      console.error("PDF error", e);
      alert("Failed to generate PDF. See console for details.");
    }
  }
  /* ======================= END PDF HELPERS ======================= */


  // ======================= SCREEN (unchanged) =======================
  return (
    <div className="min-h-[100dvh] bg-[#F6F7FB] flex lg:pl-64">
      {/* Sidebar */}
      <aside className="hidden lg:flex fixed top-0 left-0 h-screen w-64 bg-[#2E4bff] text-white px-6 py-8 flex flex-col justify-between shadow-lg">
        <div>
          <div className="flex flex-col items-center mb-8">
            <img src={hmhIcon} alt="HearMyHeart Icon" className="w-auto h-18 mb-3 object-contain" />
            <div className="text-2xl font-bold">HearMyHeart</div>
          </div>
          <SidebarLinks location={location} />
        </div>
        <div className="pt-2 border-t border-white/20 flex justify-center">
          <button
            className="p-3 rounded-full hover:bg-white/10"
            onClick={() => { auth.signout(); nav("/login"); }}
          >
            <FiLogOut className="text-2xl transform rotate-180" />
          </button>
        </div>
      </aside>


      {/* Main */}
      <main className="flex-1 px-6 md:px-12 lg:px-16 py-8 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => nav(`/teacher/student/${students_id}`)}
              className="p-2 rounded-xl bg-white border border-gray-300 hover:bg-gray-100 shadow-sm transition"
              title="Back to Info"
            >
              <FiArrowLeft className="text-xl text-[#2E4bff]" />
            </button>
            <h1 className="text-3xl font-bold text-[#111]">
              {student?.first_name} {student?.last_name}
            </h1>
          </div>
          <button
            onClick={handleDownloadPDF}
            className="p-4 rounded-full bg-[#2E4bff] text-white hover:brightness-110 transition"
            title="Download PDF"
          >
            <FiDownload className="text-xl" />
          </button>
        </div>


        {/* ---------- Wrapper (for screen only) ---------- */}
        <div id="reportSections">
          {/* ---------- Summary Metric Section (screen) ---------- */}
          <Section id="summarySection" title="Summary Metric Section" titlePx={17}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-10">
              <ChartCard title="Overall Speech Accuracy (%)" titleSize={CHART_FONT_PX}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    cx="50%" cy="55%" innerRadius="70%" outerRadius="100%"
                    data={[{ value: overallSpeech }]} startAngle={180} endAngle={0}
                  >
                    <RadialBar dataKey="value" fill={palette.blue} clockWise />
                    <text x="50%" y="60%" textAnchor="middle" className="fill-gray-800 font-bold" style={{ fontSize: CHART_FONT_PX }}>
                      {overallSpeech}%
                    </text>
                  </RadialBarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Overall Emotion Mimic Accuracy (%)" titleSize={CHART_FONT_PX}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    cx="50%" cy="55%" innerRadius="70%" outerRadius="100%"
                    data={[{ value: overallEmotion }]} startAngle={180} endAngle={0}
                  >
                    <RadialBar dataKey="value" fill={palette.yellow} clockWise />
                    <text x="50%" y="60%" textAnchor="middle" className="fill-gray-800 font-bold" style={{ fontSize: CHART_FONT_PX }}>
                      {overallEmotion}%
                    </text>
                  </RadialBarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Average Engagement per Session" titleSize={CHART_FONT_PX}>
                {progress.engagement.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={progress.engagement}>
                      <CartesianGrid stroke={palette.grayStroke} strokeDasharray="3 3" />
                      <XAxis hide tick={{ fontSize: CHART_FONT_PX }} />
                      <YAxis hide tick={{ fontSize: CHART_FONT_PX }} />
                      <Tooltip wrapperStyle={{ fontSize: CHART_FONT_PX }} />
                      <Line type="monotone" dataKey="value" stroke={palette.blue} strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState />
                )}
              </ChartCard>
            </div>
          </Section>


          {/* ---------- Speech Performance Section (screen) ---------- */}
          <Section id="speechSection" title="Speech Performance Section" titlePx={17}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ChartCard title="Accuracy per letter/word/activity" titleSize={CHART_FONT_PX}>
                {progress.letter_accuracy.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={progress.letter_accuracy}>
                      <CartesianGrid stroke={palette.grayStroke} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fill: palette.textGray, fontSize: CHART_FONT_PX }} />
                      <YAxis tick={{ fill: palette.textGray, fontSize: CHART_FONT_PX }} />
                      <Tooltip wrapperStyle={{ fontSize: CHART_FONT_PX }} />
                      <Bar dataKey="acc" barSize={36}>
                        {progress.letter_accuracy.map((_, i) => (<Cell key={i} fill={palette.blue} />))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (<EmptyState />)}
              </ChartCard>


              <ChartCard title="Pronunciation accuracy trend" titleSize={CHART_FONT_PX}>
                {progress.speech.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={progress.speech}>
                      <CartesianGrid stroke={palette.grayStroke} strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fill: palette.textGray, fontSize: CHART_FONT_PX }} />
                      <YAxis tick={{ fill: palette.textGray, fontSize: CHART_FONT_PX }} />
                      <Tooltip wrapperStyle={{ fontSize: CHART_FONT_PX }} />
                      <Line type="monotone" dataKey="avg" stroke={palette.blue} strokeWidth={3} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (<EmptyState />)}
              </ChartCard>
            </div>


            {/* Letters/words lists */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mt-5 mb-10">
              <div className="bg-[#2E4bff] text-white px-5 py-2 rounded-t-2xl font-semibold chart-title-bar" style={{ fontSize: CHART_FONT_PX }}>
                Letters/words mastered vs. needing practice
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <WordList title="Mastered" items={progress.mastered_words} badgeClass="bg-green-100 text-green-800 border border-green-200" fontPx={CHART_FONT_PX} />
                  <WordList title="Needs Practice" items={progress.needs_practice_words} badgeClass="bg-rose-100 text-rose-800 border border-rose-200" fontPx={CHART_FONT_PX} />
                </div>
              </div>
            </div>
          </Section>


          {/* ---------- Emotion Performance Section (screen) ---------- */}
          <Section id="emotionSection" title="Emotion Performance Section" titlePx={17}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <ChartCard title="Activity-level correctness" height="h-[360px]" titleSize={CHART_FONT_PX}>
                <HeatmapGrid data={progress.activity_heatmap} fontPx={CHART_FONT_PX} />
              </ChartCard>


              <ChartCard title="Emotion mimic accuracy per emotion" height="h-[360px]" titleSize={CHART_FONT_PX}>
                {progress.emotion_breakdown.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={progress.emotion_breakdown}>
                      <CartesianGrid stroke={palette.grayStroke} strokeDasharray="3 3" />
                      <XAxis dataKey="emotion" tick={{ fill: palette.textGray, fontSize: CHART_FONT_PX }} />
                      <YAxis tick={{ fill: palette.textGray, fontSize: CHART_FONT_PX }} />
                      <Tooltip wrapperStyle={{ fontSize: CHART_FONT_PX }} />
                      <Bar dataKey="avg_match" barSize={38}>
                        {progress.emotion_breakdown.map((_, i) => (<Cell key={i} fill={palette.yellow} />))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (<EmptyState />)}
              </ChartCard>


              <ChartCard title="Emotion mimic improvement trend" height="h-[360px]" titleSize={CHART_FONT_PX}>
                {(progress.emotion_trend.length || progress.emotion.length) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={progress.emotion_trend.length ? progress.emotion_trend : progress.emotion}>
                      <CartesianGrid stroke={palette.grayStroke} strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fill: palette.textGray, fontSize: CHART_FONT_PX }} />
                      <YAxis tick={{ fill: palette.textGray, fontSize: CHART_FONT_PX }} />
                      <Tooltip wrapperStyle={{ fontSize: CHART_FONT_PX }} />
                      <Line type="monotone" dataKey="avg" stroke={palette.yellow} strokeWidth={3} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (<EmptyState />)}
              </ChartCard>
            </div>
          </Section>
        </div>


        {/* ---------- Recommendations (screen) ---------- */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 mt-6">
          <h2 className="font-semibold mb-3 text-[#111]" style={{ fontSize: CHART_FONT_PX }}>Recommendations</h2>
          {recommendations ? (
            <ul className="list-disc pl-6 text-gray-700 space-y-1" style={{ fontSize: CHART_FONT_PX }}>
              <li>Suggested next lessons or activities: {recommendations.next_lessons?.length ? recommendations.next_lessons.join(", ") : "No data yet"}</li>
              <li>Areas to focus on for speech or emotion development: {recommendations.focus_areas?.length ? recommendations.focus_areas.join(", ") : "No data yet"}</li>
              <li>Overall remark: <span className="font-medium">{recommendations.remark || "No remark"}</span></li>
            </ul>
          ) : (
            <div className="text-gray-400 italic" style={{ fontSize: CHART_FONT_PX }}>No recommendations yet</div>
          )}
        </div>
      </main>
    </div>
  );
}


/* ---------- UI Helpers (screen) ---------- */
function Section({ id, title, children, titlePx = 11 }) {
  return (
    <section id={id} className="mt-2">
      <div className="px-5 py-2 rounded-2xl font-semibold section-title-bar" style={{ fontSize: titlePx }}>
        {title}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}


function ChartCard({ title, children, height = "h-[360px]", titleSize = 11 }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden ${height} lg:h-[23vw] xl:h-80`}>
      <div className="bg-[#2E4bff] text-white px-5 py-2 rounded-t-2xl font-semibold chart-title-bar" style={{ fontSize: titleSize }}>
        {title}
      </div>
      <div className="p-5 h-[calc(100%-40px)]">{children}</div>
    </div>
  );
}


function EmptyState() {
  return <div className="w-full h-full flex items-center justify-center text-gray-400 italic" style={{ fontSize: 11 }}>No data yet</div>;
}


function SidebarLinks({ location }) {
  return (
    <>
      <Link to="/teacher" className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 font-medium ${location.pathname === "/teacher" ? "bg-white text-[#2E4bff]" : "hover:bg-white/10"}`}>
        <GoHome className="text-xl" />
        <span>Dashboard</span>
      </Link>
      <Link to="/teacher/students" className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 font-medium ${location.pathname.startsWith("/teacher/students") || location.pathname.startsWith("/teacher/student") ? "bg-white text-[#2E4bff]" : "hover:bg-white/10"}`}>
        <PiStudentBold className="text-xl" />
        <span>Students</span>
      </Link>
      <Link to="/teacher/analytics" className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 font-medium ${location.pathname.startsWith("/teacher/analytics") ? "bg-white text-[#2E4bff]" : "hover:bg-white/10"}`}>
        <SiGoogleanalytics className="text-xl" />
        <span>Analytics</span>
      </Link>
    </>
  );
}


function WordList({ title, items, badgeClass, fontPx = 11, maxVisible = 5 }) {
  const rowHeightPx = 34;
  const maxHeightPx = maxVisible * rowHeightPx;


  return (
    <div>
      <div className="font-semibold mb-2" style={{ fontSize: fontPx }}>{title}</div>
      {items?.length ? (
        <div className="flex flex-col gap-2 pr-1" style={{ maxHeight: items.length > maxVisible ? `${maxHeightPx}px` : "none", overflowY: items.length > maxVisible ? "auto" : "visible" }}>
          {items.map((w, i) => (
            <div key={i} className="flex items-center">
              <span className={`px-2 py-1 text-xs rounded-full ${badgeClass} word-chip`} style={{ fontSize: 10, whiteSpace: "nowrap" }} title={w}>
                {w}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-gray-400 italic" style={{ fontSize: fontPx }}>No data yet</div>
      )}
    </div>
  );
}


function HeatmapGrid({ data, fontPx = 11 }) {
  const rows = Array.isArray(data?.[0]) ? data : data?.length ? [data] : [];
  if (!rows.length) return <EmptyState />;
  const cols = Math.max(...rows.map((r) => r.length));
  return (
    <div className="w-full h-full overflow-auto">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {rows.map((r, ri) =>
          r.map((cell, ci) => {
            const acc = cell?.acc ?? cell?.accuracy ?? 0;
            const g = Math.round(255 * (acc / 100));
            const rC = Math.round(255 * (1 - acc / 100));
            const bg = `rgb(${rC}, ${g}, 80)`;
            return (
              <div
                key={`${ri}-${ci}`}
                className="h-10 rounded-md border border-white/40 flex items-center justify-center font-medium"
                style={{ backgroundColor: bg, color: "#111", opacity: 0.95, fontSize: fontPx - 1 }}
                title={`${cell?.label ?? ""} • ${Math.round(acc)}%`}
              >
                {Math.round(acc)}%
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}


function accToColor(acc) {
  const a = Math.max(0, Math.min(100, acc ?? 0));
  const r = a < 50 ? 255 : Math.floor(255 - (a - 50) * 5.1);
  const g = a > 50 ? 255 : Math.floor(a * 5.1);
  const b = 200 - Math.floor(a * 1.0);
  return `rgb(${r}, ${g}, ${b})`;
}
