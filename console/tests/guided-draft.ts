import assert from 'node:assert/strict';

// Shared steps for browser tests that drive the guided Create draft. A draft generated from a job
// description, a catalog template or a saved workspace template opens as collapsed setup steps
// (1. Job details, 2. Tools, 3. Guardrails & checks, 4. Trial); nothing below the open step is visible.

// Opens each named <details> the way an operator would, by clicking its summary, unless it is already open.
// Every id must be in the page: a renamed step fails here, at the selector, not at a later hidden control.
export const openDetails = async (page: any, ...ids: string[]) => {
  for (const id of ids) {
    const details = page.locator('#' + id);
    if (await details.getAttribute('open') === null) await details.locator('> summary').click();
  }
};
// The template editor (definition fields, tools and measured checks) inside "3. Guardrails & checks".
export const openTemplateEditor = (page: any) => openDetails(page, 'setup-review', 'draft-customize');
// Saved templates and suggestions. Once a first draft has been opened they sit under "Start another agent or
// use a template"; before that, on a freshly loaded page, that wrapper does not exist.
export const openTemplateLibrary = async (page: any) => {
  await openDetails(page, ...(await page.locator('#other-agent-options').count() ? ['other-agent-options'] : []), 'example-library');
};
// "Continue to trial" opens the Trial step once job details, tools and review are complete.
export const reviewFirstAction = async (page: any) => {
  await page.getByRole('button', { name: 'Continue to trial', exact: true }).click();
  await page.getByRole('button', { name: 'Review first action', exact: true }).click();
};
// Leaving a workspace with unsaved draft edits asks for confirmation; `leave` must trigger that prompt.
export const confirmLeavingUnsavedDraft = async (page: any, leave: () => Promise<unknown>) => {
  let prompt = '';
  page.once('dialog', (dialog: any) => { prompt = dialog.message(); void dialog.accept(); });
  await leave();
  assert.match(prompt, /unsaved changes/);
};
