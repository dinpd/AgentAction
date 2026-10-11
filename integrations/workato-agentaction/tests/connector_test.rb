require 'minitest/autorun'

# Exercise connector transformations without network calls or SDK credentials.
class ConnectorTest < Minitest::Test
  def setup
    @connector = eval(File.read(File.expand_path('../connector.rb', __dir__)), binding)
  end

  def post(path, payload)
    { path: path, payload: payload }
  end

  def test_automatic_action_uses_separate_route_with_same_validated_scope
    action = @connector[:actions][:automatic_refund][:execute]
    out = action.call(nil, { 'amount_cents' => '4900', 'request_id' => 'auto-1' })
    assert_equal 'automatic/requests', out[:path]
    assert_equal 4900, out[:payload]['amount_cents']
    assert_equal 'auto-1', out[:payload]['request_id']
    refute out[:payload].key?('approved')
    refute out[:payload].key?('approval_id')
    assert_equal 'requests', @connector[:actions][:request_refund][:execute].call(nil, { 'amount_cents' => '4900' })[:path]
  end

  def get(_path)
    @status
  end

  def error(message)
    raise ArgumentError, message
  end

  def reinvoke_after(seconds:, continue:)
    { suspended: true, seconds: seconds, continue: continue }
  end

  def test_workato_numeric_strings_become_integer_json
    action = @connector[:actions][:request_refund][:execute]
    result = action.call(nil, { 'amount_cents' => '4900', 'request_id' => 'case-1', 'workato_job_id' => nil })
    assert_equal 4900, result[:payload]['amount_cents']
    refute result[:payload].key?('workato_job_id')
    assert_equal true, action.call(nil, { 'amount_cents' => '4900', 'simulate_response_loss' => 'true' })[:payload]['simulate_response_loss']
    assert_equal false, action.call(nil, { 'amount_cents' => '4900', 'simulate_response_loss' => 'false' })[:payload]['simulate_response_loss']
    %w[49.5 -1 1e3 abc].each do |amount|
      assert_raises(ArgumentError) { action.call(nil, { 'amount_cents' => amount }) }
    end
  end

  def test_wait_suspends_without_executing_or_approving
    action = @connector[:actions][:wait_for_refund][:execute]
    @status = { 'status' => 'pending' }
    result = action.call(nil, { 'request_id' => 'case-1' }, nil, nil, nil)
    assert_equal({ suspended: true, seconds: 60, continue: { attempts: 1 } }, result)
    assert_raises(ArgumentError) { action.call(nil, { 'request_id' => 'case-1' }, nil, nil, { 'attempts' => 30 }) }
    @status = { 'status' => 'succeeded', 'qualified_success' => true }
    assert_equal @status, action.call(nil, { 'request_id' => 'case-1' }, nil, nil, { 'attempts' => 1 })
  end
end
