import assert from "node:assert/strict";
import test from "node:test";

import { mapToolCallToAuthorize } from "../src/mapper.ts";
import type { AdapterConfig } from "../src/types.ts";

test("maps MCP tool arguments to AgentID authorize payload", () => {
  const payload = mapToolCallToAuthorize(config, "provider.crm.update_customer", {
    customer_id: "cus_123",
    job_id: "support_case_resolution",
    case_id: "case-1042",
    approved: true,
    jit_grant_id: "grant-1",
  });

  assert.deepEqual(payload, {
    agent_id: "enterprise-support-agent",
    tenant_id: "tenant-a",
    tool: "provider.crm.update_customer",
    action: "write",
    data_from: "enterprise_crm",
    data_to: "provider_crm",
    resource: "provider/customer/cus_123",
    job_id: "support_case_resolution",
    case_id: "case-1042",
    customer_id: "cus_123",
    approved: true,
    jit_grant_id: "grant-1",
  });
});

test("maps configured domain context arguments to authorize payload", () => {
  const payload = mapToolCallToAuthorize(devopsConfig, "devops.deploy.production", {
    service_id: "checkout-api",
    environment: "production",
    job_id: "production_deploy",
    change_request_id: "CHG-1042",
    incident_id: "INC-2048",
    commit_sha: "abc123",
    approved: true,
    jit_grant_id: "grant-1",
  });

  assert.deepEqual(payload, {
    agent_id: "platform-release-agent",
    tenant_id: "tenant-a",
    tool: "devops.deploy.production",
    action: "execute",
    data_from: "release_pipeline",
    data_to: "production_runtime",
    resource: "service/checkout-api/environment/production",
    job_id: "production_deploy",
    approved: true,
    jit_grant_id: "grant-1",
    service_id: "checkout-api",
    environment: "production",
    change_request_id: "CHG-1042",
    incident_id: "INC-2048",
    commit_sha: "abc123",
  });
});

const config: AdapterConfig = {
  agentid: { base_url: "https://agentid.example.com", tenant_id: "tenant-a" },
  downstream: { url: "https://mcp.example.com" },
  agent: { id: "enterprise-support-agent" },
  tools: {
    "provider.crm.update_customer": {
      action: "write",
      data_from: "enterprise_crm",
      data_to: "provider_crm",
      resource_template: "provider/customer/{customer_id}",
      job_id_arg: "job_id",
      case_id_arg: "case_id",
      customer_id_arg: "customer_id",
      approved_arg: "approved",
      jit_grant_id_arg: "jit_grant_id",
    },
  },
};

const devopsConfig: AdapterConfig = {
  agentid: { base_url: "https://agentid.example.com", tenant_id: "tenant-a" },
  downstream: { url: "https://mcp.example.com" },
  agent: { id: "platform-release-agent" },
  tools: {
    "devops.deploy.production": {
      action: "execute",
      data_from: "release_pipeline",
      data_to: "production_runtime",
      resource_template: "service/{service_id}/environment/{environment}",
      job_id_arg: "job_id",
      approved_arg: "approved",
      jit_grant_id_arg: "jit_grant_id",
      context_args: {
        service_id: "service_id",
        environment: "environment",
        change_request_id: "change_request_id",
        incident_id: "incident_id",
        commit_sha: "commit_sha",
      },
    },
  },
};
