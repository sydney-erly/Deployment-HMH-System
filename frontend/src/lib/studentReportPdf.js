// src/lib/studentReportPdf.js
// updated 11/14/2025
import jsPDF from "jspdf";
import hmhIconBlue from "../assets/hmh_icon_blue.png";


/* ========================= CONSTANTS ========================= */
const PAGE = { w: 210, h: 297, margin: 16 };
const FOOTER_H = 12;
const GAP = 8;
const LINE_H = 5;


const contentWidth = () => PAGE.w - PAGE.margin * 2;
const contentBottom = () => PAGE.h - PAGE.margin - FOOTER_H;


/* ========================= COLORS ========================= */
const COLORS = {
  primary: [14, 48, 72],
  secondary: [46, 75, 255],
  accent: [255, 200, 74],
  border: [220, 220, 220],
  textLight: [120, 120, 120],
  gridLine: [240, 240, 240],
  background: [250, 250, 250]
};


/* ========================= UTILITIES ========================= */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const norm = (v, min, max) => (max === min ? 0 : (v - min) / (max - min));


// robust getter for numbers across shapes: {avg}, {value}, {acc}, or custom key
const getNum = (d, key) => {
  if (key != null && d?.[key] != null) return Number(d[key]);
  if (d?.value != null) return Number(d.value);
  if (d?.avg != null) return Number(d.avg);
  if (d?.acc != null) return Number(d.acc);
  return 0;
};


function niceRange(values, fallbackMax = 100) {
  if (!values?.length) return { min: 0, max: fallbackMax };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) return { min: 0, max: max || fallbackMax };
  const pad = 0.1 * (max - min);
  return { min: Math.max(0, min - pad), max: max + pad };
}


function ensureSpace(pdf, y, needed) {
  if (y + needed <= contentBottom()) return y;
  pdf.addPage();
  return PAGE.margin;
}


/* ========================= HEADER & FOOTER ========================= */
async function drawLetterhead(pdf) {
  const cx = PAGE.w / 2;


  pdf.setFont("times", "bold");
  pdf.setFontSize(20);
  pdf.text("Hope Intervention Center", cx, 18, { align: "center" });


  pdf.setFont("times", "italic");
  pdf.setFontSize(11);
  pdf.text("A center for Autistic and Mentally Challenged Children", cx, 24, { align: "center" });


  pdf.setDrawColor(...COLORS.textLight);
  pdf.setLineWidth(0.5);
  pdf.line(PAGE.margin, 28, PAGE.w - PAGE.margin, 28);


  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("City of Calamba, Laguna, Philippines 4027 | Tel. (049) 545-4235", cx, 33, { align: "center" });


  const bannerY = 40;
  pdf.setFillColor(...COLORS.primary);
  pdf.rect(PAGE.margin, bannerY, contentWidth(), 12, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text(
    "STUDENT PROGRESS REPORT IN SPEECH AND EMOTIONAL DEVELOPMENT",
    cx,
    bannerY + 8,
    { align: "center" }
  );
  pdf.setTextColor(0, 0, 0);


  return bannerY + 18;
}


function drawFooter(pdf, logoImg) {
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    const y = PAGE.h - 9;


    try {
      pdf.addImage(logoImg, "PNG", PAGE.margin, y - 5, 6, 6, undefined, "FAST");
    } catch {}


    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(25, 25, 25);
    pdf.text("HearMyHeart", PAGE.margin + 8, y);


    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...COLORS.textLight);
    pdf.text(`Page ${i} of ${total}`, PAGE.w - PAGE.margin, y, { align: "right" });
    pdf.setTextColor(0, 0, 0);
  }
}


/* ========================= STUDENT INFO CARD ========================= */
function drawStudentInfo(pdf, y, student) {
  const x = PAGE.margin;
  const w = contentWidth();
  const cardH = 50;


  // Card background
  pdf.setFillColor(...COLORS.background);
  pdf.roundedRect(x, y, w, cardH, 2, 2, "F");
  pdf.setDrawColor(...COLORS.border);
  pdf.roundedRect(x, y, w, cardH, 2, 2, "S");


  // Title
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(...COLORS.primary);
  pdf.text("STUDENT INFORMATION", x + 4, y + 7);
  pdf.setTextColor(0, 0, 0);


  // Info grid
  const startY = y + 14;
  const colW = w / 4;
  const rowH = 12;


  const reportDate = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric"
  });


  const fields = [
    ["Student Name", `${student?.first_name ?? ""} ${student?.last_name ?? ""}`.trim() || "—"],
    ["Speech Level", student?.speech_level ?? "—"],
    ["Diagnosis", student?.diagnosis ?? "—"],
    ["Room", student?.room_assignment ?? "—"],
    ["Mother's Name", student?.mother_name ?? "—"],
    ["Father's Name", student?.father_name ?? "—"],
    ["Report Date", reportDate],
    ["Student ID", student?.login_id || student?.students_id || "—"]
  ];


  pdf.setFont("helvetica", "normal");
  fields.forEach((field, idx) => {
    const col = idx % 4;
    const row = Math.floor(idx / 4);
    const fx = x + 4 + col * colW;
    const fy = startY + row * rowH;


    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.textLight);
    pdf.text(field[0], fx, fy);


    pdf.setFontSize(9);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont("helvetica", "bold");
    pdf.text(String(field[1]), fx, fy + 5, { maxWidth: colW - 8 });
    pdf.setFont("helvetica", "normal");
  });


  return y + cardH + GAP * 1.5;
}


/* ========================= SECTION HEADER ========================= */
function drawSectionTitle(pdf, y, title) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(...COLORS.primary);
  pdf.text(title, PAGE.margin, y);
  pdf.setTextColor(0, 0, 0);


  pdf.setDrawColor(...COLORS.secondary);
  pdf.setLineWidth(1);
  pdf.line(PAGE.margin, y + 2, PAGE.margin + 30, y + 2);


  return y + 8;
}


/* ========================= METRIC CARDS ========================= */
function drawMetricCard(pdf, x, y, w, h, title, value, unit = "%", color) {
  // Card
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(x, y, w, h, 2, 2, "F");
  pdf.setDrawColor(...COLORS.border);
  pdf.roundedRect(x, y, w, h, 2, 2, "S");


  // Color accent bar
  pdf.setFillColor(...color);
  pdf.roundedRect(x, y, w, 4, 2, 2, "F");


  // Value
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(32);
  pdf.setTextColor(...color);
  pdf.text(`${Math.round(value)}${unit}`, x + w / 2, y + h / 2 + 4, { align: "center" });


  // Title
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...COLORS.textLight);
  pdf.text(title, x + w / 2, y + h - 6, { align: "center", maxWidth: w - 8 });
  pdf.setTextColor(0, 0, 0);
}


/* ========================= LINE CHART ========================= */
function drawLineChart(pdf, x, y, w, h, data, opts = {}) {
  const arr = Array.isArray(data) ? data : [];
  const vals = arr.map(d => getNum(d, opts.key));
  const hasData = vals.some(v => v > 0) && vals.length >= 1; // allow single point


  // Card
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(x, y, w, h, 2, 2, "F");
  pdf.setDrawColor(...COLORS.border);
  pdf.roundedRect(x, y, w, h, 2, 2, "S");


  // Title
  if (opts.title) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(opts.title, x + 4, y + 7);
  }


  if (!hasData) {
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(10);
    pdf.setTextColor(...COLORS.textLight);
    pdf.text("No data available", x + w / 2, y + h / 2, { align: "center" });
    pdf.setTextColor(0, 0, 0);
    return;
  }


  // Chart area
  const pad = 12;
  const chartX = x + pad;
  const chartY = y + 18;
  const chartW = w - pad * 2;
  const chartH = h - 28;


  let { min, max } = niceRange(vals, 100);
  min = Math.max(0, min);
  if (max === min) max = min + 1;


  // Grid lines
  pdf.setDrawColor(...COLORS.gridLine);
  pdf.setLineWidth(0.3);
  for (let i = 0; i <= 4; i++) {
    const gy = chartY + chartH - (i * chartH / 4);
    pdf.line(chartX, gy, chartX + chartW, gy);
  }


  // Y-axis labels
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...COLORS.textLight);
  pdf.text(String(Math.round(max)), chartX - 3, chartY + 2, { align: "right" });
  pdf.text(String(Math.round(min)), chartX - 3, chartY + chartH + 2, { align: "right" });


  // Line
  const col = opts.color ?? COLORS.secondary;
  pdf.setDrawColor(...col);
  pdf.setLineWidth(2);
  pdf.setLineCap(2);


  for (let i = 1; i < vals.length; i++) {
    const x1 = chartX + ((i - 1) / (vals.length - 1)) * chartW;
    const x2 = chartX + (i / (vals.length - 1)) * chartW;
    const y1 = chartY + chartH - norm(clamp(vals[i - 1], min, max), min, max) * chartH;
    const y2 = chartY + chartH - norm(clamp(vals[i],     min, max), min, max) * chartH;
    pdf.line(x1, y1, x2, y2);
  }


  // Points (also shows for a single sample)
  pdf.setFillColor(...col);
  vals.forEach((v, i) => {
    const px = chartX + (i / Math.max(1, vals.length - 1)) * chartW;
    const py = chartY + chartH - norm(clamp(v, min, max), min, max) * chartH;
    pdf.circle(px, py, 1.5, "F");
  });


  pdf.setTextColor(0, 0, 0);
}


/* ========================= BAR CHART ========================= */
function drawBarChart(pdf, x, y, w, h, data, opts = {}) {
  const arr = Array.isArray(data) ? data : [];
  const vals = arr.map(d => getNum(d, opts.valueKey));
  const hasData = vals.some(v => v > 0);


  // Card
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(x, y, w, h, 2, 2, "F");
  pdf.setDrawColor(...COLORS.border);
  pdf.roundedRect(x, y, w, h, 2, 2, "S");


  // Title
  if (opts.title) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(opts.title, x + 4, y + 7);
  }


  if (!hasData) {
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(10);
    pdf.setTextColor(...COLORS.textLight);
    pdf.text("No data available", x + w / 2, y + h / 2, { align: "center" });
    pdf.setTextColor(0, 0, 0);
    return;
  }


  // Chart area (extra left padding for Y-axis labels)
  const padLeft = 18;
  const padRight = 10;
  const chartX = x + padLeft;
  const chartY = y + 18;
  const chartW = w - padLeft - padRight;
  const chartH = h - 32;


  let { min, max } = niceRange(vals, 100);
  min = Math.max(0, min);
  // snap max to a clean step (25s) for nicer ticks; cap to 100 when looks like % data
  const looksPercent = max <= 110;
  const step = looksPercent ? 25 : Math.max(5, Math.round((max - min) / 4));
  max = looksPercent ? 100 : Math.ceil(max / step) * step;


  // Grid + Y labels
  pdf.setDrawColor(...COLORS.gridLine);
  pdf.setLineWidth(0.3);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...COLORS.textLight);


  for (let i = 0; i <= 4; i++) {
    const gy = chartY + chartH - (i * chartH / 4);
    pdf.line(chartX, gy, chartX + chartW, gy);
    const label = Math.round(min + (i * (max - min) / 4));
    pdf.text(String(label), chartX - 4, gy + 2, { align: "right" });
  }
  pdf.setTextColor(0, 0, 0);


  // Bars
  const barGap = 4;
  const barW = Math.max(4, chartW / Math.max(1, arr.length) - barGap);


  const [r, g, b] = (opts.color ?? COLORS.secondary);
  pdf.setFillColor(r, g, b);
  arr.forEach((d, i) => {
    const v = getNum(d, opts.valueKey);
    if (v <= 0) return;
    const bx = chartX + i * (barW + barGap);
    const bh = norm(clamp(v, min, max), 0, max) * chartH;
    pdf.roundedRect(bx, chartY + chartH - bh, barW, bh, 1, 1, "F");
  });


  // X labels
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(...COLORS.textLight);
  const labelKey = opts.labelKey ?? "label";
  arr.forEach((d, i) => {
    const label = String(d?.[labelKey] ?? d?.emotion ?? "").slice(0, 10);
    const lx = chartX + i * (barW + barGap) + barW / 2;
    pdf.text(label, lx, chartY + chartH + 7, { align: "center" });
  });
  pdf.setTextColor(0, 0, 0);
}


/* ========================= WORDS MASTERY ========================= */
function drawWordsMastery(pdf, y, mastered, needs) {
  const x = PAGE.margin;
  const w = contentWidth();
  const cardH = 70;


  y = ensureSpace(pdf, y, cardH);


  // Card
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(x, y, w, cardH, 2, 2, "F");
  pdf.setDrawColor(...COLORS.border);
  pdf.roundedRect(x, y, w, cardH, 2, 2, "S");


  // Title
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("Words Mastery", x + 4, y + 7);


  const colGap = 12;
  const colW = (w - colGap - 8) / 2;
  const col1X = x + 4;
  const col2X = x + 4 + colW + colGap;
  const contentY = y + 15;


  // Column headers
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(...COLORS.secondary);
  pdf.text("Mastered", col1X, contentY);
  pdf.setTextColor(...COLORS.accent);
  pdf.text("Needs Practice", col2X, contentY);
  pdf.setTextColor(0, 0, 0);


  // Divider
  pdf.setDrawColor(...COLORS.border);
  pdf.line(x + w / 2, contentY + 4, x + w / 2, y + cardH - 4);


  const hasData = (mastered?.length > 0) || (needs?.length > 0);


  if (!hasData) {
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(10);
    pdf.setTextColor(...COLORS.textLight);
    pdf.text("No data available", x + w / 2, y + cardH / 2 + 6, { align: "center" });
    pdf.setTextColor(0, 0, 0);
    return y + cardH + GAP;
  }


  // Words list
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);


  let y1 = contentY + 8;
  (mastered ?? []).slice(0, 8).forEach(word => {
    pdf.text(`• ${word}`, col1X + 2, y1, { maxWidth: colW - 4 });
    y1 += LINE_H;
  });


  let y2 = contentY + 8;
  (needs ?? []).slice(0, 8).forEach(word => {
    pdf.text(`• ${word}`, col2X + 2, y2, { maxWidth: colW - 4 });
    y2 += LINE_H;
  });


  return y + cardH + GAP;
}


/* ========================= RECOMMENDATIONS ========================= */
function drawRecommendations(pdf, y, recommendations) {
  const x = PAGE.margin;
  const w = contentWidth();


  const bullets = [];
  if (recommendations?.remark) bullets.push(`Remark: ${recommendations.remark}`);
  if (recommendations?.next_lessons?.length) bullets.push(`Next Lessons: ${recommendations.next_lessons.join(", ")}`);
  if (recommendations?.focus_areas?.length) bullets.push(`Focus Areas: ${recommendations.focus_areas.join(", ")}`);


  const hasData = bullets.length > 0;
  const cardH = hasData ? Math.max(40, bullets.length * 12 + 20) : 40;


  y = ensureSpace(pdf, y, cardH);


  // Card
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(x, y, w, cardH, 2, 2, "F");
  pdf.setDrawColor(...COLORS.border);
  pdf.roundedRect(x, y, w, cardH, 2, 2, "S");


  // Title
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("Recommendations", x + 4, y + 7);


  if (!hasData) {
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(10);
    pdf.setTextColor(...COLORS.textLight);
    pdf.text("No recommendations yet", x + w / 2, y + cardH / 2, { align: "center" });
    pdf.setTextColor(0, 0, 0);
    return y + cardH + GAP;
  }


  // Bullets
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  let by = y + 18;


  bullets.forEach(bullet => {
    const lines = pdf.splitTextToSize(`• ${bullet}`, w - 12);
    lines.forEach(line => {
      pdf.text(line, x + 6, by);
      by += LINE_H;
    });
  });


  return y + cardH + GAP;
}


/* ========================= MAIN EXPORT ========================= */
export async function generateStudentReportPdf({ student, progress, recommendations }) {
  if (!student) throw new Error("Missing student");


  const pdf = new jsPDF("p", "mm", "a4");


  const logoImg = new Image();
  logoImg.src = hmhIconBlue;
  await new Promise(r => (logoImg.onload = r));


  // Calculate metrics
  const speechArr = (progress?.speech ?? []).map(d => getNum(d, "avg"));
  const overallSpeech = speechArr.length
    ? speechArr.reduce((a, b) => a + b, 0) / speechArr.length
    : 0;


  const emoSrc = (progress?.emotion_trend?.length ? progress.emotion_trend : (progress?.emotion ?? []));
  const emoArr = emoSrc.map(d => getNum(d, "avg"));
  const overallEmotion = emoArr.length
    ? emoArr.reduce((a, b) => a + b, 0) / emoArr.length
    : 0;


  // Layout
  let y = await drawLetterhead(pdf);
  y = drawStudentInfo(pdf, y, student);


  // Summary Metrics Section
  y = drawSectionTitle(pdf, y, "Summary Metrics");


  const cardW = (contentWidth() - GAP * 2) / 3;
  const cardH = 45;


  drawMetricCard(pdf, PAGE.margin, y, cardW, cardH, "Overall Speech Accuracy", overallSpeech, "%", COLORS.secondary);


  drawMetricCard(pdf, PAGE.margin + cardW + GAP, y, cardW, cardH, "Overall Emotion Accuracy", overallEmotion, "%", COLORS.accent);


  const engageVals = (progress?.engagement ?? []).map(d => getNum(d, "value"));
  const engagementAvg = engageVals.length ? (engageVals.reduce((a,b)=>a+b,0) / engageVals.length) : 0;


  drawMetricCard(pdf, PAGE.margin + 2 * cardW + 2 * GAP, y, cardW, cardH, "Avg Session (min)", engagementAvg, "", [100, 200, 100]);


  y += cardH + GAP * 1.5;


  // Performance Trends
  y = ensureSpace(pdf, y, 60);
  y = drawSectionTitle(pdf, y, "Performance Trends");


  const chartW = (contentWidth() - GAP) / 2;
  const chartH = 55;


  drawLineChart(pdf, PAGE.margin, y, chartW, chartH, progress?.speech ?? [], { title: "Speech Accuracy Over Time", key: "avg", color: COLORS.secondary });


  drawLineChart(pdf, PAGE.margin + chartW + GAP, y, chartW, chartH, emoSrc, { title: "Emotion Accuracy Over Time", key: "avg", color: COLORS.accent });


  y += chartH + GAP * 1.5;


  // Detailed Performance
  y = ensureSpace(pdf, y, 60);
  y = drawSectionTitle(pdf, y, "Detailed Performance");


  drawBarChart(pdf, PAGE.margin, y, chartW, chartH, progress?.letter_accuracy ?? [], {
    title: "Letter/Word Accuracy",
    valueKey: "acc",
    labelKey: "label",
    color: COLORS.secondary
  });


  drawBarChart(pdf, PAGE.margin + chartW + GAP, y, chartW, chartH, progress?.emotion_breakdown ?? [], {
    title: "Emotion Mimicked",
    valueKey: "avg_match",
    labelKey: "emotion",
    color: COLORS.accent
  });


  y += chartH + GAP * 1.5;


  // Words Mastery
  y = drawSectionTitle(pdf, y, "Learning Progress");
  y = drawWordsMastery(pdf, y, progress?.mastered_words ?? [], progress?.needs_practice_words ?? []);


  // Recommendations
  y = drawSectionTitle(pdf, y, "Recommendations & Next Steps");
  y = drawRecommendations(pdf, y, recommendations);


  // Footer
  drawFooter(pdf, logoImg);


  const filename = `${student?.last_name || "Student"}_Progress_Report.pdf`;
  pdf.save(filename);
}


export default generateStudentReportPdf;







