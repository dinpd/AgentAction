import type { Assessment, Method } from "./methods.mts";
export type Row = Assessment & {
  id: string; domain: string; scenario: string; variant: number; truth: boolean; method: Method;
};
export function summarize(rows: Row[]) {
  const positive = rows.filter(r => r.truth).length;
  const negative = rows.length - positive;
  const falseSuccess = rows.filter(r => !r.truth && r.label === "S").length;
  const falseFailure = rows.filter(r => r.truth && r.label === "F").length;
  const admittedPositive = rows.filter(r => r.truth && r.label === "S").length;
  const abstained = rows.filter(r => r.label === "U").length;
  const decisive = rows.length - abstained;
  const rate = (n: number, d: number) => d ? n / d : null;
  return { total: rows.length, positive, negative, false_success: falseSuccess,
    false_failure: falseFailure, admitted_positive: admittedPositive, abstained, decisive,
    false_success_rate: rate(falseSuccess, negative), false_failure_rate: rate(falseFailure, positive),
    coverage: rate(decisive, rows.length), selective_error: rate(falseSuccess + falseFailure, decisive),
    positive_admission: rate(admittedPositive, positive) };
}
