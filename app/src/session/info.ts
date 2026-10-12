// What to show about a job on every role page: real field name, product, dates and a short id, never the seeded sample text.
import { getAccountFor } from "@/account/store";
import { fieldByHash } from "@/data/fields-store";
import { SAMPLE_JOB_ID } from "@/engine/scenario";
import type { JobMeta } from "@/devnet/client";
import type { Session } from "./store";

export interface JobLike {
  id: number;
  fieldHash: string;
  areaCha: number;
  sprayDeadline: number;
}

/** Short job reference: last 5 digits of the on-chain id. */
export function jobRef(id: number, session: Session | null): string {
  const chainId = id === SAMPLE_JOB_ID ? session?.chainJobId : id;
  if (chainId === undefined) return "demo";
  return chainId > 100000 ? `…${String(chainId).slice(-5)}` : String(chainId);
}

/** "Field 3F2A": a stand-in name from the outline hash, for a job whose field details never reached this browser. */
export const fieldStandIn = (hash: string) => `Field ${hash.slice(0, 4).toUpperCase()}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-13" -> "13 Oct 2026" (a calendar date, no time zone shift). */
export function dateText(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/**
 * Name, crop, product and wanted-by date of a job. Sources, best first: the job's own details memo (read from the chain, so
 * every browser sees what the farmer posted), this browser's session (its own job), the saved field with the same outline hash.
 * Never another field's name: a job with no details shows "Field ####" from its hash.
 */
export function describeJob(j: JobLike, session: Session | null, meta?: JobMeta | null) {
  // Only the session job gets the session's details: another visitor's job on the same field is not "mine".
  const isSession = !!session && (j.id === SAMPLE_JOB_ID || j.id === session.chainJobId);
  const sess = isSession ? session : null;
  const f = fieldByHash(j.fieldHash);
  const mine = isSession;
  const by = meta?.by ?? sess?.wantedBy;
  return {
    ref: jobRef(j.id, session),
    field: meta?.field ?? sess?.fieldName ?? f?.name ?? fieldStandIn(j.fieldHash),
    crop: meta?.crop ?? sess?.crop ?? f?.crop ?? "",
    product: meta?.product ?? sess?.product ?? f?.product ?? "Spray product",
    farmer: (mine ? (sess?.farmerName ?? getAccountFor("farmer")?.name) : undefined) ?? null,
    /** "YYYY-MM-DD" or null when the farmer gave no date. */
    wantedBy: by ?? null,
    wantedText: by ? dateText(by) : "Not given",
  };
}
