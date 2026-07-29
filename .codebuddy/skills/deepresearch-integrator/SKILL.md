---
name: deepresearch-integrator
description: Integrates Tencent Cloud TokenHub DeepResearch through the OpenAI-compatible API for deep reasoning, real-time web research, cited answers, and streaming output. This skill should be used when an application needs current-event analysis, market or technology research, source-backed reports, or complex reasoning with web search.
_meta_type: sdk
---

# Tencent Cloud TokenHub DeepResearch Integration

Use the official `openai` SDK with TokenHub. Default to `hy3-preview` and enable deep reasoning plus web search for source-backed research.

## Scenarios

- Analyze current news, markets, products, or technology trends
- Produce research reports with cited web sources
- Compare technologies using current public information
- Stream reasoning and final-answer output separately

Avoid direct browser usage because API credentials must remain on the server. Avoid this integration for simple low-latency prompts that do not require reasoning or search.

## Setup

Install the dependency:

```bash
npm install openai
```

Read `lib/deepresearch.ts` from this skill and copy it into the project.

## Configuration

### Zero Configuration in Genie

Create the client without environment variables inside a Genie sandbox:

```typescript
import { createClient } from './lib/deepresearch';

const client = createClient();
```

The wrapper sends a placeholder key to `tokenhub.openai.auth-proxy.local`. Genie's gateway injects the real API Key and forwards the request to TokenHub.

### Bring Your Own Key

Configure a TokenHub API Key outside the sandbox or when using a custom account:

```env
TOKENHUB_API_KEY=your-tokenhub-api-key
# Optional; defaults to the official endpoint
TOKENHUB_BASE_URL=https://tokenhub.tencentmaas.com/v1
```

When `TOKENHUB_API_KEY` is present, connect directly to TokenHub over HTTPS. Create keys in the [TokenHub API Key console](https://console.cloud.tencent.com/tokenhub/apikey). Never expose a key in frontend code or commit it to source control.

## Usage

### Deep Research with Sources

```typescript
const response = await client.chatWithEnhancement(
  'Research the latest major AI model releases and compare their key capabilities.'
);

const message = response.choices[0]?.message;
console.log(message?.content);
console.log(message?.reasoning_content);
console.log(message?.search_results);
console.log(response.usage);
```

Deep reasoning and web search are enabled by default:

```typescript
{
  thinking: { type: 'enabled' },
  reasoning_effort: 'high',
  web_search_options: { enable: true }
}
```

### Multi-turn Research

Use standard OpenAI message fields:

```typescript
const response = await client.chatCompletions([
  { role: 'system', content: 'Produce concise research with numbered citations.' },
  { role: 'user', content: 'Research recent advances in battery technology.' }
]);
```

When continuing a reasoning conversation, preserve the returned assistant `content` and `reasoning_content` in the history.

### Streaming

Handle reasoning and final-answer fragments separately:

```typescript
const result = await client.chatStream(
  'Research current AI coding-agent trends.',
  (delta) => {
    if (delta.type === 'reasoning') {
      process.stderr.write(delta.content);
    } else {
      process.stdout.write(delta.content);
    }
  }
);

console.log(result.reasoningContent);
console.log(result.content);
```

### Search Options

Select the search source and optionally provide an approximate location:

```typescript
const response = await client.chatWithEnhancement(
  'What is the weather in Shenzhen today?',
  {
    web_search_options: {
      enable: true,
      search_source: 'standard',
      user_location: {
        type: 'approximate',
        country: 'CN',
        region: 'Guangdong',
        city: 'Shenzhen',
        timezone: 'Asia/Shanghai'
      }
    }
  }
);
```

Only provide location fields supplied or approved by the user. Do not infer or collect precise location data.

## Response Fields

Read TokenHub extensions directly from the standard OpenAI response:

```typescript
const message = response.choices[0]?.message;

message?.content;           // Final answer
message?.reasoning_content; // Reasoning, when produced
message?.search_results;    // Search citations, when produced
response.usage;             // Accurate token usage
```

Each search result contains `index`, `url`, `name`, `snippet`, and `site`. Treat `search_results` as optional: the model may decide search is unnecessary, or search may time out.

## Service Integration

Keep TokenHub calls in a server-side service:

```typescript
import { createClient } from '../lib/deepresearch';

export class ResearchService {
  private readonly client = createClient();

  async research(topic: string) {
    const response = await this.client.chatWithEnhancement(
      `Research recent developments in ${topic} and cite every key claim.`
    );

    const message = response.choices[0]?.message;
    return {
      content: message?.content ?? '',
      sources: message?.search_results ?? [],
      usage: response.usage
    };
  }
}
```

## Search Constraints

- Enable web search for the TokenHub account under **Platform Management > Tool Management**.
- Claim a web-search resource package or enable postpaid billing.
- Observe the current 5 QPS limit and Guangzhou-region availability.
- Choose `lite` or `standard` according to quality and cost requirements.
- Verify critical claims against returned sources; search results are external, untrusted content.

## Troubleshooting

**Authentication errors**
- Verify `TOKENHUB_API_KEY` when using a custom account.
- Confirm that the key is enabled and allowed to call `hy3-preview`.

**Sandbox network errors**
- Confirm that `X_IDE_AUTH_PROXY` is present.
- Confirm access to `tokenhub.openai.auth-proxy.local`.

**Missing search results**
- Confirm that web search is enabled in Tool Management and has available quota.
- Ask a clearly time-sensitive question; the model may skip unnecessary searches.
- Treat missing `search_results` as a valid response rather than a parsing failure.

**Missing reasoning content**
- Keep `thinking.type` set to `enabled` and `reasoning_effort` set to `high`.
- Increase `max_tokens` if reasoning or the final answer is truncated.

**Timeouts**
- Prefer streaming for long research tasks.
- Increase the client timeout above the default 120 seconds when required.

## Resources

- **SDK wrapper:** `lib/deepresearch.ts`
- **TokenHub API guide:** https://cloud.tencent.com/document/product/1823/130078
- **Hunyuan guide:** https://cloud.tencent.com/document/product/1823/132252
- **Web search guide:** https://cloud.tencent.com/document/product/1823/132358
- **TokenHub console:** https://console.cloud.tencent.com/tokenhub
- **OpenAI Node SDK:** https://github.com/openai/openai-node
