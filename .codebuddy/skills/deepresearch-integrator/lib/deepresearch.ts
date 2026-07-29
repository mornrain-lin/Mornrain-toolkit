/**
 * TokenHub (OpenAI-compatible) DeepResearch Wrapper
 *
 * Thin wrapper over the official `openai` SDK for Tencent Cloud TokenHub.
 * It keeps the standard OpenAI request and response shapes while enabling
 * deep reasoning, web search, and Genie's zero-config sandbox proxy.
 *
 * @example
 * ```typescript
 * import { createClient } from './deepresearch';
 *
 * const client = createClient();
 * const result = await client.chatWithEnhancement('What changed in AI this week?');
 * console.log(result.choices[0]?.message.content);
 * console.log(result.choices[0]?.message.search_results);
 * ```
 *
 * @see https://cloud.tencent.com/document/product/1823/132252
 * @see https://cloud.tencent.com/document/product/1823/132358
 */

import OpenAI from 'openai';

/** Default DeepResearch model on TokenHub. */
export const DEFAULT_MODEL = 'hy3-preview';

/** Client configuration options. */
export interface DeepResearchClientConfig {
  /** TokenHub API Key. Use 'mock_api_key' when routing through the sandbox proxy. */
  apiKey: string;
  /** OpenAI-compatible base URL, ending with /v1. */
  baseURL: string;
  /** Request timeout in milliseconds, default 120000. */
  timeout?: number;
}

/** Approximate user location for location-aware web search. */
export interface UserLocation {
  type: 'approximate';
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
}

/** TokenHub web search options. */
export interface WebSearchOptions {
  enable: boolean;
  search_source?: 'lite' | 'standard';
  user_location?: UserLocation;
}

/** TokenHub web search citation. */
export interface SearchResult {
  index: number;
  url: string;
  name: string;
  snippet: string;
  site: string;
}

/** TokenHub thinking configuration. */
export interface ThinkingOptions {
  type: 'enabled';
}

/** OpenAI message with TokenHub reasoning context support. */
export type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam & {
  reasoning_content?: string;
};

/** DeepResearch completion options. */
export interface ChatOptions {
  /** Model name, defaults to DEFAULT_MODEL. */
  model?: string;
  /** Sampling temperature [0, 2]. */
  temperature?: number;
  /** Nucleus sampling [0, 1]. */
  top_p?: number;
  /** Maximum tokens to generate. */
  max_tokens?: number;
  /** Random seed for reproducible output. */
  seed?: number;
  /** Thinking mode, enabled by default. */
  thinking?: ThinkingOptions;
  /** Reasoning depth, defaults to high. */
  reasoning_effort?: 'low' | 'high';
  /** Web search configuration, enabled by default. */
  web_search_options?: WebSearchOptions;
}

/** OpenAI assistant message with TokenHub response extensions. */
export type DeepResearchMessage = OpenAI.Chat.Completions.ChatCompletionMessage & {
  reasoning_content?: string;
  search_results?: SearchResult[];
};

/** Standard OpenAI completion with TokenHub response extensions. */
export type DeepResearchCompletion = OpenAI.Chat.Completions.ChatCompletion & {
  choices: Array<
    OpenAI.Chat.Completions.ChatCompletion['choices'][number] & {
      message: DeepResearchMessage;
    }
  >;
};

/** A reasoning or final-answer fragment from a streaming response. */
export interface StreamDelta {
  type: 'reasoning' | 'content';
  content: string;
}

/** Aggregated text from a streaming response. */
export interface StreamResult {
  reasoningContent: string;
  content: string;
}

type TokenHubStreamDelta = OpenAI.Chat.Completions.ChatCompletionChunk['choices'][number]['delta'] & {
  reasoning_content?: string;
};

type TokenHubRequest = {
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  seed?: number;
  thinking: ThinkingOptions;
  reasoning_effort: 'low' | 'high';
  web_search_options: WebSearchOptions;
};

/** TokenHub client for deep reasoning and search-enhanced conversations. */
export class DeepResearchClient {
  private readonly client: OpenAI;

  constructor(config: DeepResearchClientConfig) {
    if (!config.apiKey) throw new Error('apiKey is required');
    if (!config.baseURL) throw new Error('baseURL is required');

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeout ?? 120_000,
    });
  }

  private buildRequest(messages: ChatMessage[], options: ChatOptions): TokenHubRequest {
    return {
      model: options.model ?? DEFAULT_MODEL,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      temperature: options.temperature,
      top_p: options.top_p,
      max_tokens: options.max_tokens,
      seed: options.seed,
      thinking: options.thinking ?? { type: 'enabled' },
      reasoning_effort: options.reasoning_effort ?? 'high',
      web_search_options: options.web_search_options ?? { enable: true },
    };
  }

  /** Return a standard OpenAI completion with reasoning_content and search_results extensions. */
  async chatCompletions(
    messages: ChatMessage[],
    options: ChatOptions = {}
  ): Promise<DeepResearchCompletion> {
    if (messages.length === 0) throw new Error('messages cannot be empty');

    const request = {
      ...this.buildRequest(messages, options),
      stream: false as const,
    };
    const response = await this.client.chat.completions.create(
      request as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
    );

    return response as DeepResearchCompletion;
  }

  /** Stream reasoning and final-answer fragments, then return their aggregated text. */
  async chatCompletionsStream(
    messages: ChatMessage[],
    options: ChatOptions = {},
    onDelta?: (delta: StreamDelta) => void
  ): Promise<StreamResult> {
    if (messages.length === 0) throw new Error('messages cannot be empty');

    const request = {
      ...this.buildRequest(messages, options),
      stream: true as const,
      stream_options: { include_usage: true },
    };
    const stream = await this.client.chat.completions.create(
      request as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
    );

    let reasoningContent = '';
    let content = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta as TokenHubStreamDelta | undefined;
      const reasoningDelta = delta?.reasoning_content ?? '';
      const contentDelta = delta?.content ?? '';

      if (reasoningDelta) {
        reasoningContent += reasoningDelta;
        onDelta?.({ type: 'reasoning', content: reasoningDelta });
      }
      if (contentDelta) {
        content += contentDelta;
        onDelta?.({ type: 'content', content: contentDelta });
      }
    }

    return { reasoningContent, content };
  }

  /** Run a single-prompt DeepResearch request with web search enabled. */
  async chatWithEnhancement(
    prompt: string,
    options: ChatOptions = {}
  ): Promise<DeepResearchCompletion> {
    this.validatePrompt(prompt);

    return this.chatCompletions([{ role: 'user', content: prompt }], {
      ...options,
      web_search_options: {
        ...(options.web_search_options ?? {}),
        enable: true,
      },
    });
  }

  /** Stream a single-prompt DeepResearch request. */
  async chatStream(
    prompt: string,
    onDelta?: (delta: StreamDelta) => void,
    options: ChatOptions = {}
  ): Promise<StreamResult> {
    this.validatePrompt(prompt);
    return this.chatCompletionsStream([{ role: 'user', content: prompt }], options, onDelta);
  }

  /** Estimate tokens only; use response.usage for accurate usage. */
  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private validatePrompt(prompt: string): void {
    if (!prompt || prompt.trim() === '') {
      throw new Error('prompt cannot be empty');
    }
  }
}

/**
 * Create a client with Genie's zero-config sandbox support.
 *
 * - Sandbox without a key: route a placeholder key through the sandbox proxy.
 * - TOKENHUB_API_KEY set: connect directly to TokenHub.
 * - Outside the sandbox without a key: fail fast with a clear error.
 */
export function createClient(config?: Partial<DeepResearchClientConfig>): DeepResearchClient {
  const isSandbox = process.env.X_IDE_AUTH_PROXY !== undefined;
  const apiKey =
    config?.apiKey || process.env.TOKENHUB_API_KEY || (isSandbox ? 'mock_api_key' : '');
  const useSandbox = isSandbox && apiKey === 'mock_api_key';
  const baseURL =
    config?.baseURL ||
    (useSandbox
      ? 'http://tokenhub.openai.auth-proxy.local/v1'
      : process.env.TOKENHUB_BASE_URL || 'https://tokenhub.tencentmaas.com/v1');

  return new DeepResearchClient({ apiKey, baseURL, timeout: config?.timeout });
}
