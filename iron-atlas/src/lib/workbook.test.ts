import { afterAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { sql as client } from "@/db";
import { loadProgram, type ProgramRow } from "@/lib/programQuery";
import {
  buildProgramCsv,
  buildProgramWorkbook,
  definedNameFor,
  maxesLifts,
  weekSheetName,
} from "@/lib/workbook";

afterAll(async () => {
  await client.end();
});

/** Minimal row factory — only the fields the workbook builder reads. */
function row(overrides: Partial<ProgramRow> = {}): ProgramRow {
  return {
    weekId: 1,
    weekNumber: 1,
    weekLabel: null,
    weekNotes: null,
    repeatCount: 1,
    dayId: 1,
    dayIndex: 0,
    dayName: "Day 1",
    dayNotes: null,
    order: 0,
    sets: 3,
    reps: "10",
    intensityType: "none",
    intensityValue: null,
    restSeconds: 120,
    tempo: null,
    exNotes: null,
    supersetGroup: null,
    exerciseId: 1,
    exerciseName: "Back Squat",
    primaryMuscle: "quads",
    equipment: "barbell",
    isCompound: true,
    ...overrides,
  } as ProgramRow;
}

describe("definedNameFor", () => {
  it("produces a legal Excel defined name", () => {
    expect(definedNameFor("Back Squat")).toBe("TM_Back_Squat");
    expect(definedNameFor("Farmer's Walk")).toBe("TM_Farmer_s_Walk");
    expect(definedNameFor("45-Degree Back Extension")).toBe(
      "TM_45_Degree_Back_Extension",
    );
  });

  it("never starts with a digit or looks like a cell reference", () => {
    // "A1" as a bare name would be ambiguous with a cell address.
    for (const name of ["A1", "5/3/1 Press", "1RM Test"]) {
      const result = definedNameFor(name);
      expect(result).toMatch(/^TM_/);
      expect(result).not.toMatch(/^[0-9]/);
    }
  });
});

describe("maxesLifts", () => {
  it("includes every percentage-prescribed lift", () => {
    const rows = [
      row({
        exerciseName: "Overhead Press",
        intensityType: "percent_1rm",
        intensityValue: "65",
      }),
      row({ exerciseName: "Cable Fly", equipment: "cable", isCompound: false }),
    ];
    expect(maxesLifts(rows).map((l) => l.name)).toEqual(["Overhead Press"]);
  });

  it("includes compound barbell lifts even without percentages", () => {
    const rows = [
      row({
        exerciseName: "Back Squat",
        isCompound: true,
        equipment: "barbell",
      }),
    ];
    expect(maxesLifts(rows).map((l) => l.name)).toEqual(["Back Squat"]);
  });

  it("excludes isolation and machine work", () => {
    const rows = [
      row({
        exerciseName: "Leg Extension",
        equipment: "machine",
        isCompound: false,
      }),
      row({
        exerciseName: "Barbell Curl",
        equipment: "barbell",
        isCompound: false,
      }),
    ];
    expect(maxesLifts(rows)).toEqual([]);
  });

  it("deduplicates a lift appearing on many days", () => {
    const rows = [
      row({ exerciseName: "Back Squat", dayId: 1 }),
      row({ exerciseName: "Back Squat", dayId: 2 }),
    ];
    expect(maxesLifts(rows)).toHaveLength(1);
  });
});

describe("weekSheetName", () => {
  it("stays inside Excel's 31-character tab limit", () => {
    const taken = new Set<string>();
    expect(weekSheetName(1, taken).length).toBeLessThanOrEqual(31);
  });

  it("disambiguates duplicate week numbers", () => {
    const taken = new Set<string>();
    expect(weekSheetName(1, taken)).toBe("Week 1");
    expect(weekSheetName(1, taken)).toBe("Week 1 (2)");
    expect(weekSheetName(1, taken)).toBe("Week 1 (3)");
  });
});

describe("workbook round-trip", () => {
  /** Rebuilds a real program's workbook and reads it back as Excel would. */
  async function roundTrip(slug: string) {
    const loaded = await loadProgram(slug);
    if (!loaded)
      throw new Error(
        `${slug} is not in the database — run the generator first`,
      );
    const buffer = await buildProgramWorkbook(
      loaded.program,
      loaded.rows,
    ).xlsx.writeBuffer();
    const reread = new ExcelJS.Workbook();
    await reread.xlsx.load(buffer as ArrayBuffer);
    return { workbook: reread, ...loaded };
  }

  it("writes a file Excel can reopen, with the expected tabs", async () => {
    const { workbook } = await roundTrip("531-bbb");
    const names = workbook.worksheets.map((w) => w.name);
    expect(names[0]).toBe("Maxes");
    expect(names.at(-1)).toBe("About");
    expect(names.filter((n) => n.startsWith("Week "))).not.toHaveLength(0);
    for (const name of names) expect(name.length).toBeLessThanOrEqual(31);
  });

  it("resolves every percentage formula to a defined name that exists", async () => {
    // The real failure mode: a target formula referencing a lift that never got
    // a Maxes row, which opens in Excel as #NAME?.
    const { workbook } = await roundTrip("531-bbb");
    const defined = new Set(
      workbook.definedNames.model?.map((d) => d.name) ?? [],
    );
    expect(defined.size).toBeGreaterThan(0);

    let formulaCount = 0;
    for (const sheet of workbook.worksheets) {
      if (!sheet.name.startsWith("Week ")) continue;
      sheet.eachRow((r) => {
        const cell = r.getCell(6).value;
        if (cell && typeof cell === "object" && "formula" in cell) {
          formulaCount++;
          const referenced =
            String(cell.formula).match(/TM_[A-Za-z0-9_]+/g) ?? [];
          expect(referenced.length).toBeGreaterThan(0);
          for (const name of referenced) expect(defined).toContain(name);
        }
      });
    }
    expect(formulaCount).toBeGreaterThan(0);
  });

  it("points each defined name at a Training Max cell that derives from the 1RM input", async () => {
    const { workbook } = await roundTrip("531-bbb");
    const maxes = workbook.getWorksheet("Maxes")!;

    for (const entry of workbook.definedNames.model ?? []) {
      const [ref] = entry.ranges;
      expect(ref).toMatch(/^Maxes!\$C\$\d+$/);

      const rowNumber = Number(ref.match(/\$C\$(\d+)$/)![1]);
      const trainingMax = maxes.getRow(rowNumber).getCell(3).value;
      expect(trainingMax).toHaveProperty("formula");
      // Training Max must be computed from the 1RM the user types in column B.
      expect((trainingMax as { formula: string }).formula).toBe(
        `ROUND(B${rowNumber}*0.9,1)`,
      );
      expect(maxes.getRow(rowNumber).getCell(1).value).toBeTruthy();
    }
  });

  it("leaves blank logging columns for every prescribed exercise", async () => {
    const { workbook } = await roundTrip("531-bbb");
    const week = workbook.worksheets.find((w) => w.name.startsWith("Week "))!;
    const exerciseRow = week.findRow(4)!; // first row under the day banner
    // Column 9 onward is the fill-in-at-the-gym area.
    expect(exerciseRow.getCell(9).value).toBeNull();
    expect(exerciseRow.getCell(9).border?.bottom?.style).toBe("hair");
  });

  it("carries the AI-reconstructed disclaimer into the file itself", async () => {
    const { workbook, program } = await roundTrip("531-bbb");
    expect(program.aiGenerated && !program.verified).toBe(true);

    const about = workbook.getWorksheet("About")!;
    let found = false;
    about.eachRow((r) => {
      const v = r.getCell(1).value;
      if (typeof v === "string" && v.includes("RECONSTRUCTED, NOT TRANSCRIBED"))
        found = true;
    });
    expect(found).toBe(true);
  });

  it("still discloses provenance for a verified program, worded for the source-checked state", async () => {
    const { workbook, program } = await roundTrip("arnold-golden-six");
    expect(program.verified).toBe(true);

    const about = workbook.getWorksheet("About")!;
    let found = false;
    about.eachRow((r) => {
      const v = r.getCell(1).value;
      if (
        typeof v === "string" &&
        v.includes("SOURCE-CHECKED RECONSTRUCTION")
      )
        found = true;
    });
    expect(found).toBe(true);
  });
});

describe("csv export", () => {
  it("carries an attribution header, then a header row, then one line per exercise", async () => {
    const loaded = await loadProgram("arnold-golden-six");
    const csv = buildProgramCsv(loaded!.program, loaded!.rows);
    const lines = csv.split("\n");
    expect(lines[0]).toContain(loaded!.program.title);
    expect(lines[0]).toContain(loaded!.program.authorName);
    expect(lines[1]).toContain("SOURCE-CHECKED RECONSTRUCTION");

    const headerIndex = lines.indexOf(
      "Week,Day,Exercise,Sets,Reps,Intensity,Rest (s),Notes",
    );
    expect(headerIndex).toBeGreaterThan(0);
    expect(lines).toHaveLength(headerIndex + 1 + loaded!.rows.length);
  });

  it("includes a purchase link when the coach actively sells the program", async () => {
    const loaded = await loadProgram("nippard-ppl");
    const csv = buildProgramCsv(loaded!.program, loaded!.rows);
    expect(csv).toContain(loaded!.program.purchaseUrl);
  });

  it("quotes fields containing commas so columns don't shift", () => {
    const csv = buildProgramCsv(
      {
        title: "T",
        authorName: "A",
        slug: "s",
        firstParty: false,
        verified: false,
        confidence: null,
        sourceUrls: [],
        purchaseUrl: null,
      } as never,
      [row({ exNotes: "Wide grip, full range" })],
    );
    expect(csv).toContain('"Wide grip, full range"');
  });
});
