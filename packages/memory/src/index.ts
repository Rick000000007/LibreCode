import type { Message } from '@rcode/types';
import { countMessagesTokens, safeTruncate } from '@rcode/utils';

export class ContextManager {
  private maxTokens: number;
  private compactThreshold: number;
  private recentMessageCount: number;

  constructor(maxTokens: number, compactThreshold: number) {
    this.maxTokens = maxTokens;
    this.compactThreshold = compactThreshold;
    this.recentMessageCount = 6;
  }

  needsCompaction(messages: Message[]): boolean {
    const current = this.countTokens(messages);
    const threshold = Math.floor(this.maxTokens * this.compactThreshold);
    return current > threshold;
  }

  countTokens(messages: Message[]): number {
    return countMessagesTokens(messages);
  }

  compact(messages: Message[]): Message[] {
    if (messages.length < 4) {
      return [...messages];
    }

    const systemMsg = messages[0];
    const recentStart = Math.max(1, messages.length - this.recentMessageCount * 2);
    const oldMessages = messages.slice(1, recentStart);
    const recentMessages = messages.slice(recentStart);

    const summary = this.summarizeMessages(oldMessages);

    const result: Message[] = [];
    if (systemMsg) {
      result.push(systemMsg);
    }

    if (summary) {
      result.push({
        role: 'user',
        content: `[Conversation summary - earlier context]\n${summary}`,
      });
    }

    result.push(...recentMessages);

    const compacted = result;
    let rounds = 0;
    while (this.needsCompaction(compacted) && rounds < 5) {
      const longest = compacted.reduce((a, b) =>
        (a.content?.length ?? 0) > (b.content?.length ?? 0) ? a : b,
      );
      longest.content = longest.content
        ? longest.content.slice(0, Math.floor(longest.content.length / 2))
        : '';
      rounds++;
    }

    return compacted;
  }

  private summarizeMessages(messages: Message[]): string | null {
    if (messages.length === 0) return null;

    const parts: string[] = [];

    const userMessages = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content ?? '');

    if (userMessages.length > 0) {
      parts.push(`Primary request: ${safeTruncate(userMessages[0] ?? '', 300)}`);
    }

    if (userMessages.length > 1) {
      const later = userMessages
        .slice(1)
        .map((m, i) => `${i + 1}. ${safeTruncate(m, 200)}`)
        .join('\n');
      parts.push(`Subsequent requests:\n${later}`);
    }

    const toolMessages = messages.filter((m) => m.role === 'tool').map((m) => m.content ?? '');
    if (toolMessages.length > 0) {
      const toolSummary = toolMessages
        .slice(0, 15)
        .map((m) => `- ${safeTruncate(m, 150)}`)
        .join('\n');
      parts.push(`Key tool results (${toolMessages.length} total):\n${toolSummary}`);
    }

    const assistantActions = messages
      .filter((m) => m.role === 'assistant')
      .filter((m) => m.tool_calls || m.content)
      .map((m) => {
        const desc: string[] = [];
        if (m.tool_calls) {
          for (const tc of m.tool_calls) {
            desc.push(`Called ${tc.function.name}(${safeTruncate(tc.function.arguments, 80)})`);
          }
        }
        if (m.content) {
          desc.push(safeTruncate(m.content, 150));
        }
        return desc.join('; ');
      });

    if (assistantActions.length > 0) {
      const actionLines = assistantActions
        .map((a, i) => `${i + 1}. ${a}`)
        .join('\n');
      parts.push(`Actions taken:\n${actionLines}`);
    }

    const decisions: string[] = [];
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.content) {
        const content = msg.content;
        if (
          content.includes('TODO') ||
          content.includes('decision') ||
          content.includes('important') ||
          content.includes('NOTE') ||
          content.includes('fixed') ||
          content.includes('completed')
        ) {
          decisions.push(safeTruncate(content, 120));
        }
      }
    }
    if (decisions.length > 0) {
      parts.push(`Key decisions/notes:\n${decisions.join('\n')}`);
    }

    if (parts.length === 0) return null;
    return parts.join('\n\n');
  }
}
