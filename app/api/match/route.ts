import { buildResponse } from "@/lib/respond";
import { sanitizeGrades } from "@/lib/subjects";
import { MESSAGES, type ApiError } from "@/lib/api";
import { errorDetail, log } from "@/lib/log";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const grades = sanitizeGrades(body?.grades);
  if (!grades) return Response.json({ error: "Check your grades and try again.", code: "invalid_grades" } satisfies ApiError, { status: 400 });
  try {
    const res = buildResponse(grades, false);
    if (!res) return Response.json({ error: "Enter grades for at least 7 subjects.", code: "invalid_grades" } satisfies ApiError, { status: 400 });
    return Response.json(res);
  } catch (e) {
    log("error", "match_exception", { detail: errorDetail(e) });
    return Response.json({ error: MESSAGES.generic, code: "unavailable" } satisfies ApiError, { status: 500 });
  }
}
