import {
  evaluateJev,
  type JevChoiceAnswer,
  type JevNoulAnswer,
  type JevQuestion,
} from "./jev";

export type QuickTaskDestinationOption = {
  id: string;
  title: string;
  kind: "project" | "runway";
};

export type QuickTaskCitationOption = {
  id: string;
  title: string;
};

export type ParsedQuickTask = {
  title: string;
  notes: string;
  parentId?: string;
  relatedTaskIds: string[];
  destinationKind: "canvas" | "project" | "runway";
  usedAi: boolean;
};

const NONE = "none";

/** Match `/Name` or `@Name` tokens (multi-word until punctuation / next trigger). */
export const DESTINATION_TOKEN_RE = /\/([^\n/@]+?)(?=\s*[/@]|$|\n)/g;
export const CITATION_TOKEN_RE = /@([^\n/@]+?)(?=\s*[/@]|$|\n)/g;

export function getMentionTrigger(
  text: string,
  cursor: number
): { type: "/" | "@"; start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const match = before.match(/([/@])([^\n/@]*)$/);
  if (!match || match.index === undefined) return null;
  const type = match[1] as "/" | "@";
  // Don't treat email-like mid-word @ as a trigger
  if (type === "@" && match.index > 0) {
    const prev = before[match.index - 1];
    if (prev && /[A-Za-z0-9_]/.test(prev)) return null;
  }
  return {
    type,
    start: match.index,
    query: match[2] || "",
  };
}

export function insertMentionToken(
  text: string,
  cursor: number,
  triggerStart: number,
  token: string
): { text: string; cursor: number } {
  const before = text.slice(0, triggerStart);
  const after = text.slice(cursor);
  const insertion = `${token} `;
  const next = `${before}${insertion}${after}`;
  return { text: next, cursor: before.length + insertion.length };
}

export function stripMentionTokens(text: string): string {
  return text
    .replace(DESTINATION_TOKEN_RE, " ")
    .replace(CITATION_TOKEN_RE, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function findTitleCandidates(raw: string): string[] {
  const cleaned = stripMentionTokens(raw).replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const candidates: string[] = [];
  const push = (value: string) => {
    const v = value.replace(/\s+/g, " ").trim();
    if (!v) return;
    const clipped = v.length > 90 ? `${v.slice(0, 87).trim()}…` : v;
    if (!candidates.some((c) => c.toLowerCase() === clipped.toLowerCase())) {
      candidates.push(clipped);
    }
  };

  const firstLine = cleaned.split(/\n/)[0]?.trim() || "";
  push(firstLine);

  const sentenceMatch = cleaned.match(/^(.+?[.!?])(?:\s|$)/);
  if (sentenceMatch?.[1]) push(sentenceMatch[1]);

  // Clause before an em-dash / " — " / ": "
  const clause = cleaned.split(/\s+[—–-]\s+|:\s+/)[0];
  if (clause) push(clause);

  if (cleaned.length <= 72) push(cleaned);

  return candidates.slice(0, 8);
}

function resolveByTitle(
  titleQuery: string,
  options: Array<{ id: string; title: string }>
): string | undefined {
  const q = titleQuery.trim().toLowerCase();
  if (!q) return undefined;
  const exact = options.find((o) => o.title.trim().toLowerCase() === q);
  if (exact) return exact.id;
  const starts = options.find((o) => o.title.trim().toLowerCase().startsWith(q));
  if (starts) return starts.id;
  const includes = options.find((o) =>
    o.title.trim().toLowerCase().includes(q)
  );
  return includes?.id;
}

export function extractExplicitMentions(
  text: string,
  destinations: QuickTaskDestinationOption[],
  tasks: QuickTaskCitationOption[]
): { destinationId?: string; citedTaskIds: string[] } {
  const destMatches = [...text.matchAll(DESTINATION_TOKEN_RE)].map((m) =>
    m[1].trim()
  );
  const citeMatches = [...text.matchAll(CITATION_TOKEN_RE)].map((m) =>
    m[1].trim()
  );

  let destinationId: string | undefined;
  for (const name of destMatches) {
    const id = resolveByTitle(name, destinations);
    if (id) {
      destinationId = id;
      break;
    }
  }

  const citedTaskIds: string[] = [];
  for (const name of citeMatches) {
    const id = resolveByTitle(name, tasks);
    if (id && !citedTaskIds.includes(id)) citedTaskIds.push(id);
  }

  return { destinationId, citedTaskIds };
}

/**
 * Parse natural-language quick capture into a structured task.
 * Uses TypeSafe Jev to pick title span + destination when needed;
 * falls back to heuristics when the API key is missing.
 */
export async function parseQuickTaskCapture(input: {
  text: string;
  destinations: QuickTaskDestinationOption[];
  tasks: QuickTaskCitationOption[];
  explicitDestinationId?: string;
  explicitCitedTaskIds?: string[];
}): Promise<ParsedQuickTask> {
  const { text, destinations, tasks } = input;
  const fromText = extractExplicitMentions(text, destinations, tasks);
  const explicitDestinationId =
    input.explicitDestinationId || fromText.destinationId;
  const citedTaskIds = Array.from(
    new Set([
      ...(input.explicitCitedTaskIds || []),
      ...fromText.citedTaskIds,
    ])
  );

  const body = stripMentionTokens(text);
  const titleCandidates = findTitleCandidates(text);
  let title = titleCandidates[0] || body.slice(0, 72) || "New Task";
  let parentId = explicitDestinationId;
  let usedAi = false;

  const questions: Record<string, JevQuestion> = {};

  if (titleCandidates.length > 1) {
    questions.title_pick = {
      type: "choice",
      instructions:
        "Which short phrase is the best task title for this capture note? Prefer a concrete, actionable card title.",
      criteria: Object.fromEntries([
        ...titleCandidates.map((c) => [c, null] as const),
        [NONE, "None of these is a good title."],
      ]),
    };
  }

  if (!explicitDestinationId && destinations.length > 0) {
    questions.destination = {
      type: "choice",
      instructions:
        "Which project or runway should this new task be filed under? Pick canvas only when the note does not belong to any listed workspace.",
      criteria: {
        canvas: "Leave unassigned on the open canvas",
        ...Object.fromEntries(
          destinations.map((d) => [
            d.id,
            `${d.kind === "runway" ? "Runway" : "Project"}: ${d.title}`,
          ])
        ),
      },
    };
  }

  // Soft-confirm cited tasks still look related (keeps weak @ picks)
  citedTaskIds.slice(0, 6).forEach((id, idx) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    questions[`cite_${idx}`] = {
      type: "noul",
      instructions: `Does this capture meaningfully relate to, depend on, or reference the existing task "${task.title}"?`,
    };
  });

  if (Object.keys(questions).length > 0) {
    try {
      const result = await evaluateJev({
        state: {
          capture_note: text,
          cleaned_body: body,
          title_candidates: titleCandidates,
          destinations: destinations.map((d) => ({
            id: d.id,
            kind: d.kind,
            title: d.title,
          })),
          cited_tasks: citedTaskIds.map((id) => {
            const t = tasks.find((x) => x.id === id);
            return { id, title: t?.title || id };
          }),
        },
        questions,
      });
      usedAi = true;

      const titleAnswer = result.answers.title_pick as JevChoiceAnswer | undefined;
      if (
        titleAnswer?.choice &&
        titleAnswer.choice !== NONE &&
        titleCandidates.includes(titleAnswer.choice)
      ) {
        title = titleAnswer.choice;
      }

      if (!explicitDestinationId) {
        const destAnswer = result.answers.destination as
          | JevChoiceAnswer
          | undefined;
        const choice = destAnswer?.choice;
        if (choice && choice !== "canvas" && destinations.some((d) => d.id === choice)) {
          parentId = choice;
        }
      }

      const confirmed: string[] = [];
      citedTaskIds.slice(0, 6).forEach((id, idx) => {
        const ans = result.answers[`cite_${idx}`] as JevNoulAnswer | undefined;
        if ((ans?.noul ?? 0.7) >= 0.4) confirmed.push(id);
      });
      if (confirmed.length > 0) {
        // Prefer AI-confirmed subset, but keep all explicit @ if AI was soft
        citedTaskIds.splice(0, citedTaskIds.length, ...confirmed);
      }
    } catch {
      // Offline / missing key: keep heuristics + explicit mentions
      usedAi = false;
    }
  }

  let notes = body;
  if (notes.toLowerCase().startsWith(title.toLowerCase())) {
    notes = notes.slice(title.length).replace(/^[\s.:\-—–]+/, "").trim();
  }
  if (notes.toLowerCase() === title.toLowerCase()) notes = "";

  const destMeta = parentId
    ? destinations.find((d) => d.id === parentId)
    : undefined;

  return {
    title,
    notes,
    parentId,
    relatedTaskIds: citedTaskIds,
    destinationKind: destMeta?.kind || "canvas",
    usedAi,
  };
}
