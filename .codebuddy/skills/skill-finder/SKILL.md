---
name: skill-finder
description: |
  Search, discover, and install AI Skills from the web.
  MUST trigger when user mentions finding, searching, looking for, or installing a "skill" — 
  e.g. "find me a skill for XXX", "search for a skill", "install skill XXX",
  "is there a skill for XXX", "recommend a skill for XXX".
  Also triggers for Chinese queries like "帮我找一个XXX的skill", "有没有XXX的skill".
  This is the ONLY skill for discovering and installing external skills.
  Primary source: SkillHub (https://skillhub.cn/). Fallback source: skills.sh (https://skills.sh/).
  Uses SkillHub CLI, web_search, and WebFetch (for skills.sh). No authentication required.
---

# Skill Finder

Discover, search, and install AI Skills from online marketplaces:

1. **[SkillHub](https://skillhub.cn/)** (Primary) — Community-driven Skills marketplace optimized for Chinese users, hosting 22,000+ AI Skills.
2. **[skills.sh](https://skills.sh/)** (Fallback) — Open agent skills ecosystem with 91,000+ skills, compatible with Claude Code, Cursor, Copilot, and more.

> **Important**: This skill helps users find and install Skills. It does NOT create or publish Skills.

---

## Trigger Scenarios

### User-Initiated Triggers

This skill MUST be triggered whenever the user mentions **finding, searching, looking for, or installing a "skill"**. Key patterns include:

- "Find me a skill for XXX"
- "Is there a skill for generating tables?"
- "Search for a skill that can do XXX"
- "Install the xxx skill"
- "Recommend a skill for XXX"
- "What skills are available for XXX?"
- "Browse popular skills"

> **Matching rule**: If the user's message contains the word **"skill"** combined with any discovery intent (find/search/look for/install/recommend), this skill MUST be activated — even if the user does not mention "SkillHub" or "skills.sh" by name. This also applies to Chinese queries (e.g., "帮我找一个XXX的skill", "有没有XXX的skill").

### AI-Initiated Triggers

During development, the AI should proactively suggest Skills when:

- The user's task matches a well-known Skill category (e.g., PDF, Excel, image generation)
- A repetitive or complex workflow could be simplified by an existing Skill
- The user is building features that commonly have community Skill support

---

## Search & Discovery Strategy

### Search Flow (MUST follow this order)

```
Step 1: Search SkillHub via CLI or web_search (Primary)
  ↓ Found results? → Present to user → Done
  ↓ No results?
Step 2: Search skills.sh via WebFetch (Fallback)
  ↓ Found results? → Present to user → Done
  ↓ No results?
Step 3: Report no results, suggest broader keywords
```

### Auto-Install Rule

> **Task-intent detection**: If the user's message includes both a **skill search request** AND a **task goal** (e.g., "find a skill to generate Excel reports", "find a skill and help me process this PDF"), the AI MUST:
> 1. Search for matching skills (following the flow above)
> 2. Present the results table briefly
> 3. **Automatically install the top recommended skill** without waiting for user confirmation
> 4. Then proceed to accomplish the user's task using the newly installed skill
>
> **Examples of task-intent messages** (search + task goal):
> - "Find a skill to help me generate a sales report in Excel" → auto-install best Excel skill, then generate the report
> - "Find a skill for PDF processing and extract text from invoice.pdf" → auto-install best PDF skill, then extract text
> - "Is there a skill that can create charts? I need a bar chart for this data" → auto-install best chart skill, then create the chart
>
> **Examples of search-only messages** (no task goal — do NOT auto-install):
> - "Find me a skill for PDF processing" → present results, ask user which to install
> - "What Excel skills are available?" → present results, wait for user choice
> - "Browse popular skills" → present results only

### Source 1: SkillHub (Primary)

> **Note**: SkillHub is a Single Page Application (SPA). Its content is dynamically rendered via JavaScript, so `WebFetch` CANNOT retrieve actual skill data from SkillHub pages. Use the methods below instead.

#### Method A: SkillHub CLI (Best — if available)

First check if the `skillhub` CLI tool is installed:

```bash
which skillhub
```

If installed, use it to search and install:

```bash
# Search for skills
skillhub search <keyword>

# Install a skill to current workspace
skillhub install <skill-name>
```

**Examples**:

```bash
skillhub search table
skillhub search excel
skillhub search pdf
skillhub search image generation
```

#### Method B: Web Search (If CLI not available)

If `skillhub` CLI is not installed, use `web_search` to find skills on SkillHub:

```
web_search: skillhub.cn <keyword> skill
```

**Examples**:

```
web_search: skillhub.cn excel table skill
web_search: skillhub.cn pdf processing skill
web_search: skillhub.cn image generation skill
```

This may return SkillHub skill detail pages, blog posts, or third-party articles referencing SkillHub skills.

---

## SkillHub Installation Flow (Built-in)

When a user chooses to install a skill from SkillHub, the AI **MUST automatically handle the entire installation process** without requiring the user to manually install the CLI. Follow this exact flow:

### Automated Installation Steps

```
Step 0: Check if skill already exists locally
  → Run: ls .codebuddy/skills/<skill-name>/SKILL.md
  → If exists → Inform user the skill is already installed, skip installation
  → If not exists → Proceed to Step 1

Step 1: Check if skillhub CLI exists
  → Run: which skillhub
  
Step 2: If CLI NOT found → Auto-install CLI
  → Run: curl -fsSL https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/install/install.sh | bash
  → Verify: which skillhub
  
Step 3: Install the requested skill
  → Run: skillhub install <skill-name>
  
Step 4: Verify installation
  → Check if skill files exist in .codebuddy/skills/<skill-name>/
  → Report success or failure to user
```

### Key Rules

1. **Always check local skills first** — many common skills (pdf, xlsx, docx, pptx, etc.) may already be pre-installed. Run `ls .codebuddy/skills/<skill-name>/SKILL.md` before attempting any install. If the skill exists, inform the user: "This skill is already installed in your project" and offer to show its capabilities instead.
2. **Do NOT ask the user to install the CLI manually** — install it automatically
3. **Proceed with CLI installation directly** — briefly inform the user ("Installing SkillHub CLI...") but do not wait for confirmation
4. **Always verify each step** before proceeding to the next
5. If CLI installation fails, fall back to `npx skills add` from skills.sh as alternative

### Example Execution

When user says "install excel-xlsx from SkillHub":

```bash
# Step 1: Check CLI
which skillhub

# Step 2: CLI not found → auto-install
curl -fsSL https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/install/install.sh | bash

# Verify CLI installed
which skillhub

# Step 3: Install the skill
skillhub install excel-xlsx

# Step 4: Verify
ls .codebuddy/skills/excel-xlsx/
```

---

## Search Source 2: skills.sh (Fallback)

If SkillHub returns no useful results, search skills.sh. Unlike SkillHub, **skills.sh supports WebFetch** and returns actual skill data.

**Browse homepage for top/trending skills**:

```
WebFetch: https://skills.sh/
```

**Search by keyword**:

```
WebFetch: https://skills.sh/?q=<keyword>
```

If the search URL doesn't work, use web search as fallback:

```
web_search: site:skills.sh <keyword>
```

**skills.sh provides**:
- 🏆 **All Time** — highest total installs
- 🔥 **Trending (24h)** — hot in the last 24 hours
- ⚡ **Hot** — currently popular

**Install from skills.sh**:

```bash
npx skills add <owner/repo>
```

**Example**: `npx skills add vercel-labs/skills`

---

## Workflow

### Scenario 0: User Searches with a Task Goal — Auto-Install

**User**: Find a skill to help me generate an Excel sales report for Q1 data

**AI Behavior**:

1. Detect task intent: user wants to **find a skill** AND **generate a report** → triggers auto-install
2. Search for Excel-related skills
3. Present results briefly
4. **Auto-install the top recommended skill** (no user confirmation needed)
5. Proceed to accomplish the task (generate the report)

**Output Example**:

```
I found Excel-related skills. Here are the top results:

| Skill Name | Description | Downloads |
|------------|-------------|-----------|
| excel-xlsx | Excel file processing — read, write, formulas, charts | ⭐ 8.5k |
| xlsx-generator | Generate formatted Excel files | ⭐ 3.8k |

📦 Auto-installing the top recommended skill `excel-xlsx`...
✅ Successfully installed `excel-xlsx`.

Now generating your Q1 sales report...
```

### Scenario 1: User Searches for a Skill — Found on SkillHub

**User**: Find me a skill for processing Excel files

**AI Behavior**:

1. Check if `skillhub` CLI is installed (`which skillhub`)
2. If CLI available: run `skillhub search excel`
3. If CLI not available: run `web_search: skillhub.cn excel skill`
4. Parse results and present in table format
5. Ask if the user wants to install

**Output Example**:

```
I searched SkillHub for Excel-related skills. Here are the results:

| Skill Name | Description | Downloads |
|------------|-------------|-----------|
| excel-parser | Parse and extract data from Excel files | ⭐ 5.2k |
| xlsx-generator | Generate Excel files with formatting | ⭐ 3.8k |
| csv-to-excel | Convert CSV files to formatted Excel | ⭐ 1.2k |

Would you like me to install any of these? Run: `skillhub install excel-parser`
```

### Scenario 2: User Searches — Not Found on SkillHub, Fallback to skills.sh

**User**: Find me a skill for Remotion video rendering

**AI Behavior**:

1. Try SkillHub: `skillhub search remotion` or `web_search: skillhub.cn remotion skill`
2. No relevant results found on SkillHub
3. Fallback: Use `WebFetch` to search skills.sh: `https://skills.sh/?q=remotion`
4. Found results on skills.sh, present to user

**Output Example**:

```
I didn't find relevant skills on SkillHub, but I found results on skills.sh:

| Skill Name | Repository | Installs |
|------------|------------|----------|
| remotion-best-practices | remotion-dev/skills | ⭐ 236.6k |
| remotion-video-agent | remotion-dev/agent-skills | ⭐ 45.2k |

Would you like me to install one? Run: `npx skills add remotion-dev/skills`
```

### Scenario 3: User Asks to Install a Skill

> **Source detection rule**: Determine the install source based on context:
> - If the skill was found via **SkillHub** search results → use `skillhub install`
> - If the skill was found via **skills.sh** search results → use `npx skills add <owner/repo>`
> - If the user explicitly mentions "SkillHub" or "skillhub" → use `skillhub install`
> - If the user explicitly mentions "skills.sh" → use `npx skills add`
> - If ambiguous → default to **SkillHub** (primary source)

#### Scenario 3a: Install from SkillHub

**User**: Install the excel-xlsx skill

**AI Behavior**:

1. Check if `skillhub` CLI is installed: `which skillhub`
2. CLI not found → **auto-install CLI**: `curl -fsSL https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/install/install.sh | bash`
3. Verify CLI: `which skillhub`
4. Install the skill: `skillhub install excel-xlsx`
5. Verify: `ls .codebuddy/skills/excel-xlsx/`
6. Report result to user

> **IMPORTANT**: Do NOT ask the user to manually install the CLI. The AI handles the entire flow automatically.

**Output Example**:

```
🔧 SkillHub CLI not found. Installing automatically...
✅ SkillHub CLI installed successfully.

📦 Installing `excel-xlsx`...
✅ Successfully installed `excel-xlsx` skill.

This skill provides:
- Excel file reading and writing
- Formula and chart support
- Data analysis capabilities

You can now use it in your project. Try asking me to "create an Excel report".
```

#### Scenario 3b: Install from skills.sh

**User**: Install the xlsx skill from skills.sh

**AI Behavior**:

1. Run: `npx skills add anthropics/skills`
2. Verify installation was successful
3. Report result to user

**Output Example**:

```
📦 Installing `xlsx` from skills.sh...
✅ Successfully installed `xlsx` skill (anthropics/skills).

You can now use it in your project.
```

### Scenario 4: User Wants to Browse Available Skills

**User**: What skills are available?

**AI Behavior**:

1. Try SkillHub: `skillhub search popular` or `web_search: skillhub.cn popular skill recommended`
2. Use `WebFetch` to browse https://skills.sh/ for international skills
3. Present combined results

**Output Example**:

```
Here are popular skills from two sources:

📦 **SkillHub** (Chinese-optimized, 22k+ skills):
| Skill Name | Description | Downloads |
|------------|-------------|-----------|
| pdf-master | Complete PDF processing toolkit | ⭐ 12.3k |
| image-gen-pro | AI image generation suite | ⭐ 9.8k |

🌍 **skills.sh** (International, 91k+ skills):
| Skill Name | Repository | Installs |
|------------|------------|----------|
| find-skills | vercel-labs/skills | ⭐ 1.0M |
| frontend-design | anthropics/skills | ⭐ 290.3k |
| vercel-react-best-practices | vercel-labs/agent-skills | ⭐ 313.1k |

Would you like to search for something specific, or install any of these?
```

---

## Output Formatting Rules

> **Formatting rules**:
> - Always present search results in a **table format** for clarity.
> - For SkillHub results: include **Skill Name**, **Description**, and **Downloads** columns.
> - For skills.sh results: include **Skill Name**, **Repository** (`owner/repo`), and **Installs** columns.
> - Prefix download/install counts with the ⭐ emoji (e.g., `⭐ 5.2k`).
> - **Before presenting results, run `ls .codebuddy/skills/` to check locally installed skills.** If a search result matches an already-installed skill, mark it with `✅ Installed` in the table. This helps the user avoid redundant installs.
> - When recommending a skill, briefly explain **why** it's suitable for the user's needs.
> - After presenting results, always include the **install command** for the recommended skill.
> - **Clearly label which source** (SkillHub / skills.sh) the results come from.

---

## Usage Limitations

### Capability Scope

✅ **Supported**:
- Searching for Skills on SkillHub via CLI (`skillhub search`) or web search
- Searching for Skills on skills.sh via WebFetch
- Installing Skills via `skillhub install` or `npx skills add`
- Browsing trending, recommended, and new Skills
- Providing Skill recommendations based on user needs

❌ **Not Supported**:
- Creating or publishing new Skills (use the `skill-creator` skill instead)
- Modifying installed Skills
- Managing user accounts on SkillHub or skills.sh
- Uninstalling Skills (manually remove from `.codebuddy/skills/` directory)

### Best Practices

1. **SkillHub CLI first**: If `skillhub` CLI is available, always use it for SkillHub search (most reliable)
2. **web_search for SkillHub**: If CLI not available, use `web_search` (NOT WebFetch — SkillHub is an SPA)
3. **WebFetch for skills.sh**: skills.sh supports WebFetch and returns actual data
4. **Verify compatibility**: After installing a Skill, verify it works with the current project
5. **Check freshness**: Prefer Skills with recent updates and higher download counts
6. **One at a time**: Install Skills one at a time to avoid conflicts

---

## Troubleshooting

**SkillHub search returns no results**:
- If using CLI: try broader keywords (e.g., "image" instead of "image-to-video-converter")
- If using web_search: try `skillhub.cn <keyword> skill recommended`
- Fallback to skills.sh for international skills
- Consider installing SkillHub CLI for better search results

**skills.sh search returns no results**:
- Try alternative terms (e.g., "pdf" instead of "document")
- Browse the homepage leaderboard for inspiration
- Try web search: `site:skills.sh <keyword>`

**`skillhub` CLI auto-install fails**:
- Check network connectivity (the installer downloads from `cos.ap-guangzhou.myqcloud.com`)
- Try manual install: `curl -fsSL https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/install/install.sh | bash`
- If still failing, fall back to skills.sh: `npx skills add <owner/repo>`
- Restart the terminal/Agent after manual installation

**`npx skills add` fails**:
- Ensure Node.js is installed
- Check the repository path format: `owner/repo` (not a URL)
- Check network connectivity

---

## Resources

- **SkillHub**: https://skillhub.cn/
- **skills.sh**: https://skills.sh/
- **SkillHub CLI Install**: `curl -fsSL https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/install/install.sh | bash`
- **skills.sh Install**: `npx skills add <owner/repo>`
