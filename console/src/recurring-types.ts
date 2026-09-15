/** Contracts shared by all recurring recipes; no website-specific state in the engine. */
export type Severity = "info" | "warning" | "critical";
export type Observation = { key: string; state: "present" | "absent" | "unknown"; severity: Severity; title: string; detail: string };
export type CheckResult = { state: Record<string, unknown>; observations: Observation[]; summary: string; complete: boolean };
export type Handler = {
  id: string; version: string; title: string; description: string;
  inputs?: { name: string; label: string; type: "text" | "url" | "lines"; required?: boolean; maxLength?: number }[];
  validate(config: Record<string, unknown>): Record<string, unknown>;
  check(config: Record<string, unknown>, state: Record<string, unknown>, context: { now: number; fetcher: typeof fetch; baseline: boolean; previousComplete?: boolean }): Promise<CheckResult>;
};
export type RecurringJob = {
  id: string; handler: string; handlerVersion: string; title: string; config: Record<string, unknown>;
  intervalMinutes: number; status: "draft" | "active" | "paused"; createdAt: number;
  state: Record<string, unknown>; recipients: string[] | null; nextRun?: number; lastRun?: number;
  baselineAt?: number; approvedBy?: string; approvedAt?: number;
};
export type Finding = Observation & { id: string; jobId: string; status: "open" | "acknowledged" | "resolved"; openedAt: number; updatedAt: number; occurrences: number; episode: number; recipients: string[] };
export type CheckRun = { id: string; jobId: string; startedAt: number; finishedAt?: number; status: "running" | "completed" | "partial" | "interrupted"; summary: string; kind: "baseline" | "manual" | "scheduled"; findings: number; evidenceDigest?: string; observations?: { key: string; state: string; severity: Severity }[] };
export type Notice = { id: string; kind: "finding" | "recovery" | "execution_failed" | "approval_required" | "summary" | "test"; jobId: string; title: string; detail: string; severity: Severity; at: number };
export type NotificationSettings = { recipients: string[]; minimumSeverity: Severity; warnings: "immediate" | "digest"; digestHourUtc: number; quietStartUtc: number | null; quietEndUtc: number | null; weeklySummary: boolean };
export type Delivery = { id: string; recipient: string; events: Notice[]; due: number; attempts: number; status: "pending" | "sending" | "accepted" | "failed" | "cancelled"; error?: string; acceptedAt?: number; messageId?: string };
export type RecurringState = { version: 1; jobs: RecurringJob[]; findings: Finding[]; runs: CheckRun[]; deliveries: Delivery[]; notifications: NotificationSettings; nextSummary: number; droppedNotifications: number; quota: { day: string; manual: number; emails: number }; externalEvents: string[] };
export type EmailTransport = { send(message: { from: string; to: string; subject: string; text: string; headers: Record<string, string> }): Promise<{ messageId?: string }> };
