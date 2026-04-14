import { AdapterRegistry } from '@agentflow/core';
import { claudeCodeAdapter } from '@agentflow/adapter-claude-code';

export const registry = new AdapterRegistry();
registry.register(claudeCodeAdapter);
