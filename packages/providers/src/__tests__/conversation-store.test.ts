import { describe, it, expect } from 'vitest';
import { ConversationStore } from '../conversation-store.js';

describe('ConversationStore', () => {
  it('begins with a request', () => {
    const store = new ConversationStore();
    store.begin(
      {
        model: 'test',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
        maxTokens: 100,
        stream: true,
      },
      'provider1',
    );

    const state = store.getState();
    expect(state).toBeDefined();
    expect(state!.messages).toHaveLength(1);
    expect(state!.currentProvider).toBe('provider1');
    expect(state!.originalProvider).toBe('provider1');
  });

  it('enriches request with stored messages', () => {
    const store = new ConversationStore();
    store.begin(
      {
        model: 'test',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [{ type: 'function', function: { name: 'test', description: '', parameters: {} } }],
        maxTokens: 100,
        stream: true,
      },
      'p1',
    );

    const enriched = store.enrichRequest({
      model: 'test',
      messages: [],
      tools: [],
      maxTokens: 100,
      stream: true,
    });

    expect(enriched.messages).toHaveLength(1);
    expect(enriched.messages[0]!.content).toBe('hello');
    expect(enriched.tools).toHaveLength(1);
  });

  it('records deltas', () => {
    const store = new ConversationStore();
    store.begin(
      {
        model: 'test',
        messages: [],
        tools: [],
        maxTokens: 100,
        stream: true,
      },
      'p1',
    );

    store.recordDelta({ type: 'text_delta', delta: 'Hello' });
    store.recordDelta({ type: 'text_delta', delta: ' world' });

    store.recordDelta({ type: 'tool_call_delta', index: 0, id: 'call_1', name: 'search', argumentsDelta: '{"q"' });
    store.recordDelta({ type: 'tool_call_delta', index: 0, argumentsDelta: ':"test"}' });
  });

  it('records provider switches', () => {
    const store = new ConversationStore();
    store.begin(
      {
        model: 'test',
        messages: [],
        tools: [],
        maxTokens: 100,
        stream: true,
      },
      'provider1',
    );

    store.recordSwitch('provider1', 'provider2');
    expect(store.getSwitchCount()).toBe(1);
    expect(store.getSwitchHistory()).toHaveLength(1);
    expect(store.getSwitchHistory()[0]!.from).toBe('provider1');
    expect(store.getSwitchHistory()[0]!.to).toBe('provider2');
    expect(store.getState()!.currentProvider).toBe('provider2');
  });

  it('appends messages to state', () => {
    const store = new ConversationStore();
    store.begin(
      {
        model: 'test',
        messages: [],
        tools: [],
        maxTokens: 100,
        stream: true,
      },
      'p1',
    );

    store.appendMessage({ role: 'assistant', content: 'Hello!' });
    expect(store.getState()!.messages).toHaveLength(1);

    store.appendMessage({ role: 'user', content: 'How are you?' });
    expect(store.getState()!.messages).toHaveLength(2);
  });

  it('sets system prompt', () => {
    const store = new ConversationStore();
    store.begin(
      {
        model: 'test',
        messages: [],
        tools: [],
        maxTokens: 100,
        stream: true,
      },
      'p1',
    );

    store.setSystemPrompt('You are a helpful assistant.');
    expect(store.getState()!.systemPrompt).toBe('You are a helpful assistant.');
  });

  it('clears state', () => {
    const store = new ConversationStore();
    store.begin(
      {
        model: 'test',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [],
        maxTokens: 100,
        stream: true,
      },
      'p1',
    );

    expect(store.getState()).toBeDefined();
    store.clear();
    expect(store.getState()).toBeNull();
    expect(store.getSwitchCount()).toBe(0);
  });

  it('returns empty state before begin', () => {
    const store = new ConversationStore();
    expect(store.getState()).toBeNull();
    expect(store.getSwitchCount()).toBe(0);
    expect(store.getSwitchHistory()).toEqual([]);
  });
});
