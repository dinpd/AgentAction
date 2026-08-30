import { createPublicDemoEnv } from "./demo-fixtures.ts";
import consoleWorker from "./worker.ts";

const demoEnv = createPublicDemoEnv();

export default {
  async fetch(request: Request): Promise<Response> {
    return consoleWorker.fetch(request, demoEnv);
  },
};
