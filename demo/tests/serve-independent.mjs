import { startIndependentStack } from './independent-stack.mjs';
const stack = await startIndependentStack();
console.log('Shared-authority demo: ' + stack.origin('frontend') + '/shared-authority');
console.log('Independent services: ' + ['authority', 'payments', 'support'].map(name => name + '=' + stack.origin(name)).join(', '));
console.log('Local state/logs: ' + stack.directory);
process.once('SIGINT', async () => { await stack.close(); process.exit(0); });
process.once('SIGTERM', async () => { await stack.close(); process.exit(0); });
