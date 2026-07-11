import type { CompletionRequest, TokenUsage, Message } from 'librecode-types';

export interface ConversationState {
  messages: Message[];
  systemPrompt: string;
  tools: unknown[];
  currentProvider: string;
  originalProvider: string;
}

export class ConversationStore {
  private state: ConversationState | null = null;
  private switchHistory: Array<{ from: string; to: string; timestamp: number }> = [];
  private accumulatedContent = '';
  private accumulatedToolCalls: Array<{ index: number; id?: string; name?: string; arguments: string }> = [];

  begin(request: CompletionRequest, providerId: string): void {
    this.state = {
      messages: [...request.messages],
      systemPrompt: '',
      tools: [...request.tools],
      currentProvider: providerId,
      originalProvider: providerId,
    };
    this.switchHistory = [];
    this.accumulatedContent = '';
    this.accumulatedToolCalls = [];
  }

  recordDelta(event: { type: string; delta?: string; index?: number; id?: string; name?: string; argumentsDelta?: string }): void {
    if (event.type === 'text_delta' && event.delta) {
      this.accumulatedContent += event.delta;
    }
    if (event.type === 'tool_call_delta') {
      let existing = this.accumulatedToolCalls.find((tc) => tc.index === event.index);
      if (!existing) {
        existing = { index: event.index!, id: event.id, name: event.name, arguments: '' };
        this.accumulatedToolCalls.push(existing);
      }
      if (event.argumentsDelta) {
        existing.arguments += event.argumentsDelta;
      }
      if (event.id) existing.id = event.id;
      if (event.name) existing.name = event.name;
    }
  }

  recordResponse(content: string, _usage: TokenUsage): void {
    this.accumulatedContent = content;
  }

  recordSwitch(from: string, to: string): void {
    this.switchHistory.push({ from, to, timestamp: Date.now() });
    if (this.state) {
      this.state.currentProvider = to;
    }
  }

  enrichRequest(request: CompletionRequest): CompletionRequest {
    if (!this.state) return request;

    return {
      ...request,
      messages: this.state.messages.length > request.messages.length
        ? this.state.messages
        : request.messages,
      tools: this.state.tools.length > 0 ? this.state.tools as CompletionRequest['tools'] : request.tools,
    };
  }

  appendMessage(message: Message): void {
    if (this.state) {
      this.state.messages.push(message);
    }
  }

  setSystemPrompt(prompt: string): void {
    if (this.state) {
      this.state.systemPrompt = prompt;
    }
  }

  getState(): ConversationState | null {
    return this.state;
  }

  getSwitchCount(): number {
    return this.switchHistory.length;
  }

  getSwitchHistory(): Array<{ from: string; to: string; timestamp: number }> {
    return [...this.switchHistory];
  }

  clear(): void {
    this.state = null;
    this.switchHistory = [];
    this.accumulatedContent = '';
    this.accumulatedToolCalls = [];
  }
}
