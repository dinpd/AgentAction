import type { Assessment, Method } from "./methods.mts";
export type Row = Assessment & {
  id: string; domain: string; scenario: string; variant: number; truth: boolean; method: Method;
};
export function summarize(rows: ReadonlyArray<Pick<Row, "truth" | "label">>) {
  const positive = rows.filter(r => r.truth).length;
  const negative = rows.length - positive;
  const falseSuccess = rows.filter(r => !r.truth && r.label === "S").length;
  const falseFailure = rows.filter(r => r.truth && r.label === "F").length;
  const admittedPositive = rows.filter(r => r.truth && r.label === "S").length;
  const positiveUnknown = rows.filter(r => r.truth && r.label === "U").length;
  const negativeUnknown = rows.filter(r => !r.truth && r.label === "U").length;
  const trueFailure = rows.filter(r => !r.truth && r.label === "F").length;
  // Admission recall treats U as a success not recognized, while retaining U
  // separately from an explicit F verdict in the six-cell confusion matrix.
  const missedSuccess = positive - admittedPositive;
  const abstained = rows.filter(r => r.label === "U").length;
  const decisive = rows.length - abstained;
  const rate = (n: number, d: number) => d ? n / d : null;
  return { total: rows.length, positive, negative, false_success: falseSuccess,
    false_failure: falseFailure, admitted_positive: admittedPositive, abstained, decisive,
    false_success_rate: rate(falseSuccess, negative), false_failure_rate: rate(falseFailure, positive),
    coverage: rate(decisive, rows.length), selective_error: rate(falseSuccess + falseFailure, decisive),
    positive_admission: rate(admittedPositive, positive),
    confusion: { positive: { S: admittedPositive, F: falseFailure, U: positiveUnknown },
      negative: { S: falseSuccess, F: trueFailure, U: negativeUnknown } },
    missed_success: missedSuccess,
    completion_precision: rate(admittedPositive, admittedPositive + falseSuccess),
    completion_recall: rate(admittedPositive, positive),
    completion_f1: rate(2 * admittedPositive, 2 * admittedPositive + falseSuccess + missedSuccess) };
}
