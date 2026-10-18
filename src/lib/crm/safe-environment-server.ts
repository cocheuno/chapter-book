import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { recordAudit } from "./audit";
import { todayIn } from "./dates";
import { assertEditor, loadMember } from "./member";
import {
  changedSafeEnvFields,
  clearance,
  isIsoDate,
  readSafeEnvironment,
  soonestExpiry,
  sortSafeEnvironment,
  type SafeEnvPerson,
} from "./safe-environment";

const dateField = z
  .string()
  .trim()
  .refine((value) => value === "" || isIsoDate(value), { message: "Enter a real date." });

const textField = z.string().trim().max(200);

const safeEnvInput = z.object({
  personId: z.string().min(1),
  worksWithMinors: z.boolean(),
  program: textField,
  trainedOn: dateField,
  diocese: textField,
  backgroundCheckOn: dateField,
  backgroundCheckExpiresOn: dateField,
  suitabilityRequestedOn: dateField,
  suitabilityReceivedOn: dateField,
  suitabilityExpiresOn: dateField,
});

function parseSafeEnvInput(input: unknown) {
  const parsed = safeEnvInput.safeParse(input);
  if (!parsed.success) {
    if (parsed.error.issues.some((issue) => issue.message === "Enter a real date.")) {
      throw new Error("Enter a real date.");
    }
    if (parsed.error.issues.some((issue) => issue.code === "too_big")) {
      throw new Error("Program and diocese can be at most 200 characters.");
    }
    throw new Error("Check the safe-environment fields.");
  }
  return parsed.data;
}

function fromInput(input: z.infer<typeof safeEnvInput>): SafeEnvPerson {
  return readSafeEnvironment({
    works_with_minors: input.worksWithMinors,
    safe_env_program: input.program,
    safe_env_trained_on: input.trainedOn,
    safe_env_diocese: input.diocese,
    background_check_on: input.backgroundCheckOn,
    background_check_expires_on: input.backgroundCheckExpiresOn,
    suitability_requested_on: input.suitabilityRequestedOn,
    suitability_received_on: input.suitabilityReceivedOn,
    suitability_expires_on: input.suitabilityExpiresOn,
  });
}

export const setSafeEnvironment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parseSafeEnvInput)
  .handler(async ({ context, data }) => {
    const member = await loadMember(context.userId);
    assertEditor(member.role);
    const sql = await getSql();
    const found = await sql<Record<string, unknown>>`
      select works_with_minors, safe_env_program, safe_env_trained_on, safe_env_diocese,
             background_check_on, background_check_expires_on,
             suitability_requested_on, suitability_received_on, suitability_expires_on
      from persons
      where id = ${data.personId} and chapter_id = ${member.chapterId} and forgotten_at is null
    `;
    const current = found[0];
    if (!current) throw new Error("Person not found");
    const next = fromInput(data);
    const changed = changedSafeEnvFields(readSafeEnvironment(current), next);
    if (changed.length === 0) return { id: data.personId };
    const saved = await sql<{ id: string }>`
      update persons set
        works_with_minors = ${next.works_with_minors},
        safe_env_program = ${next.safe_env_program},
        safe_env_trained_on = ${next.safe_env_trained_on},
        safe_env_diocese = ${next.safe_env_diocese},
        background_check_on = ${next.background_check_on},
        background_check_expires_on = ${next.background_check_expires_on},
        suitability_requested_on = ${next.suitability_requested_on},
        suitability_received_on = ${next.suitability_received_on},
        suitability_expires_on = ${next.suitability_expires_on}
      where id = ${data.personId} and chapter_id = ${member.chapterId} and forgotten_at is null
      returning id
    `;
    if (!saved[0]) throw new Error("Person not found");
    await recordAudit(sql, {
      chapterId: member.chapterId,
      actor: member.userId,
      action: "safe_env_saved",
      entity: "person",
      entityId: data.personId,
      detail: { changed },
    });
    return { id: data.personId };
  });

export const listSafeEnvironment = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const member = await loadMember(context.userId);
    assertEditor(member.role);
    const sql = await getSql();
    const today = todayIn(member.timezone);
    const rows = await sql<{
      id: string;
      display_name: string;
      works_with_minors: boolean;
      safe_env_trained_on: string | null;
      background_check_on: string | null;
      background_check_expires_on: string | null;
      suitability_requested_on: string | null;
      suitability_received_on: string | null;
      suitability_expires_on: string | null;
    }>`
      select id, display_name, works_with_minors, safe_env_trained_on, background_check_on,
             background_check_expires_on, suitability_requested_on, suitability_received_on,
             suitability_expires_on
      from persons
      where chapter_id = ${member.chapterId}
        and works_with_minors = true
        and forgotten_at is null
    `;
    return sortSafeEnvironment(
      rows.map((row) => {
        const safe = readSafeEnvironment(row);
        return {
          id: row.id,
          display_name: row.display_name,
          clearance: clearance(safe, today),
          soonestExpiry: soonestExpiry(safe),
        };
      }),
    );
  });
