import ExcelJS from "exceljs";
import {
  groupByWeek,
  type ProgramMeta,
  type ProgramRow,
} from "@/lib/programQuery";

/**
 * Builds the .xlsx you actually take to the gym: one tab per training week,
 * blank weight/reps columns to fill in between sets, and a Maxes tab whose
 * numbers drive every percentage-based prescription in the block.
 */

/** How many blank set-logging column pairs to draw, regardless of prescription. */
const MAX_LOG_SETS = 6;

/** Training max convention — percentages in most programs are of ~90% of a true 1RM. */
const TRAINING_MAX_FACTOR = 0.9;

const HEADER_FILL = "FF1C2129";
const DAY_FILL = "FF2A313B";
const ACCENT = "FFF97316";

/**
 * Excel defined names can't contain spaces or punctuation, can't start with a
 * digit, and must not look like a cell reference. Prefixing with TM_ handles
 * the last two cases for free.
 */
export function definedNameFor(exerciseName: string): string {
  const cleaned = exerciseName
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `TM_${cleaned}`;
}

/** The prescription as a human reads it: "3 × 8-12 @ RPE 8". */
export function prescriptionText(row: {
  sets: number;
  reps: string;
  intensityType: string;
  intensityValue: string | null;
}): string {
  const base = `${row.sets} × ${row.reps}`;
  if (!row.intensityValue || row.intensityType === "none") return base;
  const suffix =
    row.intensityType === "percent_1rm"
      ? `${row.intensityValue}% 1RM`
      : row.intensityType === "weight"
        ? `${row.intensityValue} kg`
        : `${row.intensityType.toUpperCase()} ${row.intensityValue}`;
  return `${base} @ ${suffix}`;
}

/**
 * Which lifts get a row on the Maxes tab. Percentage-prescribed lifts *must*
 * be there — their target formulas reference it. Compound barbell lifts are
 * included too because those are the numbers people actually track.
 */
export function maxesLifts(rows: ProgramRow[]) {
  const byName = new Map<string, { name: string; needsFormula: boolean }>();
  for (const row of rows) {
    const needsFormula = row.intensityType === "percent_1rm";
    const isTrackable =
      row.isCompound &&
      (row.equipment === "barbell" || row.equipment === "smith");
    if (!needsFormula && !isTrackable) continue;
    const existing = byName.get(row.exerciseName);
    byName.set(row.exerciseName, {
      name: row.exerciseName,
      needsFormula: needsFormula || existing?.needsFormula || false,
    });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Excel caps tab names at 31 characters, which chops descriptive week labels
 * mid-word ("Week 1 - 5s week (BBB 5x10 @ 50"). Tabs get a short, always-valid
 * name; the full label goes in the sheet's title row where it has room.
 */
export function weekSheetName(weekNumber: number, taken: Set<string>): string {
  const base = `Week ${weekNumber}`;
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  let n = 2;
  while (taken.has(`${base} (${n})`)) n++;
  const name = `${base} (${n})`;
  taken.add(name);
  return name;
}

export function buildProgramWorkbook(
  program: ProgramMeta,
  rows: ProgramRow[],
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Iron Atlas";
  wb.title = program.title;

  const lifts = maxesLifts(rows);
  const liftRowByName = new Map<string, number>();

  /* ---------------------------------------------------------------- Maxes */
  const maxes = wb.addWorksheet("Maxes", {
    views: [{ state: "frozen", ySplit: 3 }],
  });
  maxes.columns = [
    { key: "lift", width: 34 },
    { key: "oneRm", width: 14 },
    { key: "trainingMax", width: 16 },
  ];

  maxes.mergeCells("A1:C1");
  const maxesTitle = maxes.getCell("A1");
  maxesTitle.value = "Your maxes";
  maxesTitle.font = { bold: true, size: 14 };

  maxes.mergeCells("A2:C2");
  const maxesHelp = maxes.getCell("A2");
  maxesHelp.value =
    "Enter your current 1RM in column B. Training Max is 90% of it, and every % prescription in this workbook is calculated from Training Max.";
  maxesHelp.font = { italic: true, size: 10 };
  maxesHelp.alignment = { wrapText: true, vertical: "top" };
  maxes.getRow(2).height = 28;

  const maxesHeader = maxes.getRow(3);
  maxesHeader.values = ["Lift", "1RM", "Training Max"];
  maxesHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
  maxesHeader.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
  });

  lifts.forEach((lift, i) => {
    const rowNumber = 4 + i;
    const row = maxes.getRow(rowNumber);
    row.getCell(1).value = lift.name;
    row.getCell(2).value = null; // the user fills this in
    row.getCell(2).numFmt = "0.0";
    row.getCell(2).border = { bottom: { style: "hair" } };
    row.getCell(3).value = {
      formula: `ROUND(B${rowNumber}*${TRAINING_MAX_FACTOR},1)`,
    };
    row.getCell(3).numFmt = "0.0";
    liftRowByName.set(lift.name, rowNumber);

    // Named range on the Training Max cell, so week sheets can reference the
    // lift by name instead of a fragile row offset.
    wb.definedNames.add(`Maxes!$C$${rowNumber}`, definedNameFor(lift.name));
  });

  if (lifts.length === 0) {
    maxes.getCell("A4").value =
      "This program prescribes no percentage-based lifts.";
    maxes.getCell("A4").font = { italic: true };
  }

  /* ---------------------------------------------------------------- Weeks */
  const weeks = groupByWeek(rows);
  const takenSheetNames = new Set<string>();

  for (const week of weeks.values()) {
    const label = week.meta.weekLabel ?? `Week ${week.meta.weekNumber}`;
    const sheet = wb.addWorksheet(
      weekSheetName(week.meta.weekNumber, takenSheetNames),
      {
        views: [{ state: "frozen", xSplit: 2, ySplit: 2 }],
      },
    );

    const logHeaders: string[] = [];
    for (let i = 1; i <= MAX_LOG_SETS; i++)
      logHeaders.push(`S${i} kg`, `S${i} reps`);

    sheet.columns = [
      { key: "day", width: 20 },
      { key: "exercise", width: 30 },
      { key: "sets", width: 6 },
      { key: "reps", width: 10 },
      { key: "intensity", width: 13 },
      { key: "target", width: 11 },
      { key: "rest", width: 9 },
      { key: "notes", width: 40 },
      ...logHeaders.map((h) => ({ key: h, width: 9 })),
    ];

    sheet.mergeCells(1, 1, 1, 8 + logHeaders.length);
    const title = sheet.getCell("A1");
    const repeatNote =
      week.meta.repeatCount > 1
        ? ` — repeat for ${week.meta.repeatCount} weeks`
        : "";
    title.value = `${program.title} — ${label}${repeatNote}`;
    title.font = { bold: true, size: 13 };

    const header = sheet.getRow(2);
    header.values = [
      "Day",
      "Exercise",
      "Sets",
      "Reps",
      "Intensity",
      "Target kg",
      "Rest (s)",
      "Notes",
      ...logHeaders,
    ];
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: HEADER_FILL },
      };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    header.height = 22;

    let cursor = 3;

    for (const day of week.days.values()) {
      // A banner row per training day — this is what makes the sheet scannable
      // at the gym rather than one undifferentiated wall of rows.
      const dayRow = sheet.getRow(cursor);
      sheet.mergeCells(cursor, 1, cursor, 8 + logHeaders.length);
      const dayCell = dayRow.getCell(1);
      dayCell.value = day.meta.dayNotes
        ? `${day.meta.dayName} — ${day.meta.dayNotes}`
        : day.meta.dayName;
      dayCell.font = { bold: true, color: { argb: ACCENT } };
      dayCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: DAY_FILL },
      };
      cursor++;

      for (const item of day.items) {
        const row = sheet.getRow(cursor);
        row.getCell(1).value = day.meta.dayName;
        row.getCell(2).value = item.supersetGroup
          ? `${item.supersetGroup}. ${item.exerciseName}`
          : item.exerciseName;
        row.getCell(3).value = item.sets;
        row.getCell(4).value = item.reps;

        if (item.intensityValue && item.intensityType !== "none") {
          row.getCell(5).value =
            item.intensityType === "percent_1rm"
              ? `${item.intensityValue}%`
              : item.intensityType === "weight"
                ? `${item.intensityValue} kg`
                : `${item.intensityType.toUpperCase()} ${item.intensityValue}`;
        }

        // Percentage prescriptions become a live formula off the Maxes tab, so
        // filling in one 1RM populates every working weight in the block.
        const percent = Number(item.intensityValue);
        if (
          item.intensityType === "percent_1rm" &&
          Number.isFinite(percent) &&
          liftRowByName.has(item.exerciseName)
        ) {
          row.getCell(6).value = {
            formula: `ROUND(${definedNameFor(item.exerciseName)}*${percent / 100},1)`,
          };
          row.getCell(6).numFmt = "0.0";
        }

        if (item.restSeconds != null) row.getCell(7).value = item.restSeconds;
        if (item.exNotes) {
          row.getCell(8).value = item.exNotes;
          row.getCell(8).alignment = { wrapText: true, vertical: "top" };
        }

        // Blank, lightly-ruled cells for the numbers you write between sets.
        for (let i = 0; i < MAX_LOG_SETS * 2; i++) {
          const cell = row.getCell(9 + i);
          cell.border = { bottom: { style: "hair" }, right: { style: "hair" } };
        }

        cursor++;
      }

      cursor++; // blank spacer row between days
    }

    if (week.meta.weekNotes) {
      const notesRow = sheet.getRow(cursor + 1);
      sheet.mergeCells(cursor + 1, 1, cursor + 1, 8);
      notesRow.getCell(1).value = `Week notes: ${week.meta.weekNotes}`;
      notesRow.getCell(1).font = { italic: true };
      notesRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
    }
  }

  /* ---------------------------------------------------------------- About */
  const about = wb.addWorksheet("About");
  about.columns = [
    { key: "field", width: 22 },
    { key: "value", width: 90 },
  ];

  const facts: [string, string][] = [
    ["Program", program.title],
    ["Author", program.authorName],
    ["Goal", program.goal.replace(/_/g, " ")],
    ["Experience", program.experienceLevel],
    ["Schedule", `${program.daysPerWeek} days/week for ${program.weeks} weeks`],
    ["Split", program.splitType],
    ["Progression", program.progression.replace(/_/g, " ")],
    ["Equipment", program.equipmentRequired.join(", ")],
  ];

  facts.forEach(([field, value], i) => {
    const row = about.getRow(i + 1);
    row.getCell(1).value = field;
    row.getCell(1).font = { bold: true };
    row.getCell(2).value = value;
  });

  let aboutCursor = facts.length + 2;

  const summaryCell = about.getCell(`A${aboutCursor}`);
  summaryCell.value = program.summary;
  about.mergeCells(aboutCursor, 1, aboutCursor, 2);
  summaryCell.alignment = { wrapText: true, vertical: "top" };
  about.getRow(aboutCursor).height = 32;
  aboutCursor += 2;

  // The provenance disclaimer travels with the file. Someone who is handed this
  // spreadsheet never saw the badge in the web UI.
  if (program.aiGenerated && !program.verified) {
    const warn = about.getCell(`A${aboutCursor}`);
    about.mergeCells(aboutCursor, 1, aboutCursor, 2);
    warn.value =
      `RECONSTRUCTED, NOT TRANSCRIBED — this program was rebuilt by an AI from its knowledge of ` +
      `${program.authorName}'s work. The structure and intent should be right; specific set and rep ` +
      `numbers may not match the published original. Check it against the source before running it.`;
    warn.font = { bold: true, color: { argb: "FFB45309" } };
    warn.alignment = { wrapText: true, vertical: "top" };
    about.getRow(aboutCursor).height = 46;
    aboutCursor += 2;
  }

  if (program.sourceUrls.length > 0) {
    about.getCell(`A${aboutCursor}`).value = "Sources";
    about.getCell(`A${aboutCursor}`).font = { bold: true };
    aboutCursor++;
    for (const url of program.sourceUrls) {
      about.getCell(`A${aboutCursor}`).value = { text: url, hyperlink: url };
      about.getCell(`A${aboutCursor}`).font = {
        color: { argb: "FF0563C1" },
        underline: true,
      };
      aboutCursor++;
    }
    aboutCursor++;
  }

  about.getCell(`A${aboutCursor}`).value = "Exported";
  about.getCell(`A${aboutCursor}`).font = { bold: true };
  about.getCell(`B${aboutCursor}`).value = new Date();
  about.getCell(`B${aboutCursor}`).numFmt = "yyyy-mm-dd hh:mm";

  return wb;
}

/** Flat CSV of the whole block — for pasting into Sheets or a text editor. */
export function buildProgramCsv(
  program: ProgramMeta,
  rows: ProgramRow[],
): string {
  const escape = (v: string | number | null) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [
    [
      "Week",
      "Day",
      "Exercise",
      "Sets",
      "Reps",
      "Intensity",
      "Rest (s)",
      "Notes",
    ]
      .map(escape)
      .join(","),
  ];

  for (const week of groupByWeek(rows).values()) {
    const label = week.meta.weekLabel ?? `Week ${week.meta.weekNumber}`;
    for (const day of week.days.values()) {
      for (const item of day.items) {
        lines.push(
          [
            label,
            day.meta.dayName,
            item.supersetGroup
              ? `${item.supersetGroup}. ${item.exerciseName}`
              : item.exerciseName,
            item.sets,
            item.reps,
            item.intensityValue && item.intensityType !== "none"
              ? (prescriptionText(item).split("@")[1]?.trim() ?? "")
              : "",
            item.restSeconds,
            item.exNotes,
          ]
            .map(escape)
            .join(","),
        );
      }
    }
  }

  return lines.join("\n");
}
