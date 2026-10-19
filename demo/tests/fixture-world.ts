/** Unit-test fixture only. Hosted orchestration cannot import or fall back to this. */
import { DemoAuthority, createSigner } from "../src/shared-authority/protocol.ts";
import { PaymentsProvider, SupportProvider, createState } from "../src/shared-authority/providers.ts";
export async function createWorld(now = Math.floor(Date.now() / 1000)) {
  const runId = crypto.randomUUID();
  const [root, paymentKey, supportKey] = await Promise.all([
    createSigner("demo-authority"), createSigner("demo-payments"), createSigner("demo-support"),
  ]);
  const trustedRoot = { publicKey: root.publicKey, kid: root.kid };
  const authority = new DemoAuthority(root, runId, now);
  const payments = new PaymentsProvider({ root: trustedRoot, signer: paymentKey, runId, now, state: createState() });
  const support = new SupportProvider({ root: trustedRoot, signer: supportKey, runId, now, state: createState() }, paymentKey);
  return { runId, now, authority, root, paymentKey, supportKey, payments, support };
}
