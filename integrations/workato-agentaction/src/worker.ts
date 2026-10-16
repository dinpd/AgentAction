// Keep deployed Workato class names and persisted record identities unchanged.
import { createReferenceWorker } from "../../refund-reference/src/worker.ts";
export {
  AgentIdJitGrants,
  ReferenceRefunds as WorkatoRefunds,
  MockRefundProvider,
  sha256,
  verifyMockObservation,
  type Env,
} from "../../refund-reference/src/worker.ts";
export default createReferenceWorker("workato");
