/**
 * TokenHub (OpenAI-compatible) Chat Wrapper
 *
 * Thin wrapper over the official `openai` SDK for Tencent Cloud TokenHub.
 * TokenHub speaks the OpenAI protocol (Bearer token + custom baseURL), so this
 * file keeps the standard OpenAI request/response shape and only adds Genie's
 * zero-config sandbox proxy wiring on top.
 *
 * @example
 * ```typescript
 * import { createClient } from './hunyuan-chat';
 *
 * const client = createClient();
 * const result = await client.chatCompletions([
 *   { role: 'user', content: 'Hello' }
 * ]);
 * console.log(result.choices[0].message.content);
 * ```
 *
 * @see https://cloud.tencent.com/document/product/1823/131382
 */

import OpenAI from 'openai';

/** Default model on TokenHub. */
export const DEFAULT_MODEL = 'hy3';

/**
 * Client configuration options
 */
export interface HunyuanClientConfig {
  /** TokenHub API Key (Bearer token). Use 'mock_api_key' when routing through the sandbox proxy. */
  apiKey: string;
  /** OpenAI-compatible base URL, ends with /v1. */
  baseURL: string;
  /** Request timeout in milliseconds, default 60000. */
  timeout?: number;
}

/** Chat message role. */
export type ChatRole = 'system' | 'user' | 'assistant';

/** Chat message. */
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Chat completion options. */
export interface ChatOptions {
  /** Model name, defaults to DEFAULT_MODEL. */
  model?: string;
  /** Sampling temperature [0, 2]. */
  temperature?: number;
  /** Nucleus sampling [0, 1]. */
  top_p?: number;
  /** Max tokens to generate. */
  max_tokens?: number;
  /** Random seed for reproducible output. */
  seed?: number;
}

/**
 * HunyuanClient wraps the OpenAI SDK for Tencent Cloud TokenHub.
 */
export class HunyuanClient {
  private client: OpenAI;

  constructor(config: HunyuanClientConfig) {
    if (!config.apiKey) throw new Error('apiKey is required');
    if (!config.baseURL) throw new Error('baseURL is required');
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeout ?? 60_000,
    });
  }

  /**
   * Non-streaming chat completion. Returns the standard OpenAI response.
   *
   * @example
   * ```typescript
   * const result = await client.chatCompletions([
   *   { role: 'user', content: 'Hello, please introduce yourself' }
   * ]);
   * console.log(result.choices[0].message.content);
   * ```
   */
  async chatCompletions(
    messages: ChatMessage[],
    options: ChatOptions = {}
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    if (messages.length === 0) throw new Error('messages cannot be empty');
    return this.client.chat.completions.create({
      model: options.model ?? DEFAULT_MODEL,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      temperature: options.temperature,
      top_p: options.top_p,
      max_tokens: options.max_tokens,
      seed: options.seed,
      stream: false,
    });
  }

  /**
   * Streaming chat completion. Calls onDelta for each text fragment, returns the full text.
   *
   * @example
   * ```typescript
   * const fullText = await client.chatCompletionsStream(
   *   [{ role: 'user', content: 'Tell a story' }],
   *   {},
   *   (delta) => process.stdout.write(delta)
   * );
   * ```
   */
  async chatCompletionsStream(
    messages: ChatMessage[],
    options: ChatOptions = {},
    onDelta?: (text: string) => void
  ): Promise<string> {
    if (messages.length === 0) throw new Error('messages cannot be empty');
    const stream = await this.client.chat.completions.create({
      model: options.model ?? DEFAULT_MODEL,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      temperature: options.temperature,
      top_p: options.top_p,
      max_tokens: options.max_tokens,
      seed: options.seed,
      stream: true,
    });
    let full = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) {
        full += delta;
        onDelta?.(delta);
      }
    }
    return full;
  }

  /**
   * Convenience: single-prompt text generation, returns the reply string.
   *
   * @example
   * ```typescript
   * const text = await client.generateText('Introduce Beijing');
   * ```
   */
  async generateText(prompt: string, options?: ChatOptions): Promise<string> {
    if (!prompt || prompt.trim() === '') {
      throw new Error('prompt cannot be empty');
    }
    const res = await this.chatCompletions([{ role: 'user', content: prompt }], options);
    return res.choices[0]?.message?.content ?? '';
  }
}

/**
 * Create a client with Genie's zero-config sandbox support.
 *
 * - Inside the sandbox with no key → placeholder key + sandbox proxy fake domain; the gateway
 *   swaps in the real API Key and forwards to the real TokenHub base URL.
 * - TOKENHUB_API_KEY set (user brings their own key) → connect directly to TokenHub over https.
 * - Outside the sandbox with no key → empty key, so HunyuanClient throws a clear error.
 *
 * @example
 * ```typescript
 * import { createClient } from './hunyuan-chat';
 *
 * // Zero-config (sandbox)
 * const client = createClient();
 *
 * // Override options
 * const client = createClient({ timeout: 120_000 });
 * ```
 */
export function createClient(config?: Partial<HunyuanClientConfig>): HunyuanClient {
  const isSandbox = process.env.X_IDE_AUTH_PROXY !== undefined;

  // Priority: config > env var > sandbox mock > empty (fail fast outside the sandbox).
  const apiKey =
    config?.apiKey || process.env.TOKENHUB_API_KEY || (isSandbox ? 'mock_api_key' : '');

  // Only route through the sandbox proxy when inside the sandbox AND using the mock key.
  const useSandbox = isSandbox && apiKey === 'mock_api_key';
  const baseURL =
    config?.baseURL ||
    (useSandbox
      ? 'http://tokenhub.openai.auth-proxy.local/v1'
      : process.env.TOKENHUB_BASE_URL || 'https://tokenhub.tencentmaas.com/v1');

  return new HunyuanClient({ apiKey, baseURL, timeout: config?.timeout });
}
