import { loadProgram } from "@/lib/programQuery";
import { buildProgramCsv, buildProgramWorkbook } from "@/lib/workbook";

/**
 * Downloads a program as a spreadsheet.
 *
 *   /api/programs/531-bbb/export        -> .xlsx
 *   /api/programs/531-bbb/export?f=csv  -> .csv
 *
 * exceljs and the pg driver are Node-only, so this must not run on the edge.
 */
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const loaded = await loadProgram(slug);

  if (!loaded) {
    return new Response("Program not found", { status: 404 });
  }

  const { program, rows } = loaded;
  const format = new URL(request.url).searchParams.get("f");

  if (format === "csv") {
    return new Response(buildProgramCsv(program, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${program.slug}.csv"`,
      },
    });
  }

  const workbook = buildProgramWorkbook(program, rows);
  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${program.slug}.xlsx"`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}
