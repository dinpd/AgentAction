"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";

const subscribe = () => () => {};

export function ResearchDownloadForm({ pdf }: { pdf: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const startedAt = useRef(0);
  useEffect(() => { startedAt.current = Date.now(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setState("sending");
    try {
      const response = await fetch("/api/research-download", {
        method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ email: fields.get("email"), name: fields.get("name"), organization: fields.get("organization"), website: fields.get("website"), startedAt: startedAt.current }),
      });
      const result = await response.json();
      if (!response.ok || result.received !== true) throw new Error("Registration failed");
      form.reset();
      startedAt.current = Date.now();
      setState("sent");
    } catch { setState("error"); }
  }

  return (
    <div className="research-download">
      <p>Let us know who is reading. Registration is optional; the same PDF is available directly below.</p>
      <form onSubmit={submit} aria-label="Optional reader registration" aria-describedby="reader-privacy">
        <div className="reader-fields">
          <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} disabled={!ready || state === "sending"} /></label>
          <label>Name <span>(optional)</span><input name="name" autoComplete="name" maxLength={80} disabled={!ready || state === "sending"} /></label>
          <label>Organization <span>(optional)</span><input name="organization" autoComplete="organization" maxLength={120} disabled={!ready || state === "sending"} /></label>
        </div>
        <label className="form-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <p id="reader-privacy" className="research-disclosure">By submitting, you share these details privately with AgentAction.dev to help us understand readership and, if useful, follow up about this research. Details go to our website inbox. This does not subscribe you to a mailing list. For removal requests, email <a href="mailto:info@agentaction.dev">info@agentaction.dev</a>.</p>
        <button className="research-primary" type="submit" disabled={!ready || state === "sending" || state === "sent"}>{state === "sending" ? "Submitting…" : state === "sent" ? "Details received" : "Share my details"}</button>
        <noscript><p>Registration requires JavaScript. You can download the PDF directly below.</p></noscript>
        <p role="status" aria-live="polite">{state === "sent" ? "Thank you—your details have been received. Your PDF is ready below." : state === "error" ? "We could not register your details. Try again, or download the PDF directly below." : ""}</p>
      </form>
      <a className="research-inline-link reader-direct" href={pdf} download>Download PDF—no registration required</a>
    </div>
  );
}
