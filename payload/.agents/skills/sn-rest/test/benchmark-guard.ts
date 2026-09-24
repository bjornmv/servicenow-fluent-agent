import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
// Test-only guard. Not auto-discovered. Never approves mutations.
export default function (pi: ExtensionAPI) {
  let calls = 0;
  pi.on('before_agent_start', () => { calls = 0; });
  pi.on('tool_call', (event) => {
    if (event.toolName === 'sn_rest' && String((event.input as any).method || 'GET').toUpperCase() !== 'GET')
      return { block: true, reason: 'Benchmark is read-only; no instance mutations authorized.', terminate: true };
    if (++calls > 25) return { block: true, reason: 'Benchmark stopped after 25 tool calls for this question.', terminate: true };
  });
}
