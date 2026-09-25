import { RuntimeError, object } from "./mcp-client.ts";
import type { Delivery, Notice, NotificationSettings, RecurringState } from "./recurring-types.ts";

export const severityRank = { info: 0, warning: 1, critical: 2 };
export const defaultNotifications = (): NotificationSettings => ({ recipients: [], minimumSeverity: "warning", warnings: "digest", digestHourUtc: 16, quietStartUtc: null, quietEndUtc: null, weeklySummary: true });
export function emailAddress(value: unknown): string {
  if (typeof value !== "string" || value.length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(value)) throw new RuntimeError("Enter a valid email address.");
  return value.toLowerCase();
}
export function recipients(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 5) throw new RuntimeError("Configure at most five recipients.");
  return [...new Set(value.map(emailAddress))];
}
export function notificationSettings(value: unknown): NotificationSettings {
  const v = object(value), hour = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 24;
  if (!Object.hasOwn(severityRank, String(v.minimumSeverity)) || !["immediate", "digest"].includes(String(v.warnings)) || !hour(v.digestHourUtc) || typeof v.weeklySummary !== "boolean" || (v.quietStartUtc !== null && !hour(v.quietStartUtc)) || (v.quietEndUtc !== null && !hour(v.quietEndUtc)) || ((v.quietStartUtc === null) !== (v.quietEndUtc === null)) || (v.quietStartUtc !== null && v.quietStartUtc === v.quietEndUtc)) throw new RuntimeError("Check severity, digest hour and quiet hours (UTC, 0–23; different start/end or both disabled).");
  return { recipients: recipients(v.recipients), minimumSeverity: v.minimumSeverity as NotificationSettings["minimumSeverity"], warnings: v.warnings as NotificationSettings["warnings"], digestHourUtc: v.digestHourUtc as number, quietStartUtc: v.quietStartUtc as number | null, quietEndUtc: v.quietEndUtc as number | null, weeklySummary: v.weeklySummary };
}
export function afterQuietHours(time: number, settings: NotificationSettings): number {
  const { quietStartUtc: start, quietEndUtc: end } = settings;
  if (start === null || end === null) return time;
  const date = new Date(time), hour = date.getUTCHours();
  if (!(start < end ? hour >= start && hour < end : hour >= start || hour < end)) return time;
  if (hour >= start && start > end) date.setUTCDate(date.getUTCDate() + 1);
  date.setUTCHours(end, 0, 0, 0); return date.getTime();
}
export function enqueue(state: RecurringState, event: Notice, selected: string[] | null = null): string[] {
  const settings = state.notifications;
  if (!["test", "summary", "recovery", "report"].includes(event.kind) && severityRank[event.severity] < severityRank[settings.minimumSeverity]) return [];
  const targets = (selected ?? settings.recipients).filter(r => settings.recipients.includes(r));
  let due = event.at;
  if (event.kind !== "test" && event.kind !== "report" && event.kind !== "recovery" && event.severity !== "critical" && settings.warnings === "digest") {
    const date = new Date(due); date.setUTCHours(settings.digestHourUtc, 0, 0, 0);
    if (date.getTime() <= due) date.setUTCDate(date.getUTCDate() + 1);
    due = date.getTime();
  }
  if (event.kind !== "test" && event.kind !== "report") due = afterQuietHours(due, settings);
  const queued: string[] = [];
  for (const recipient of targets) {
    if (state.deliveries.some(d => d.recipient === recipient && d.events.some(e => e.id === event.id))) continue;
    const digest = due > event.at && event.kind !== "test" && event.kind !== "report" && state.deliveries.find(d => d.recipient === recipient && d.due === due && d.status === "pending" && d.attempts === 0 && d.events.length < 12);
    if (digest) { digest.events.push(event); queued.push(recipient); continue; }
    if (state.deliveries.filter(d => ["pending", "sending"].includes(d.status)).length >= 60) { state.droppedNotifications++; continue; }
    state.deliveries.push({ id: crypto.randomUUID(), recipient, events: [event], due, attempts: 0, status: "pending" }); queued.push(recipient);
  }
  return queued;
}
export function deliveryText(delivery: Delivery): string {
  return ["AgentAction workspace notification", "", ...delivery.events.flatMap(e => [e.title, `Event: ${e.kind} · Severity: ${e.severity} · ${new Date(e.at).toISOString()}`, e.detail, ""]), "Review evidence and notification settings in your AgentAction console.", `Delivery ID: ${delivery.id}`, "Provider acceptance does not prove inbox delivery. Retried delivery may produce duplicates."].join("\n");
}
