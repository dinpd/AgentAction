"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

type SubmitState = "idle" | "sending" | "sent" | "error";

export function ProjectInquiryForm() {
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const startedAt = useRef(0);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  async function submitInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);

    setSubmitState("sending");

    try {
      const response = await fetch("/api/project-inquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fields.get("name"),
          email: fields.get("email"),
          phone: fields.get("phone"),
          organization: fields.get("organization"),
          stage: fields.get("stage"),
          helpArea: fields.get("helpArea"),
          project: fields.get("project"),
          website: fields.get("website"),
          startedAt: startedAt.current,
        }),
      });

      if (!response.ok) {
        throw new Error("Inquiry delivery failed");
      }

      form.reset();
      startedAt.current = Date.now();
      setSubmitState("sent");
    } catch {
      setSubmitState("error");
    }
  }

  return (
    <form className="project-form" onSubmit={submitInquiry} aria-labelledby="project-form-title">
      <div className="project-form-heading">
        <p className="form-kicker">Start a transition assessment</p>
        <h3 id="project-form-title">Tell us about one consequential workflow.</h3>
        <p>We will reply with a practical first take on its current stage, evidence gaps, and next step.</p>
      </div>

      <div className="form-grid">
        <label>
          <span>Name</span>
          <input name="name" autoComplete="name" minLength={2} maxLength={80} required />
        </label>
        <label>
          <span>Work email</span>
          <input name="email" type="email" autoComplete="email" maxLength={254} required />
        </label>
        <label>
          <span>Phone <small>Optional</small></span>
          <input name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={40} />
        </label>
        <label>
          <span>Organization <small>Optional</small></span>
          <input name="organization" autoComplete="organization" maxLength={120} />
        </label>
        <label>
          <span>Project stage</span>
          <select name="stage" defaultValue="" required>
            <option value="" disabled>Select one</option>
            <option value="exploring">Exploring the design</option>
            <option value="prototype">Building a prototype</option>
            <option value="production">Preparing for production</option>
            <option value="live">Already live</option>
          </select>
        </label>
        <label className="form-span">
          <span>Where could we help?</span>
          <select name="helpArea" defaultValue="" required>
            <option value="" disabled>Select the closest fit</option>
            <option value="boundary">Map consequential actions and authority</option>
            <option value="integration">Design or prove an integration</option>
            <option value="evidence">Validate controls, receipts, and evidence</option>
            <option value="gateway">Plan an AgentAction Gateway pilot</option>
            <option value="other">Something else</option>
          </select>
        </label>
        <label className="form-span">
          <span>Project context</span>
          <textarea
            name="project"
            rows={6}
            minLength={40}
            maxLength={4000}
            placeholder="What can the agent change, which systems are involved, and what would make the project successful?"
            required
          />
        </label>
      </div>

      <label className="form-honeypot" aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>

      <div className="form-submit-row">
        <button className="button button-primary" type="submit" disabled={submitState === "sending"}>
          {submitState === "sending" ? "Sending…" : "Start the assessment"}
          {submitState !== "sending" && <span aria-hidden="true">→</span>}
        </button>
        <p>
          Sent privately to info@agentaction.dev. Do not include credentials, secrets, or sensitive production data.
        </p>
      </div>

      <p className={`form-status form-status-${submitState}`} role="status" aria-live="polite">
        {submitState === "sent" && "Thanks—your project note is on its way. We will reply by email."}
        {submitState === "error" && "We could not send that note. Please try again in a moment."}
      </p>
    </form>
  );
}
