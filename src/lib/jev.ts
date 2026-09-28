import { getCachedAppSettings } from './appSettingsCache'

export type JevNoulQuestion = {
  type: 'noul'
  instructions: string | Record<string, any>
  criteria?: {
    true?: string
    false?: string
  }
}

export type JevChoiceQuestion = {
  type: 'choice'
  instructions: string | Record<string, any>
  criteria: Record<string, string | null>
}

export type JevScoreQuestion = {
  type: 'score'
  instructions: string | Record<string, any>
  criteria: string[]
}

export type JevQuestion = JevNoulQuestion | JevChoiceQuestion | JevScoreQuestion

export type JevNoulAnswer = {
  type: 'noul'
  noul: number
}

export type JevChoiceAnswer = {
  type: 'choice'
  choice: string
  probabilities: Record<string, number>
  confidence: number
}

export type JevScoreAnswer = {
  type: 'score'
  score: number
  legend: Record<string, string>
  probabilities: Record<string, number>
  confidence: number
}

export type JevAnswer = JevNoulAnswer | JevChoiceAnswer | JevScoreAnswer

export type JevRequest = {
  state: any
  model?: string
  questions: Record<string, JevQuestion>
}

export type JevResponse = {
  model: string
  answers: Record<string, JevAnswer>
  usage?: {
    input_tokens: number
    output_tokens: number
  }
}

/**
 * Executes a System One evaluation call against TypeSafe Jev.
 * Automatically handles CORS via Electron IPC bridge or local Vite dev proxy.
 */
export async function evaluateJev(
  req: JevRequest,
  options?: { apiKey?: string; baseUrl?: string },
): Promise<JevResponse> {
  const settings = getCachedAppSettings()
  const apiKey = (
    options?.apiKey ||
    settings?.typesafeApiKey ||
    (typeof window !== 'undefined' ? localStorage.getItem('foqz_typesafe_api_key') : '') ||
    (typeof process !== 'undefined' ? process.env.TYPESAFE_API_KEY : '') ||
    ''
  ).trim()

  let baseUrl = (
    options?.baseUrl ||
    settings?.typesafeBaseUrl ||
    (typeof window !== 'undefined' ? localStorage.getItem('foqz_typesafe_base_url') : '') ||
    'https://api.typesafe.ai'
  ).trim().replace(/\/+$/, '')

  if (!apiKey) {
    throw new Error(
      'TypeSafe API Key is missing. Please configure it in Foqz Settings -> AI or set TYPESAFE_API_KEY.'
    )
  }

  // 1. If running inside Electron, delegate to main process IPC (completely bypasses browser CORS)
  if (typeof window !== 'undefined' && window.focusStore?.jev?.evaluate) {
    try {
      const result = await window.focusStore.jev.evaluate(req, { apiKey, baseUrl })
      return result as JevResponse
    } catch (ipcErr: any) {
      console.warn('[jev] Electron IPC evaluate failed, falling back to direct/proxy fetch:', ipcErr)
      // Fall through to fetch
    }
  }

  // 2. If running in browser over HTTP, proxy through local server if using standard api.typesafe.ai
  if (
    typeof window !== 'undefined' &&
    window.location &&
    window.location.protocol.startsWith('http') &&
    (baseUrl === 'https://api.typesafe.ai' || baseUrl.startsWith('https://api.typesafe.ai'))
  ) {
    baseUrl = baseUrl.replace('https://api.typesafe.ai', '/api/typesafe')
  }

  const endpoint = `${baseUrl.replace(/\/+$/, '')}/v1/systemone`
  const body = {
    state: req.state,
    model: req.model || 'jev-latest',
    questions: req.questions,
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    let message = errorText
    try {
      const parsed = JSON.parse(errorText)
      if (parsed?.detail?.message) message = parsed.detail.message
      else if (parsed?.message) message = parsed.message
      else if (Array.isArray(parsed?.detail)) {
        message = parsed.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ')
      }
    } catch {}
    throw new Error(`TypeSafe API error (${response.status}): ${message || response.statusText}`)
  }

  return (await response.json()) as JevResponse
}

/**
 * Prioritizes candidate backlog items against today's goal using a single parallel Jev pass.
 */
export async function prioritizeDailyFocusSlot(
  dailyGoal: string,
  candidateItems: Array<{ id: string; title: string; project?: string; notes?: string }>,
  options?: { apiKey?: string; baseUrl?: string },
): Promise<{
  topItemId: string | null
  rankings: Array<{
    id: string
    title: string
    alignmentScore: number
    blastRadius: string
    isActionable: boolean
  }>
}> {
  if (candidateItems.length === 0) {
    return { topItemId: null, rankings: [] }
  }

  // Construct parallel questions for each candidate item over the single shared goal state
  const questions: Record<string, JevQuestion> = {}

  candidateItems.forEach((item, idx) => {
    const prefix = `item_${idx}`
    questions[`${prefix}_alignment`] = {
      type: 'score',
      instructions: `How directly does completing "${item.title}" advance or unblock today's primary goal?`,
      criteria: [
        'Irrelevant or unrelated distraction',
        'Tangentially related or nice-to-have',
        'Direct prerequisite or high-impact milestone towards the goal',
      ],
    }

    questions[`${prefix}_blast`] = {
      type: 'choice',
      instructions: `What is the risk or blast radius category of "${item.title}"?`,
      criteria: {
        critical_blocker: 'Production outage, broken customer flow, or immediate blocker',
        high_leverage: 'Core feature milestone or key deliverable',
        internal_cleanup: 'Code cleanup, documentation, or minor refactoring',
        low_priority: 'Exploratory idea or deferred task',
      },
    }

    questions[`${prefix}_actionable`] = {
      type: 'noul',
      instructions: `Is "${item.title}" a concrete, self-contained next step that can be tackled in a single focus sprint?`,
    }
  })

  const state = {
    todays_primary_goal: dailyGoal,
    candidate_items: candidateItems.map((c) => ({
      title: c.title,
      project: c.project || 'General',
      notes: c.notes || '',
    })),
  }

  const result = await evaluateJev({ state, questions }, options)

  const rankings = candidateItems.map((item, idx) => {
    const prefix = `item_${idx}`
    const alignAnswer = result.answers[`${prefix}_alignment`] as JevScoreAnswer | undefined
    const blastAnswer = result.answers[`${prefix}_blast`] as JevChoiceAnswer | undefined
    const actionAnswer = result.answers[`${prefix}_actionable`] as JevNoulAnswer | undefined

    const alignmentScore = alignAnswer?.score ?? 0
    const blastRadius = blastAnswer?.choice ?? 'high_leverage'
    const isActionable = (actionAnswer?.noul ?? 0.5) >= 0.5

    // Composite scoring calculation
    const compositeScore =
      alignmentScore * 2 +
      (blastRadius === 'critical_blocker' ? 3 : blastRadius === 'high_leverage' ? 1.5 : 0) +
      (isActionable ? 1 : 0)

    return {
      id: item.id,
      title: item.title,
      alignmentScore,
      blastRadius,
      isActionable,
      compositeScore,
    }
  })

  rankings.sort((a, b) => b.compositeScore - a.compositeScore)

  return {
    topItemId: rankings[0]?.id || null,
    rankings: rankings.map(({ id, title, alignmentScore, blastRadius, isActionable }) => ({
      id,
      title,
      alignmentScore,
      blastRadius,
      isActionable,
    })),
  }
}

export interface PortfolioProjectInput {
  id: string;
  title: string;
  goal: string;
  projectContext?: string;
  totalTasks: number;
  doneTasks: number;
  openTasks: Array<{ id: string; title: string; priority: number; notes?: string }>;
  connectors?: {
    githubRepo?: string;
    sentryProject?: string;
    notionWorkspace?: string;
  };
}

export interface PortfolioAuditResult {
  recommendedProjectId: string | null;
  recommendedProjectTitle: string | null;
  executiveSummary: string;
  rankings: Array<{
    id: string;
    title: string;
    compositeScore: number;
    leverageScore: number;
    leverageLabel: string;
    urgencyCategory: string;
    urgencyLabel: string;
    isExecutionReady: boolean;
    readinessProbability: number;
    completionRatio: number;
    progressText: string;
    topFocusTask?: { id: string; title: string; priority: number };
    rationale: string;
  }>;
}

/**
 * Audits and prioritizes all project frames on the canvas using TypeSafe Jev System One intelligence
 * to determine which project and tasks make the most sense to push for today.
 */
export async function auditPortfolioProjects(
  projects: PortfolioProjectInput[],
  dailyGoal?: string,
  options?: { apiKey?: string; baseUrl?: string },
): Promise<PortfolioAuditResult> {
  if (!projects || projects.length === 0) {
    return {
      recommendedProjectId: null,
      recommendedProjectTitle: null,
      executiveSummary: "No project frames found on the canvas to audit. Create or select a project frame first!",
      rankings: [],
    };
  }

  // Cap portfolio evaluation at 20 projects in a single parallel pass
  const candidateProjects = projects.slice(0, 20);
  const questions: Record<string, JevQuestion> = {};

  candidateProjects.forEach((p, idx) => {
    const prefix = `proj_${idx}`;

    questions[`${prefix}_leverage`] = {
      type: "score",
      instructions: `How high is the strategic leverage and business impact of completing the next milestone in project "${p.title}" towards overall company/product goals?`,
      criteria: [
        "Low leverage: Cosmetic, peripheral, or low-urgency maintenance",
        "Moderate leverage: Standard incremental feature development or internal polish",
        "Transformative leverage: Critical milestone, unblocks major dependencies, or directly drives release/users/revenue",
      ],
    };

    questions[`${prefix}_urgency`] = {
      type: "choice",
      instructions: `What is the operational urgency state for project "${p.title}" today?`,
      criteria: {
        critical_blocker: "Imminent deadline, broken production, or active release blocker",
        active_momentum: "High-momentum active sprint that should be driven to completion",
        blocked_external: "Waiting on external input, third-party reviews, or paused",
        backlog: "Low urgency idea or backlog exploration that can wait",
      },
    };

    questions[`${prefix}_readiness`] = {
      type: "noul",
      instructions: `Does project "${p.title}" have clear, well-defined next tasks ready to execute today without major ambiguities or blockers?`,
      criteria: {
        true: "Concrete actionable tasks ready to execute immediately",
        false: "Vague, blocked, or missing clear task definitions",
      },
    };
  });

  const state = {
    daily_objective:
      dailyGoal?.trim() ||
      "Maximize high-leverage product progress, unblock critical release paths, and maintain sprint momentum.",
    projects: candidateProjects.map((p) => ({
      title: p.title,
      goal: p.goal || "No specific goal stated",
      context_snippet: p.projectContext ? p.projectContext.slice(0, 600) : "No extra architecture/context provided",
      progress: `${p.doneTasks} of ${p.totalTasks} tasks completed`,
      open_task_count: p.openTasks.length,
      sample_open_tasks: p.openTasks.slice(0, 5).map((t) => `[P${t.priority}] ${t.title}`),
      github_repo: p.connectors?.githubRepo || "None",
    })),
  };

  const result = await evaluateJev({ state, questions }, options);

  const urgencyLabels: Record<string, string> = {
    critical_blocker: "Critical Blocker",
    active_momentum: "Active Momentum",
    blocked_external: "Blocked / Waiting",
    backlog: "Backlog / Low Urgency",
  };

  const urgencyWeights: Record<string, number> = {
    critical_blocker: 3.0,
    active_momentum: 2.0,
    backlog: 0.5,
    blocked_external: -2.0,
  };

  const rankings = candidateProjects.map((p, idx) => {
    const prefix = `proj_${idx}`;
    const levAnswer = result.answers[`${prefix}_leverage`] as JevScoreAnswer | undefined;
    const urgAnswer = result.answers[`${prefix}_urgency`] as JevChoiceAnswer | undefined;
    const readAnswer = result.answers[`${prefix}_readiness`] as JevNoulAnswer | undefined;

    const leverageScore = levAnswer?.score ?? 1;
    const leverageLabel =
      leverageScore === 2 ? "Transformative" : leverageScore === 1 ? "Moderate" : "Low";

    const urgencyCategory = urgAnswer?.choice ?? "active_momentum";
    const urgencyLabel = urgencyLabels[urgencyCategory] || "Standard";

    const readinessProbability = readAnswer?.noul ?? 0.5;
    const isExecutionReady = readinessProbability >= 0.55;

    const completionRatio = p.totalTasks > 0 ? p.doneTasks / p.totalTasks : 0;
    const momentumBonus = completionRatio > 0.5 ? completionRatio * 1.0 : 0;
    const taskPenalty = p.openTasks.length === 0 ? -4 : 0;

    // Normalized to a strict 10.0 scale:
    // - Leverage: up to 4.0 pts (0, 2.0, or 4.0)
    // - Urgency: up to 3.0 pts
    // - Execution Readiness: up to 2.0 pts
    // - Sprint Momentum: up to 1.0 pt
    const rawScore =
      leverageScore * 2.0 +
      (urgencyWeights[urgencyCategory] ?? 1.0) +
      (isExecutionReady ? 2.0 : readinessProbability * 2.0) +
      momentumBonus +
      taskPenalty;

    const compositeScore = Math.min(
      10,
      Math.max(0, Math.round(rawScore * 10) / 10),
    );

    // Pick top focus task in this project
    const sortedOpen = [...p.openTasks].sort((a, b) => (a.priority || 3) - (b.priority || 3));
    const topFocusTask = sortedOpen.length > 0 ? sortedOpen[0] : undefined;

    // Construct executive rationale
    const rationaleParts: string[] = [];
    if (urgencyCategory === "critical_blocker") {
      rationaleParts.push("Immediate critical blocker or launch milestone.");
    } else if (urgencyCategory === "active_momentum") {
      rationaleParts.push("Healthy in-flight sprint momentum.");
    } else if (urgencyCategory === "blocked_external") {
      rationaleParts.push("Appears blocked by external dependencies or awaiting review.");
    }

    if (leverageScore === 2) {
      rationaleParts.push("Transformative leverage for product goals.");
    }

    if (completionRatio >= 0.6 && p.openTasks.length > 0) {
      rationaleParts.push(
        `${Math.round(completionRatio * 100)}% finished (${p.openTasks.length} task${p.openTasks.length > 1 ? "s" : ""} left to close project).`,
      );
    }

    if (!isExecutionReady && p.openTasks.length > 0) {
      rationaleParts.push("Tasks may need clarification or breakdown before starting.");
    }

    const progressText = `${p.doneTasks}/${p.totalTasks} Done`;

    return {
      id: p.id,
      title: p.title,
      compositeScore,
      leverageScore,
      leverageLabel,
      urgencyCategory,
      urgencyLabel,
      isExecutionReady,
      readinessProbability,
      completionRatio,
      progressText,
      topFocusTask,
      rationale: rationaleParts.join(" ") || "Standard portfolio item.",
    };
  });

  rankings.sort((a, b) => b.compositeScore - a.compositeScore);

  const winner = rankings[0] || null;

  let summary = `### Daily Portfolio Briefing\n\n`;
  if (winner) {
    summary += `**Today's Recommended Focus: ${winner.title}** (Score: ${winner.compositeScore}/10)\n`;
    summary += `- **Strategic Alignment**: ${winner.leverageLabel} leverage\n`;
    summary += `- **Urgency**: ${winner.urgencyLabel}\n`;
    summary += `- **Progress**: ${winner.progressText}\n`;
    if (winner.topFocusTask) {
      summary += `- **Top Daily Focus Task**: \`[P${winner.topFocusTask.priority}] ${winner.topFocusTask.title}\`\n`;
    }
    summary += `- **Executive Rationale**: ${winner.rationale}\n\n`;
  }

  if (rankings.length > 1) {
    summary += `**Portfolio Standings:**\n`;
    rankings.slice(1).forEach((r, i) => {
      summary += `• **#${i + 2}**: **${r.title}** (${r.compositeScore}/10) — ${r.urgencyLabel}, ${r.leverageLabel} leverage (${r.progressText})\n`;
    });
  }

  return {
    recommendedProjectId: winner?.id || null,
    recommendedProjectTitle: winner?.title || null,
    executiveSummary: summary.trim(),
    rankings,
  };
}

/**
 * Evaluates semantic match across shapes on the canvas for instant global search.
 */
export async function semanticQueryShapes(
  query: string,
  shapes: Array<{ id: string; text: string; type: string }>,
  options?: { apiKey?: string; baseUrl?: string },
): Promise<Array<{ id: string; probability: number }>> {
  if (shapes.length === 0 || !query.trim()) return []

  // Up to 50 shapes in parallel
  const targetShapes = shapes.slice(0, 50)
  const questions: Record<string, JevQuestion> = {}

  targetShapes.forEach((s, idx) => {
    questions[`match_${idx}`] = {
      type: 'noul',
      instructions: `Does the content "${s.text.slice(0, 200)}" relate to or answer the search query?`,
    }
  })

  const result = await evaluateJev(
    {
      state: { search_query: query },
      questions,
    },
    options,
  )

  const matches = targetShapes.map((s, idx) => {
    const ans = result.answers[`match_${idx}`] as JevNoulAnswer | undefined
    return {
      id: s.id,
      probability: ans?.noul ?? 0,
    }
  })

  return matches.filter((m) => m.probability > 0.45).sort((a, b) => b.probability - a.probability)
}

/**
 * Assesses whether a user's unlock request is a legitimate sub-step or an impulsive distraction.
 */
export async function evaluateUnlockFriction(
  reason: string,
  currentFocusTitle: string,
  options?: { apiKey?: string; baseUrl?: string },
): Promise<{ isLegitimate: boolean; probability: number }> {
  if (!reason.trim()) {
    return { isLegitimate: false, probability: 0 }
  }

  const result = await evaluateJev(
    {
      state: {
        active_focus_task: currentFocusTitle,
        user_stated_reason: reason,
      },
      questions: {
        legitimacy: {
          type: 'noul',
          instructions:
            'Is `user_stated_reason` a legitimate, work-related subtask, documentation lookup, or necessary blocker removal for `active_focus_task`?',
          criteria: {
            true: 'Legitimate dependency, lookup, or emergency work task',
            false: 'Impulsive distraction, context-switch, social media, or wandering away from work',
          },
        },
      },
    },
    options,
  )

  const prob = (result.answers.legitimacy as JevNoulAnswer)?.noul ?? 0.5
  return {
    isLegitimate: prob >= 0.7,
    probability: prob,
  }
}
