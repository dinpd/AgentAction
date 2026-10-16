import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const mode of ["automatic", "human-review"]) {
  test(`${mode} import keeps credentials private and requests bounded`, () => {
    const workflow = JSON.parse(
      readFileSync(
        new URL(`../workflows/${mode}.json`, import.meta.url),
        "utf8",
      ),
    );
    assert.equal(workflow.active, false);
    assert.deepEqual(workflow.pinData, {});
    assert.equal(workflow.id, undefined);
    const nodes = new Map<string, any>(
      workflow.nodes.map((n: any) => [n.name, n]),
    );
    for (const node of workflow.nodes) {
      assert.equal(node.credentials, undefined);
      assert.ok(!/webhook|code|executeCommand/.test(node.type));
      if (node.type === "n8n-nodes-base.httpRequest") {
        assert.equal(node.parameters.authentication, "genericCredentialType");
        assert.equal(node.parameters.genericAuthType, "httpHeaderAuth");
        assert.equal(
          node.parameters.options.redirect.redirect.followRedirects,
          false,
        );
        assert.equal(node.parameters.options.timeout, 30000);
        assert.equal(node.parameters.headerParameters, undefined);
        assert.ok(!/approve|\/execute|\/deny/.test(node.parameters.url));
      }
    }
    const submit = nodes.get("Submit refund").parameters;
    assert.ok(submit.jsonBody.includes("request_id: $json.request_id"));
    assert.ok(submit.jsonBody.includes("n8n_workflow_id: $workflow.id"));
    assert.ok(submit.jsonBody.includes("n8n_execution_id: $execution.id"));
    assert.equal(
      submit.url.includes("/automatic/requests"),
      mode === "automatic",
    );
    for (const [source, connections] of Object.entries<any>(
      workflow.connections,
    )) {
      assert.ok(nodes.has(source));
      for (const branch of connections.main)
        for (const link of branch) assert.ok(nodes.has(link.node));
    }
    if (mode === "human-review") {
      assert.equal(nodes.get("Wait 70 seconds").parameters.amount, 70);
      assert.equal(nodes.get("Wait 70 seconds").parameters.unit, "seconds");
      assert.ok(
        nodes.get("Refund inputs").parameters.jsonOutput.includes("1800000"),
      );
      assert.ok(
        nodes
          .get("Awaiting review?")
          .parameters.conditions.conditions[0].leftValue.includes(
            "poll_deadline",
          ),
      );
      assert.equal(
        workflow.connections["Read refund status"].main[0][0].node,
        "Awaiting review?",
      );
      assert.equal(
        workflow.connections["Awaiting review?"].main[1][0].node,
        "Final status",
      );
    }
    assert.ok(
      nodes
        .get("Refund outcome")
        .parameters.jsonOutput.includes("evidence: $json"),
    );
  });
}
