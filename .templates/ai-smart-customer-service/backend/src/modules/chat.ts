import { Router, Request, Response } from 'express'
import { createClient, ChatMessage } from '../lib/hunyuan-chat'
import { logger } from '../config/logger'

export const chatRouter = Router()

// Create TokenHub (OpenAI-compatible) chat client instance
const chatClient = createClient({ timeout: 120_000 })

// System prompt for customer service
const SYSTEM_PROMPT = `你是一个专业、友好的AI智能客服助手。你的职责是：
1. 热情友好地回答用户的问题
2. 提供准确、有帮助的信息
3. 如果不确定答案，诚实地告知用户
4. 使用简洁清晰的语言回复
5. 在适当的时候提供额外的帮助或建议

请始终保持专业、耐心和礼貌的态度。`

interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatRequest {
  message: string
  history?: ChatHistoryMessage[]
}

interface ChatResponse {
  success: boolean
  data?: {
    reply: string
    usage?: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    }
  }
  error?: string
}

/**
 * Build the messages array with system prompt and conversation history.
 * History is capped to the last 10 messages to prevent token overflow.
 */
function buildMessages(message: string, history: ChatHistoryMessage[]): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]

  const recentHistory = history.slice(-10)
  for (const msg of recentHistory) {
    messages.push({ role: msg.role, content: msg.content })
  }

  messages.push({ role: 'user', content: message.trim() })
  return messages
}

/**
 * POST /api/chat
 * Send a message and get AI response
 */
chatRouter.post('/', async (req: Request, res: Response) => {
  const startTime = Date.now()

  try {
    const { message, history = [] } = req.body as ChatRequest

    if (!message || typeof message !== 'string' || message.trim() === '') {
      res.status(400).json({
        success: false,
        error: '消息内容不能为空'
      } as ChatResponse)
      return
    }

    const messages = buildMessages(message, history)

    logger.info({ messageCount: messages.length }, 'Processing chat request')

    // Call TokenHub (OpenAI-compatible) API
    const result = await chatClient.chatCompletions(messages, {
      temperature: 0.7,
      top_p: 0.9
    })

    const reply = result.choices[0]?.message?.content || '抱歉，我暂时无法回答您的问题。'
    const usage = result.usage

    const responseTime = Date.now() - startTime
    logger.info({ responseTime, tokens: usage?.total_tokens }, 'Chat response generated')

    res.json({
      success: true,
      data: {
        reply,
        usage: usage
          ? {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens
            }
          : undefined
      }
    } as ChatResponse)
  } catch (error: any) {
    logger.error({ error: error.message }, 'Chat API error')

    res.status(500).json({
      success: false,
      error: '服务暂时不可用，请稍后再试'
    } as ChatResponse)
  }
})

/**
 * POST /api/chat/stream
 * Send a message and get streaming AI response
 */
chatRouter.post('/stream', async (req: Request, res: Response) => {
  try {
    const { message, history = [] } = req.body as ChatRequest

    if (!message || typeof message !== 'string' || message.trim() === '') {
      res.status(400).json({
        success: false,
        error: '消息内容不能为空'
      })
      return
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const messages = buildMessages(message, history)

    logger.info({ messageCount: messages.length }, 'Processing streaming chat request')

    // Call TokenHub (OpenAI-compatible) streaming API
    await chatClient.chatCompletionsStream(
      messages,
      { temperature: 0.7, top_p: 0.9 },
      (delta) => {
        if (delta) {
          res.write(`data: ${JSON.stringify({ content: delta })}\n\n`)
        }
      }
    )

    // Send done signal
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
    res.end()
  } catch (error: any) {
    logger.error({ error: error.message }, 'Streaming chat API error')

    res.write(`data: ${JSON.stringify({ error: '服务暂时不可用' })}\n\n`)
    res.end()
  }
})
