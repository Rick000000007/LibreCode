import { BaseTool } from './base.js';

export class WebFetchTool extends BaseTool {
  name(): string {
    return 'web_fetch';
  }

  description(): string {
    return 'Fetch content from a URL. Returns the text content of the page.';
  }

  parametersSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch',
        },
      },
      required: ['url'],
    };
  }

  async execute(args: Record<string, unknown>, _workingDir: string): Promise<string> {
    const url = args['url'] as string | undefined;
    if (!url) throw new Error("Missing 'url' parameter");

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'rcode/0.1.0',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const content = await response.text();

      const maxLen = 50000;
      if (content.length > maxLen) {
        return `${content.slice(0, maxLen)}\n\n... truncated (${content.length} bytes total)`;
      }

      return content;
    } catch (e: unknown) {
      throw new Error(`Failed to fetch URL: ${(e as Error).message}`);
    }
  }
}
