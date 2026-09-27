import { cases, questions, thresholds, manifest } from "./cases.mjs";
// Display data comes from the same frozen corpus sent to providers. Labels are
// separate evaluation metadata and never become part of model state.
export const criteria = {
  questions, thresholds, manifest,
  cases: cases.map(({ id, state, event, truth, expected_gateway }) => ({ id, state, event, evaluation: { truth, expected_gateway } })),
};
