{
  title: 'AgentAction Governed Refund Reference',
  connection: {
    fields: [
      { name: 'base_url', label: 'Adapter URL', optional: false,
        hint: 'HTTPS URL of your separately deployed synthetic-refund adapter.' },
      { name: 'api_token', label: 'Recipe token', control_type: 'password', optional: false,
        hint: 'Use a recipe-role token. It can request and resume refunds, but cannot approve them.' }
    ],
    authorization: {
      type: 'custom_auth',
      apply: lambda do |connection|
        headers('Authorization' => "Bearer #{connection['api_token']}")
      end
    },
    base_uri: lambda do |connection|
      url = connection['base_url'].to_s
      error('Use an HTTPS adapter URL without a path, query, or credentials') unless url.match?(/\Ahttps:\/\/[a-zA-Z0-9.-]+(?::443)?\/?\z/)
      "#{url.sub(/\/$/, '')}/"
    end
  },
  test: lambda do |_connection|
    result = get('connection')
    error('This connection requires a recipe-role token') unless result['role'] == 'recipe'
    result
  end,
  object_definitions: {
    refund: {
      fields: lambda do |_connection, _config_fields|
        [
          { name: 'request_id', label: 'Business request ID' },
          { name: 'payment_id' }, { name: 'amount_cents', type: 'integer' },
          { name: 'currency' }, { name: 'reason' }, { name: 'status' },
          { name: 'authorization_mode' }, { name: 'policy_decision' },
          { name: 'tenant_id' }, { name: 'agent_id' }, { name: 'scope_digest' },
          { name: 'intent_id' }, { name: 'intent_digest' }, { name: 'approval_id' },
          { name: 'approval_expires_at', type: 'date_time' },
          { name: 'approval_url', label: 'Human review URL' },
          { name: 'evidence_url', label: 'Evidence timeline URL' },
          { name: 'replayed', type: 'boolean' }, { name: 'refund_id' },
          { name: 'mutation_count', type: 'integer' }, { name: 'outcome_verdict' },
          { name: 'constraint_compliance' }, { name: 'qualified_success', type: 'boolean' },
          { name: 'created_at', type: 'date_time' }
        ]
      end
    }
  },
  actions: {
    automatic_refund: {
      title: 'Execute refund under automatic policy',
      description: 'Execute a <span class="provider">policy-governed synthetic refund</span>',
      help: 'Automatically permits synthetic USD refunds up to 100 dollars with a supported reason. Reuse the same business ID on retry. Single-use JIT and signed outcome verification still apply.',
      input_fields: lambda do |_object_definitions|
        [
          { name: 'request_id', label: 'Business request ID', optional: false,
            hint: 'Stable case/action ID, using letters, numbers, hyphen or underscore. Do not regenerate on a retry.' },
          { name: 'payment_id', optional: false },
          { name: 'amount_cents', label: 'Amount in USD cents', type: 'integer', optional: false },
          { name: 'currency', optional: false, default: 'USD', hint: 'Only USD is accepted by this synthetic demo.' },
          { name: 'reason', optional: false, hint: 'Use duplicate_charge or service_failure.' },
          { name: 'workato_recipe_id', label: 'Workato recipe ID', optional: true },
          { name: 'workato_job_id', label: 'Workato job ID', optional: true },
          { name: 'simulate_response_loss', label: 'Simulate one lost acceptance response', type: 'boolean', control_type: 'checkbox', optional: true, default: false,
            convert_input: 'boolean_conversion',
            hint: 'Demo fault only. The first response fails after durable acceptance. Retry with the same business ID.' }
        ]
      end,
      execute: lambda do |_connection, input|
        payload = input.reject { |_key, value| value.nil? || value == '' }
        cents = input['amount_cents'].to_s
        error('Amount must be positive integer USD cents') unless cents.match?(/\A[0-9]+\z/) && cents.to_i > 0
        payload['amount_cents'] = cents.to_i
        if payload.key?('simulate_response_loss')
          flag = payload['simulate_response_loss']
          error('Response-loss flag must be boolean') unless [true, false, 'true', 'false'].include?(flag)
          payload['simulate_response_loss'] = flag == true || flag == 'true'
        end
        post('automatic/requests', payload)
      end,
      output_fields: lambda do |object_definitions|
        object_definitions['refund']
      end
    },
    request_refund: {
      title: 'Request governed refund',
      description: 'Request a <span class="provider">governed synthetic refund</span>',
      help: 'Submits an immutable proposal. A separate human reviewer must approve it. Keep the business request ID stable across retries; amounts are integer USD cents.',
      input_fields: lambda do |_object_definitions|
        [
          { name: 'request_id', label: 'Business request ID', optional: false,
            hint: 'Stable case/action ID, using letters, numbers, hyphen or underscore. Do not regenerate on a retry.' },
          { name: 'payment_id', optional: false },
          { name: 'amount_cents', label: 'Amount in USD cents', type: 'integer', optional: false },
          { name: 'currency', optional: false, default: 'USD', hint: 'Only USD is accepted by this synthetic demo.' },
          { name: 'reason', optional: false, hint: 'Use duplicate_charge or service_failure.' },
          { name: 'workato_recipe_id', label: 'Workato recipe ID', optional: true },
          { name: 'workato_job_id', label: 'Workato job ID', optional: true },
          { name: 'simulate_response_loss', label: 'Simulate one lost acceptance response', type: 'boolean', control_type: 'checkbox', optional: true, default: false,
            convert_input: 'boolean_conversion',
            hint: 'Demo fault only. The first response fails after durable acceptance. Retry with the same business ID.' }
        ]
      end,
      execute: lambda do |_connection, input|
        payload = input.reject { |_key, value| value.nil? || value == '' }
        cents = input['amount_cents'].to_s
        error('Amount must be positive integer USD cents') unless cents.match?(/\A[0-9]+\z/) && cents.to_i > 0
        payload['amount_cents'] = cents.to_i
        if payload.key?('simulate_response_loss')
          flag = payload['simulate_response_loss']
          error('Response-loss flag must be boolean') unless [true, false, 'true', 'false'].include?(flag)
          payload['simulate_response_loss'] = flag == true || flag == 'true'
        end
        post('requests', payload)
      end,
      output_fields: lambda do |object_definitions|
        object_definitions['refund']
      end
    },
    get_refund: {
      title: 'Get refund status',
      description: 'Get <span class="provider">governed refund status</span>',
      help: 'Reads current state without executing a provider mutation.',
      input_fields: lambda do |_object_definitions|
        [{ name: 'request_id', label: 'Business request ID', optional: false }]
      end,
      execute: lambda do |_connection, input|
        id = input['request_id'].to_s
        error('Invalid business request ID') unless id.match?(/\A[a-zA-Z0-9_-]{1,80}\z/)
        get("requests/#{id}")
      end,
      output_fields: lambda do |object_definitions|
        object_definitions['refund']
      end
    },
    resume_refund: {
      title: 'Resume or replay approved refund',
      description: 'Resume or replay a <span class="provider">governed refund</span>',
      help: 'Resumes durable recovery or returns the original result. It cannot approve a pending request or blindly repeat an uncertain provider mutation.',
      input_fields: lambda do |_object_definitions|
        [{ name: 'request_id', label: 'Business request ID', optional: false }]
      end,
      execute: lambda do |_connection, input|
        id = input['request_id'].to_s
        error('Invalid business request ID') unless id.match?(/\A[a-zA-Z0-9_-]{1,80}\z/)
        post("requests/#{id}/execute", {})
      end,
      output_fields: lambda do |object_definitions|
        object_definitions['refund']
      end
    },
    wait_for_refund: {
      title: 'Wait for refund outcome',
      description: 'Wait for a <span class="provider">governed refund outcome</span>',
      help: 'Checks once per minute for up to 30 minutes using durable Workato continuation. Human review happens outside this action; it never approves or executes a refund.',
      input_fields: lambda do |_object_definitions|
        [{ name: 'request_id', label: 'Business request ID', optional: false }]
      end,
      execute: lambda do |_connection, input, _input_schema, _output_schema, continue|
        id = input['request_id'].to_s
        error('Invalid business request ID') unless id.match?(/\A[a-zA-Z0-9_-]{1,80}\z/)
        result = get("requests/#{id}")
        attempts = (continue || {})['attempts'].to_i
        if ['succeeded', 'denied', 'expired', 'unknown'].include?(result['status'])
          result
        elsif attempts >= 30
          error('Still pending. Use Get refund status later with the same business request ID.')
        else
          reinvoke_after(seconds: 60, continue: { attempts: attempts + 1 })
        end
      end,
      output_fields: lambda do |object_definitions|
        object_definitions['refund']
      end
    }
  }
}
