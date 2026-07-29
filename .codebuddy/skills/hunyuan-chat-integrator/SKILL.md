---
name: hunyuan-chat-integrator
description: Integrate Tencent Cloud TokenHub LLM (OpenAI-compatible) for text generation and conversations. Use this skill when the application needs AI chatbots, content generation, code assistance, or streaming text output. Triggers on requests for chat completion, AI conversation, or content creation.
_meta_type: sdk
---

# Tencent Cloud TokenHub LLM SDK Integration

TokenHub is Tencent Cloud's LLM service platform. It is fully OpenAI-compatible
(Bearer token auth + custom `base_url`), so this skill uses the official `openai`
SDK directly.

## Scenarios

- **Text Generation**: Generate high-quality text content based on prompts
- **Conversation Systems**: Build intelligent chatbots and customer service systems
- **Content Creation**: Automatically generate articles, summaries, translations
- **Code Assistance**: Code generation, explanation, and optimization
- **Streaming Output**: Real-time content generation for improved UX

**Not recommended for:**
- Direct frontend browser use (credential security issues)
- Real-time voice conversations
- Scenarios requiring extremely low latency (< 100ms)

## Setup

### 1. Install Dependencies

```bash
npm install openai
```

### 2. Copy SDK Wrapper

Read `lib/hunyuan-chat.ts` from this skill and copy it to the project, then use it directly.

## Configuration

### Zero Configuration (Default)

Genie provides default zero-configuration support. When no `TOKENHUB_API_KEY` is
set, the client routes requests through the sandbox proxy fake domain
`tokenhub.openai.auth-proxy.local` with a placeholder key. Genie's gateway holds
the real API Key and forwards to TokenHub. **No environment variables required.**

```typescript
import { createClient } from './lib/hunyuan-chat';
const client = createClient();
```

### Custom Configuration (Optional)

To use your own TokenHub credentials, set:

```env
TOKENHUB_API_KEY=your-tokenhub-api-key
# Optional, defaults to the official endpoint:
TOKENHUB_BASE_URL=https://tokenhub.tencentmaas.com/v1
```

When `TOKENHUB_API_KEY` is set, the client connects directly to TokenHub over
https instead of the sandbox proxy.

**Obtaining an API Key:**
1. Visit [TokenHub Console - API Key Management](https://console.cloud.tencent.com/tokenhub/apikey)
2. Create a new API Key
3. Copy it into `TOKENHUB_API_KEY`

## Quick Start

### Basic Usage

```typescript
import { createClient } from './lib/hunyuan-chat';

const client = createClient();

// Single-turn conversation
const result = await client.chatCompletions([
  { role: 'user', content: 'Hello, please introduce yourself' }
]);
console.log(result.choices[0].message.content);

// With parameters
const result = await client.chatCompletions(
  [{ role: 'user', content: 'Write a poem' }],
  { temperature: 0.8, top_p: 0.9 }
);
```

### Multi-turn Conversation

```typescript
const result = await client.chatCompletions([
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hello! How can I help you?' },
  { role: 'user', content: 'What can you do?' }
]);
```

### Streaming Output

```typescript
const fullText = await client.chatCompletionsStream(
  [{ role: 'user', content: 'Tell a story' }],
  {},
  (delta) => process.stdout.write(delta)
);
```

### Simple Text Generation

```typescript
const text = await client.generateText('Introduce Beijing');

// With parameters
const text = await client.generateText('Write a poem', { temperature: 0.9 });
```

## Architecture Integration

### Service Layer Pattern (Recommended)

```typescript
// src/services/ai.service.ts
import { createClient } from '../lib/hunyuan-chat';

export class AIService {
  private client = createClient();

  async generateText(prompt: string): Promise<string> {
    return this.client.generateText(prompt);
  }

  async chatWithHistory(
    userMessage: string,
    history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    const res = await this.client.chatCompletions([
      ...history,
      { role: 'user', content: userMessage }
    ]);
    return res.choices[0].message.content ?? '';
  }
}
```

## Security Best Practices

1. **Never commit credentials**: Add `.env` to `.gitignore`
2. **Use environment variables**: Store `TOKENHUB_API_KEY` via environment variables
3. **Rotate credentials regularly**: Recommend rotating the API Key periodically

## Troubleshooting

**Authentication Errors**
- Verify `TOKENHUB_API_KEY` if using custom configuration
- Confirm the API Key is enabled in the TokenHub Console

**Network Errors**
- In the sandbox, confirm access to `tokenhub.openai.auth-proxy.local`
- With a custom key, confirm access to `tokenhub.tencentmaas.com`
- Try setting a longer timeout

**Parameter Errors**
- Ensure the messages array format is correct
- Check temperature [0.0, 2.0] and top_p [0.0, 1.0] ranges

## Resources

- **SDK Wrapper Source**: `lib/hunyuan-chat.ts`
- **TokenHub Migration Guide**: https://cloud.tencent.com/document/product/1823/131382
- **TokenHub Console**: https://console.cloud.tencent.com/tokenhub
- **OpenAI SDK (Node.js)**: https://github.com/openai/openai-node
