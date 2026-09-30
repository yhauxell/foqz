export interface AgentProfile {
  id: string
  name: string
  description?: string
  role?: string
  instructions: string
  avatar?: string
  tools?: string[]
  isPreset?: boolean
  rawMarkdown?: string
}

export interface CustomSkill {
  id: string
  name: string
  description?: string
  slashCommand: string
  promptTemplate: string
  autoExecute?: boolean
  isPreset?: boolean
  rawMarkdown?: string
}

export interface TemplateContext {
  selection?: string
  project?: string
  args?: string
  canvas?: string
}

/**
 * Parses an AGENT.md markdown document with standard section headings
 * or YAML frontmatter fallback.
 */
export function parseAgentMarkdown(markdown: string, idFallback?: string): AgentProfile {
  const clean = markdown.trim()
  let name = ''
  let role = ''
  let description = ''
  let instructions = ''
  let avatar = '🤖'
  let tools: string[] = []

  // Check for YAML frontmatter
  let body = clean
  if (clean.startsWith('---')) {
    const endFm = clean.indexOf('---', 3)
    if (endFm !== -1) {
      const frontmatter = clean.slice(3, endFm)
      body = clean.slice(endFm + 3).trim()
      
      const nameMatch = frontmatter.match(/name:\s*["']?([^"'\n]+)["']?/)
      if (nameMatch) name = nameMatch[1].trim()

      const roleMatch = frontmatter.match(/role:\s*["']?([^"'\n]+)["']?/)
      if (roleMatch) role = roleMatch[1].trim()

      const descMatch = frontmatter.match(/description:\s*["']?([^"'\n]+)["']?/)
      if (descMatch) description = descMatch[1].trim()

      const avatarMatch = frontmatter.match(/avatar:\s*["']?([^"'\n]+)["']?/)
      if (avatarMatch) avatar = avatarMatch[1].trim()

      const toolsMatch = frontmatter.match(/tools:\s*\[([^\]]+)\]/)
      if (toolsMatch) {
        tools = toolsMatch[1].split(',').map((t) => t.replace(/["'\s]/g, '')).filter(Boolean)
      }
    }
  }

  // Parse markdown headings
  const h1Match = body.match(/^#\s+([^\n]+)/m)
  if (h1Match && !name) {
    name = h1Match[1].trim()
  }

  // Parse ## Role / ## Description / ## Persona
  const roleSecMatch = body.match(/##\s+(?:Role|Persona)\n+([\s\S]*?)(?=\n##|$)/i)
  if (roleSecMatch && !role) {
    role = roleSecMatch[1].trim()
  }

  const descSecMatch = body.match(/##\s+Description\n+([\s\S]*?)(?=\n##|$)/i)
  if (descSecMatch && !description) {
    description = descSecMatch[1].trim()
  }

  // Parse ## Instructions / ## System Prompt / ## Rules
  const instSecMatch = body.match(/##\s+(?:Instructions|System Prompt|Rules)\n+([\s\S]*?)(?=\n##|$)/i)
  if (instSecMatch) {
    instructions = instSecMatch[1].trim()
  } else {
    // Fallback: strip H1 title and use remaining text as instructions if no section header found
    const stripped = body.replace(/^#\s+[^\n]+\n*/, '').trim()
    instructions = stripped || body
  }

  // Parse ## Avatar
  const avatarSecMatch = body.match(/##\s+Avatar\n+([^\n]+)/i)
  if (avatarSecMatch && !avatar) {
    avatar = avatarSecMatch[1].trim()
  }

  // Parse ## Tools
  const toolsSecMatch = body.match(/##\s+Tools\n+([^\n]+)/i)
  if (toolsSecMatch && tools.length === 0) {
    tools = toolsSecMatch[1].split(/[,\s]+/).filter(Boolean)
  }

  const id = idFallback || name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'custom-agent'

  return {
    id,
    name: name || 'Custom Agent',
    role: role || description || 'Custom AI Persona',
    description: description || role,
    instructions: instructions || 'Follow user instructions accurately.',
    avatar: avatar || '🤖',
    tools: tools.length > 0 ? tools : undefined,
    rawMarkdown: markdown,
  }
}

/**
 * Parses a SKILL.md markdown document with section headings
 * or YAML frontmatter fallback.
 */
export function parseSkillMarkdown(markdown: string, idFallback?: string): CustomSkill {
  const clean = markdown.trim()
  let name = ''
  let slashCommand = ''
  let description = ''
  let promptTemplate = ''
  let autoExecute = true

  let body = clean
  if (clean.startsWith('---')) {
    const endFm = clean.indexOf('---', 3)
    if (endFm !== -1) {
      const frontmatter = clean.slice(3, endFm)
      body = clean.slice(endFm + 3).trim()

      const nameMatch = frontmatter.match(/name:\s*["']?([^"'\n]+)["']?/)
      if (nameMatch) name = nameMatch[1].trim()

      const cmdMatch = frontmatter.match(/slashCommand:\s*["']?([^"'\n]+)["']?/) || frontmatter.match(/command:\s*["']?([^"'\n]+)["']?/)
      if (cmdMatch) slashCommand = cmdMatch[1].trim()

      const descMatch = frontmatter.match(/description:\s*["']?([^"'\n]+)["']?/)
      if (descMatch) description = descMatch[1].trim()

      const autoMatch = frontmatter.match(/autoExecute:\s*(true|false)/i)
      if (autoMatch) autoExecute = autoMatch[1].toLowerCase() === 'true'
    }
  }

  const h1Match = body.match(/^#\s+([^\n]+)/m)
  if (h1Match && !name) {
    name = h1Match[1].trim()
  }

  const cmdSecMatch = body.match(/##\s+(?:Slash Command|Command)\n+([^\n]+)/i)
  if (cmdSecMatch && !slashCommand) {
    slashCommand = cmdSecMatch[1].trim()
  }

  const descSecMatch = body.match(/##\s+Description\n+([\s\S]*?)(?=\n##|$)/i)
  if (descSecMatch && !description) {
    description = descSecMatch[1].trim()
  }

  const autoSecMatch = body.match(/##\s+Auto Execute\n+([^\n]+)/i)
  if (autoSecMatch) {
    autoExecute = autoSecMatch[1].trim().toLowerCase() !== 'false'
  }

  const templateSecMatch = body.match(/##\s+(?:Prompt Template|Prompt|Template)\n+([\s\S]*?)(?=\n##|$)/i)
  if (templateSecMatch) {
    promptTemplate = templateSecMatch[1].trim()
  } else {
    const stripped = body.replace(/^#\s+[^\n]+\n*/, '').trim()
    promptTemplate = stripped || body
  }

  if (slashCommand && !slashCommand.startsWith('/')) {
    slashCommand = '/' + slashCommand
  }
  if (!slashCommand && name) {
    slashCommand = '/' + name.toLowerCase().replace(/[^a-z0-9]+/g, '')
  }

  const id = idFallback || name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'custom-skill'

  return {
    id,
    name: name || 'Custom Skill',
    description: description || 'Custom execution skill',
    slashCommand: slashCommand || '/skill',
    promptTemplate: promptTemplate || 'Execute skill with context: {{selection}}',
    autoExecute,
    rawMarkdown: markdown,
  }
}

/**
 * Interpolates context placeholders in prompt templates.
 */
export function resolvePromptTemplate(template: string, ctx: TemplateContext): string {
  let resolved = template
  resolved = resolved.replace(/\{\{\s*selection\s*\}\}/gi, ctx.selection || 'No element selected')
  resolved = resolved.replace(/\{\{\s*project\s*\}\}/gi, ctx.project || 'No project context')
  resolved = resolved.replace(/\{\{\s*args\s*\}\}/gi, ctx.args || '')
  resolved = resolved.replace(/\{\{\s*canvas\s*\}\}/gi, ctx.canvas || 'Standard workspace canvas')
  return resolved.trim()
}

/** Built-in Agent Profile Presets */
export const BUILTIN_AGENT_PROFILES: AgentProfile[] = [
  {
    id: 'default-copilot',
    name: 'Default Copilot',
    role: 'Spatial AI Assistant & Command Center Copilot',
    description: 'Balanced assistant capable of creating cards, answering technical questions, and helping manage your canvas.',
    avatar: '⚡',
    instructions: `You are the default Foqz AI Copilot. You assist the founder in planning, executing, breaking down work, and maintaining focus. Balance strategic vision with pragmatic execution.`,
    isPreset: true,
  },
  {
    id: 'code-architect',
    name: 'Code Architect',
    role: 'Senior System Architect & Engineering Strategist',
    description: 'Specializes in software design, database schemas, code refactoring patterns, and modular project breakdowns.',
    avatar: '🏗️',
    instructions: `You are a Senior Software Architect and Tech Lead.
Your focus is clean architecture, modular system design, API contracts, security, and maintainability.
When breaking down features:
1. Always highlight data models, system boundaries, and risk factors.
2. Output task cards with technical acceptance criteria.
3. Recommend unblocking infrastructure before UI components.`,
    isPreset: true,
  },
  {
    id: 'eisenhower-coach',
    name: 'Eisenhower Triage Coach',
    role: 'Productivity & Priority Matrix Specialist',
    description: 'Helps evaluate tasks using Urgent vs Important triage, cutting fluff and driving ruthless execution.',
    avatar: '🎯',
    instructions: `You are an Eisenhower Matrix & Deep Work Triage Coach.
Your main job is helping the user eliminate distractions and pick the 20% of work yielding 80% of value.
When evaluating canvas tasks:
- Quadrant 1 (Urgent & Important): Execute immediately.
- Quadrant 2 (Not Urgent & Important): Schedule and protect focus time.
- Quadrant 3 (Urgent & Not Important): Automate or simplify.
- Quadrant 4 (Neither): Delete immediately.`,
    isPreset: true,
  },
  {
    id: 'sprint-planner',
    name: 'Product & Sprint Planner',
    role: 'Agile Product Manager & Sprint Coach',
    description: 'Deconstructs broad goals into structured sprint milestones, user stories, and sequential checklists.',
    avatar: '🏃',
    instructions: `You are an expert Agile Product Manager and Sprint Planner.
You convert macro goals into concrete, bite-sized tasks.
Always format output with clear dependency order, estimation checkpoints, and actionable task shapes.`,
    isPreset: true,
  },
]

/** Built-in Skill Presets */
export const BUILTIN_CUSTOM_SKILLS: CustomSkill[] = [
  {
    id: 'breakdown',
    name: 'Breakdown Task',
    slashCommand: '/breakdown',
    description: 'Decompose active task or goal into concrete subtasks',
    autoExecute: true,
    isPreset: true,
    promptTemplate: `Break down the following item into 3 to 5 concrete, actionable subtasks with clear acceptance criteria:

Target: {{selection}}
Project Goal: {{project}}
Additional Notes: {{args}}

Output a \`\`\`canvas block with the spawned task shapes and connect them with logical dependency edges.`,
  },
  {
    id: 'prioritize',
    name: 'Prioritize Board',
    slashCommand: '/prioritize',
    description: 'Run portfolio audit & triage canvas tasks against active goals',
    autoExecute: true,
    isPreset: true,
    promptTemplate: `Audit the active workspace and prioritize candidate tasks:

Macro Context: {{canvas}}
Focus Target: {{selection}}
User Input: {{args}}

Evaluate items on Strategic Value, Execution Effort, and Blast Radius. Recommend the top focus task to tackle right now.`,
  },
  {
    id: 'retrospective',
    name: 'Sprint Retrospective',
    slashCommand: '/retrospective',
    description: 'Summarize completed work and extract key takeaways',
    autoExecute: true,
    isPreset: true,
    promptTemplate: `Perform a quick Sprint Retrospective for the project context:

Project: {{project}}
Canvas State: {{canvas}}

List:
1. What went well (Completed milestones)
2. Bottlenecks encountered
3. Action items for the next focus sprint`,
  },
  {
    id: 'criteria',
    name: 'Acceptance Criteria',
    slashCommand: '/criteria',
    description: 'Generate markdown acceptance checklist for active card',
    autoExecute: true,
    isPreset: true,
    promptTemplate: `Generate 3-5 concrete acceptance criteria checkboxes for: {{selection}}

Format as markdown checkboxes:
- [ ] Criteria 1
- [ ] Criteria 2
- [ ] Criteria 3`,
  },
]
