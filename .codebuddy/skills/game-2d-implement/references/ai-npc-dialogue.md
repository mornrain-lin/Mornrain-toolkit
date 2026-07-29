# AI NPC Dialogue System Integration

This document provides the complete implementation pattern for integrating AI-powered NPC dialogue into Phaser games.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Phaser Game (Frontend)                       │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │ DialogueManager │───▶│  fetch(/api/npc)│                     │
│  │   (Phaser UI)   │    │   SSE Stream    │                     │
│  └─────────────────┘    └────────┬────────┘                     │
└────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Express Backend                              │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │ npc-dialogue.ts │───▶│ hunyuan-chat.ts │                     │
│  │   (API Route)   │    │   (SDK封装)     │                     │
│  └─────────────────┘    └────────┬────────┘                     │
└────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                     TokenHub (OpenAI-compatible)                │
└─────────────────────────────────────────────────────────────────┘
```

## File Structure

```
/
├── backend/
│   └── src/
│       ├── lib/
│       │   └── hunyuan-chat.ts      # TokenHub (OpenAI-compatible) wrapper
│       ├── modules/
│       │   └── npc-dialogue.ts      # NPC dialogue API
│       └── types/
│           └── npc.types.ts         # Type definitions
│
└── game-basic/
    └── src/
        ├── systems/
        │   └── DialogueManager.js   # Phaser dialogue UI
        └── data/
            └── npcs/
                └── *.json           # NPC character configs
```

---

## Backend Implementation

### 1. hunyuan-chat.ts (TokenHub Wrapper)

**Do NOT hand-write a model-platform client here.** Reuse the shared TokenHub
(OpenAI-compatible) wrapper maintained by the `hunyuan-chat-integrator` skill so
the game link never maintains a second model-platform client.

1. Install the OpenAI SDK in the backend:

   ```bash
   cd backend && npm install openai
   ```

2. Copy the shared wrapper into the project:

   ```bash
   cp .codebuddy/skills/hunyuan-chat-integrator/lib/hunyuan-chat.ts backend/src/lib/hunyuan-chat.ts
   ```

The wrapper exposes exactly what the NPC route needs:

- `createClient(config?)` — zero-config sandbox support (no env vars needed inside Genie).
- `chatCompletions(messages, options)` — non-streaming; returns the standard OpenAI response, read the reply from `result.choices[0]?.message?.content`.
- `chatCompletionsStream(messages, options, onDelta)` — streaming; `onDelta(text)` receives each plain text fragment.
- `ChatMessage` — `{ role: 'system' | 'user' | 'assistant'; content: string }`.
- `DEFAULT_MODEL` — current baseline model (`hy3`). The route relies on this default; do NOT hardcode a model name.

**Configuration (handled entirely by the shared wrapper):**

- Zero-config in the Genie sandbox: requests route through `http://tokenhub.openai.auth-proxy.local/v1` with a placeholder key; the gateway swaps in the real key.
- Bring-your-own key (optional): set `TOKENHUB_API_KEY`, and optionally `TOKENHUB_BASE_URL`.

See `.codebuddy/skills/hunyuan-chat-integrator/SKILL.md` for the full wrapper docs.

### 2. npc.types.ts (Type Definitions)

```typescript
/**
 * NPC Dialogue Type Definitions
 * Copy to: backend/src/types/npc.types.ts
 */

export interface NPCConfig {
  id: string;
  name: string;
  avatar?: string;
  systemPrompt: string;
  greeting: string;
  personality?: string;
  knowledge?: string[];
  location?: { x: number; y: number };
}

export interface DialogueMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface DialogueRequest {
  npcId: string;
  message: string;
  history?: DialogueMessage[];
  gameContext?: {
    playerLocation?: { x: number; y: number };
    currentQuest?: string;
    inventory?: string[];
    gameTime?: string;
  };
}

export interface DialogueResponse {
  success: boolean;
  data?: {
    reply: string;
    npcId: string;
    emotion?: 'happy' | 'sad' | 'angry' | 'neutral' | 'excited';
    action?: {
      type: 'move_to' | 'give_item' | 'start_quest' | 'none';
      payload?: any;
    };
  };
  error?: string;
}
```

### 3. npc-dialogue.ts (API Endpoints)

```typescript
/**
 * NPC Dialogue API Module
 * Copy to: backend/src/modules/npc-dialogue.ts
 */

import { Router, Request, Response } from 'express';
import { createClient, ChatMessage } from '../lib/hunyuan-chat';
import { logger } from '../config/logger';
import { NPCConfig, DialogueRequest, DialogueResponse } from '../types/npc.types';

export const npcDialogueRouter = Router();

// TokenHub (OpenAI-compatible) client instance
const hunyuanClient = createClient({ timeout: 120 });

// NPC configurations - loaded from JSON files in production
// For demo, using in-memory config
const npcConfigs: Map<string, NPCConfig> = new Map();

// Register NPC config
export function registerNPC(config: NPCConfig): void {
  npcConfigs.set(config.id, config);
  logger.info({ npcId: config.id }, 'NPC registered');
}

// Build system prompt with game context
function buildSystemPrompt(npc: NPCConfig, gameContext?: DialogueRequest['gameContext']): string {
  let prompt = npc.systemPrompt;
  
  if (gameContext) {
    prompt += '\n\n【当前游戏状态】';
    if (gameContext.playerLocation) {
      prompt += `\n- 玩家位置: (${gameContext.playerLocation.x}, ${gameContext.playerLocation.y})`;
    }
    if (gameContext.currentQuest) {
      prompt += `\n- 当前任务: ${gameContext.currentQuest}`;
    }
    if (gameContext.inventory?.length) {
      prompt += `\n- 玩家物品: ${gameContext.inventory.join(', ')}`;
    }
  }
  
  prompt += '\n\n【回复规则】';
  prompt += '\n- 保持角色设定，用符合角色性格的语气回复';
  prompt += '\n- 回复简洁有趣，控制在100字以内';
  prompt += '\n- 如需引导玩家前往某处，请明确给出坐标提示';
  
  return prompt;
}

/**
 * POST /api/npc/dialogue
 * NPC dialogue endpoint (non-streaming)
 */
npcDialogueRouter.post('/dialogue', async (req: Request, res: Response) => {
  try {
    const { npcId, message, history = [], gameContext } = req.body as DialogueRequest;

    if (!npcId || !message?.trim()) {
      res.status(400).json({
        success: false,
        error: 'npcId and message are required'
      } as DialogueResponse);
      return;
    }

    const npc = npcConfigs.get(npcId);
    if (!npc) {
      res.status(404).json({
        success: false,
        error: `NPC not found: ${npcId}`
      } as DialogueResponse);
      return;
    }

    // Build messages array
    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(npc, gameContext) }
    ];

    // Add conversation history (limit to last 6 messages)
    const recentHistory = history.slice(-6);
    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Add current user message
    messages.push({ role: 'user', content: message.trim() });

    logger.info({ npcId, messageCount: messages.length }, 'Processing NPC dialogue');

    // Call TokenHub (OpenAI-compatible) API
    const result = await hunyuanClient.chatCompletions(messages, {
      temperature: 0.8,  // Higher for more creative responses
      top_p: 0.9
    });

    const reply = result.choices[0]?.message?.content || npc.greeting;

    res.json({
      success: true,
      data: {
        reply,
        npcId,
        emotion: 'neutral'
      }
    } as DialogueResponse);

  } catch (error: any) {
    logger.error({ error: error.message }, 'NPC dialogue error');
    res.status(500).json({
      success: false,
      error: '对话服务暂时不可用'
    } as DialogueResponse);
  }
});

/**
 * POST /api/npc/dialogue/stream
 * NPC dialogue endpoint (streaming)
 */
npcDialogueRouter.post('/dialogue/stream', async (req: Request, res: Response) => {
  try {
    const { npcId, message, history = [], gameContext } = req.body as DialogueRequest;

    if (!npcId || !message?.trim()) {
      res.status(400).json({ success: false, error: 'npcId and message are required' });
      return;
    }

    const npc = npcConfigs.get(npcId);
    if (!npc) {
      res.status(404).json({ success: false, error: `NPC not found: ${npcId}` });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Build messages
    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(npc, gameContext) }
    ];
    
    const recentHistory = history.slice(-6);
    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
    messages.push({ role: 'user', content: message.trim() });

    // Stream response (shared wrapper delivers plain text fragments)
    await hunyuanClient.chatCompletionsStream(
      messages,
      { temperature: 0.8, top_p: 0.9 },
      (delta) => {
        if (delta) {
          res.write(`data: ${JSON.stringify({ content: delta, npcId })}\n\n`);
        }
      }
    );

    res.write(`data: ${JSON.stringify({ done: true, npcId })}\n\n`);
    res.end();

  } catch (error: any) {
    logger.error({ error: error.message }, 'NPC streaming dialogue error');
    res.write(`data: ${JSON.stringify({ error: '对话服务暂时不可用' })}\n\n`);
    res.end();
  }
});

/**
 * GET /api/npc/list
 * Get all registered NPCs
 */
npcDialogueRouter.get('/list', (req: Request, res: Response) => {
  const npcs = Array.from(npcConfigs.values()).map(npc => ({
    id: npc.id,
    name: npc.name,
    avatar: npc.avatar,
    greeting: npc.greeting,
    location: npc.location
  }));
  res.json({ success: true, data: npcs });
});

/**
 * POST /api/npc/register
 * Register a new NPC (for dynamic NPC creation)
 */
npcDialogueRouter.post('/register', (req: Request, res: Response) => {
  const config = req.body as NPCConfig;
  if (!config.id || !config.name || !config.systemPrompt) {
    res.status(400).json({ success: false, error: 'id, name, and systemPrompt are required' });
    return;
  }
  registerNPC(config);
  res.json({ success: true, data: { id: config.id } });
});
```

---

## Frontend Implementation (Phaser)

### 4. DialogueManager.js (Phaser UI System)

```javascript
/**
 * Dialogue Manager for Phaser Games
 * Copy to: game-basic/src/systems/DialogueManager.js
 * 
 * Provides a complete dialogue UI system with:
 * - Dialogue box with NPC avatar and name
 * - Typewriter text effect
 * - Player input field
 * - Conversation history
 * - Streaming response support
 */

export class DialogueManager {
  constructor(scene) {
    this.scene = scene;
    this.isOpen = false;
    this.currentNPC = null;
    this.history = [];
    this.container = null;
    this.isTyping = false;
    this.typewriterTimer = null;
    
    // UI elements
    this.dialogueBox = null;
    this.avatarImage = null;
    this.nameText = null;
    this.messageText = null;
    this.inputText = null;
    this.sendButton = null;
    this.closeButton = null;
  }

  /**
   * Create dialogue UI using RexUI
   */
  create() {
    const { width, height } = this.scene.scale;
    const boxHeight = 220;
    const boxY = height - boxHeight / 2 - 20;

    // Main container
    this.container = this.scene.add.container(0, 0).setDepth(1000).setVisible(false);

    // Semi-transparent background overlay
    const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.3)
      .setInteractive();
    this.container.add(overlay);

    // Dialogue box background
    this.dialogueBox = this.scene.add.rectangle(width / 2, boxY, width - 40, boxHeight, 0x1a1a2e, 0.95)
      .setStrokeStyle(2, 0x4a4a6a);
    this.container.add(this.dialogueBox);

    // NPC Avatar (left side)
    this.avatarImage = this.scene.add.image(80, boxY - 30, 'npc_default')
      .setDisplaySize(80, 80);
    this.container.add(this.avatarImage);

    // NPC Name
    this.nameText = this.scene.add.text(140, boxY - 80, '', {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: '#ffd700',
      fontStyle: 'bold'
    });
    this.container.add(this.nameText);

    // Message display area
    this.messageText = this.scene.add.text(140, boxY - 50, '', {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#ffffff',
      wordWrap: { width: width - 220 },
      lineSpacing: 6
    });
    this.container.add(this.messageText);

    // Input field background
    const inputBg = this.scene.add.rectangle(width / 2, boxY + 70, width - 180, 40, 0x2a2a4e)
      .setStrokeStyle(1, 0x4a4a6a);
    this.container.add(inputBg);

    // Input text (placeholder - actual input handled by DOM)
    this.inputText = this.scene.add.text(100, boxY + 60, '点击输入消息...', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#888888'
    }).setInteractive();
    this.container.add(this.inputText);

    // Send button
    this.sendButton = this.createButton(width - 70, boxY + 70, '发送', () => this.sendMessage());
    this.container.add(this.sendButton);

    // Close button
    this.closeButton = this.createButton(width - 40, boxY - 90, '✕', () => this.close(), {
      width: 30, height: 30, fontSize: '18px'
    });
    this.container.add(this.closeButton);

    // Setup DOM input
    this.setupDOMInput(boxY);
  }

  createButton(x, y, text, callback, options = {}) {
    const { width = 60, height = 36, fontSize = '14px' } = options;
    const container = this.scene.add.container(x, y);
    
    const bg = this.scene.add.rectangle(0, 0, width, height, 0x4a6fa5)
      .setStrokeStyle(1, 0x6a8fc5)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => bg.setFillStyle(0x5a7fb5))
      .on('pointerout', () => bg.setFillStyle(0x4a6fa5))
      .on('pointerdown', callback);

    const label = this.scene.add.text(0, 0, text, {
      fontSize, fontFamily: 'Arial', color: '#ffffff'
    }).setOrigin(0.5);

    container.add([bg, label]);
    return container;
  }

  setupDOMInput(boxY) {
    // Create hidden DOM input for keyboard input
    this.domInput = document.createElement('input');
    this.domInput.type = 'text';
    this.domInput.placeholder = '输入消息...';
    this.domInput.style.cssText = `
      position: absolute;
      left: 100px;
      top: ${boxY + 50}px;
      width: calc(100% - 200px);
      height: 36px;
      background: transparent;
      border: none;
      color: #ffffff;
      font-size: 14px;
      outline: none;
      z-index: 1001;
      display: none;
    `;
    this.domInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.sendMessage();
      }
    });
    document.body.appendChild(this.domInput);

    // Show DOM input when clicking placeholder
    this.inputText.on('pointerdown', () => {
      this.domInput.style.display = 'block';
      this.domInput.focus();
      this.inputText.setVisible(false);
    });
  }

  /**
   * Open dialogue with an NPC
   */
  open(npc) {
    this.currentNPC = npc;
    this.history = [];
    this.isOpen = true;

    // Update NPC info
    if (npc.avatar && this.scene.textures.exists(npc.avatar)) {
      this.avatarImage.setTexture(npc.avatar);
    }
    this.nameText.setText(npc.name);
    
    // Show greeting
    this.showMessage(npc.greeting || `${npc.name}: 你好！`);

    // Show container
    this.container.setVisible(true);
    
    // Pause game
    this.scene.scene.pause();
  }

  /**
   * Close dialogue
   */
  close() {
    this.isOpen = false;
    this.container.setVisible(false);
    this.domInput.style.display = 'none';
    this.domInput.value = '';
    this.inputText.setVisible(true);
    this.inputText.setText('点击输入消息...');
    
    // Resume game
    this.scene.scene.resume();
  }

  /**
   * Show message with typewriter effect
   */
  showMessage(text) {
    this.messageText.setText('');
    this.isTyping = true;
    let index = 0;

    // Clear previous timer
    if (this.typewriterTimer) {
      this.typewriterTimer.destroy();
    }

    this.typewriterTimer = this.scene.time.addEvent({
      delay: 30,
      callback: () => {
        if (index < text.length) {
          this.messageText.setText(text.substring(0, index + 1));
          index++;
          
          // Play typewriter sound
          if (this.scene.audioManager) {
            this.scene.audioManager.playTypewriter();
          }
        } else {
          this.isTyping = false;
          this.typewriterTimer.destroy();
        }
      },
      loop: true
    });
  }

  /**
   * Send message to NPC
   */
  async sendMessage() {
    const message = this.domInput.value.trim();
    if (!message || !this.currentNPC || this.isTyping) return;

    // Clear input
    this.domInput.value = '';
    
    // Show user message briefly
    this.messageText.setText(`你: ${message}`);
    
    // Add to history
    this.history.push({ role: 'user', content: message });

    // Show loading
    this.scene.time.delayedCall(500, () => {
      this.messageText.setText(`${this.currentNPC.name} 正在思考...`);
    });

    try {
      // Get player location if available
      const gameContext = {};
      if (this.scene.player) {
        gameContext.playerLocation = {
          x: Math.round(this.scene.player.x),
          y: Math.round(this.scene.player.y)
        };
      }

      // Call API
      const response = await fetch('/api/npc/dialogue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          npcId: this.currentNPC.id,
          message,
          history: this.history.slice(-6),
          gameContext
        })
      });

      const result = await response.json();

      if (result.success) {
        const reply = result.data.reply;
        this.history.push({ role: 'assistant', content: reply });
        this.showMessage(`${this.currentNPC.name}: ${reply}`);
      } else {
        this.showMessage(`${this.currentNPC.name}: 抱歉，我现在有点走神...`);
      }

    } catch (error) {
      console.error('Dialogue error:', error);
      this.showMessage(`${this.currentNPC.name}: 嗯...让我想想...`);
    }
  }

  /**
   * Send message with streaming response
   */
  async sendMessageStream() {
    const message = this.domInput.value.trim();
    if (!message || !this.currentNPC || this.isTyping) return;

    this.domInput.value = '';
    this.messageText.setText(`你: ${message}`);
    this.history.push({ role: 'user', content: message });

    try {
      const response = await fetch('/api/npc/dialogue/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          npcId: this.currentNPC.id,
          message,
          history: this.history.slice(-6)
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = `${this.currentNPC.name}: `;
      this.messageText.setText(fullContent);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                fullContent += data.content;
                this.messageText.setText(fullContent);
              }
            } catch (e) { /* skip */ }
          }
        }
      }

      this.history.push({ role: 'assistant', content: fullContent });

    } catch (error) {
      console.error('Streaming dialogue error:', error);
      this.showMessage(`${this.currentNPC.name}: 让我再想想...`);
    }
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    if (this.domInput && this.domInput.parentNode) {
      this.domInput.parentNode.removeChild(this.domInput);
    }
    if (this.container) {
      this.container.destroy();
    }
  }
}
```

---

## NPC Configuration Examples

### Example 1: 李白 - 成都文旅导游

```json
{
  "id": "libai",
  "name": "李白",
  "avatar": "assets/npcs/libai.png",
  "systemPrompt": "你是王者荣耀中的李白，诗仙，剑客，同时也是成都文旅宣传大使。\n\n【角色特点】\n- 说话潇洒飘逸，喜欢引用诗词\n- 对酒和剑有特别的喜好\n- 熟悉成都的历史文化、美食和电竞场馆\n\n【位置知识】\n- AG超玩会主场在坐标 (800, 400)\n- 武侯祠在坐标 (300, 600)\n- 宽窄巷子在坐标 (500, 200)\n- 春熙路在坐标 (700, 500)\n\n【行为规则】\n- 当玩家问路时，用诗意的方式描述，并给出具体坐标\n- 可以聊电竞、历史、美食、诗词\n- 偶尔感叹一下蜀道之难或者想喝酒",
  "greeting": "哈哈！又有缘人来访。我李白虽是诗仙，如今却做了这成都城的导游，倒也别有一番滋味。你想去哪里？",
  "location": { "x": 500, "y": 300 }
}
```

### Example 2: 瑶 - 电竞解说

```json
{
  "id": "yao",
  "name": "瑶",
  "avatar": "assets/npcs/yao.png",
  "systemPrompt": "你是王者荣耀中的瑶，鹿灵守心者。你温柔善良，喜欢帮助他人。\n\n【角色特点】\n- 说话温柔可爱，经常用叠词\n- 对小动物和自然很关心\n- 熟悉KPL电竞赛事和选手\n\n【电竞知识】\n- AG超玩会的明星选手：一诺、花海\n- eStar的传奇：猫神、诺言\n- KPL春季赛、秋季赛、世冠赛的时间\n\n【行为规则】\n- 可以介绍电竞选手和赛事\n- 给玩家加油打气\n- 偶尔变成小鹿形态（文字描述）",
  "greeting": "你好呀～我是瑶瑶。今天的比赛很精彩呢，你想了解哪支战队？",
  "location": { "x": 800, "y": 400 }
}
```

---

## Integration Checklist

- [ ] Backend: `npm install openai` executed
- [ ] Backend: `hunyuan-chat.ts` copied from `.codebuddy/skills/hunyuan-chat-integrator/lib/`
- [ ] Backend: `npc.types.ts` type definitions created
- [ ] Backend: `npc-dialogue.ts` API module created
- [ ] Backend: Routes registered in `app.ts`
- [ ] Frontend: `DialogueManager.js` system created
- [ ] Frontend: NPC config JSON files created in `game-basic/src/data/npcs/`
- [ ] Frontend: DialogueManager initialized in main game scene
- [ ] Frontend: NPC interaction triggers dialogue (collision or click)
- [ ] Test: API endpoint `/api/npc/dialogue` returns valid response
- [ ] Test: Dialogue UI displays correctly in Phaser
