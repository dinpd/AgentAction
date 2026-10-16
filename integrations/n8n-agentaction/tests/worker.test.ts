import * as adapter from "../src/worker.ts";
import { referenceTests } from "../../refund-reference/tests/suite.ts";
referenceTests({ ...adapter, Refunds: adapter.N8nRefunds }, "n8n");
