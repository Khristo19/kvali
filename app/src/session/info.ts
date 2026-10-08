// What to show about a job on every role page: real field name, product, dates and a short id, never the seeded sample text.
import { getAccountFor } from "@/account/store";
import { fieldByHash } from "@/data/fields-store";
import { SAMPLE_JOB_ID } from "@/engine/scenario";
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

export function describeJob(j: JobLike, session: Session | null) {
  const sess = session && session.fieldHash === j.fieldHash ? session : null;
  const f = fieldByHash(j.fieldHash);
  const mine = !!sess || j.id === SAMPLE_JOB_ID;
  return {
    ref: jobRef(j.id, session),
    field: f?.name ?? sess?.fieldName ?? "Field",
    crop: f?.crop ?? sess?.crop ?? "",
    product: f?.product ?? sess?.product ?? "Spray product",
    farmer: (mine ? (sess?.farmerName ?? getAccountFor("farmer")?.name) : undefined) ?? null,
  };
}
