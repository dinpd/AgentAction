import {
  createReferenceWorker,
  ReferenceRefunds,
  MockRefundProvider as ReferenceMockProvider,
  type Env,
} from "../../refund-reference/src/worker.ts";
export {
  AgentIdJitGrants,
  sha256,
  type Env,
} from "../../refund-reference/src/worker.ts";

// Platform identity is deployment code, never a caller-controlled flag.
export class N8nRefunds extends ReferenceRefunds {
  constructor(
    state: ConstructorParameters<typeof ReferenceRefunds>[0],
    env: Env,
  ) {
    super(state, env, "n8n");
  }
}
export class MockRefundProvider extends ReferenceMockProvider {
  constructor(state: ConstructorParameters<typeof ReferenceMockProvider>[0]) {
    super(state, "n8n");
  }
}
export default createReferenceWorker("n8n");
