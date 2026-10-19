---
name: chi
description: Archis's method for answering questions about this repository from its pre-built semantic index instead of reading files. Use when exploring an unfamiliar codebase, locating a symbol, finding who calls what, judging the blast radius of a change, checking whether exact text appears anywhere, or planning an edit — and whenever the next step would otherwise be Read, Grep or Glob to find out what a repository contains. Covers the batching rules that make Archis cheap, Archis's session memory, and the `chi` CLI fallback when the MCP server is not connected.
metadata:
  version: "0.52.0"
  digest: "fnv1a64:771de8f6bb9ce938"
  managed: "written by `chi skill install` — local edits are replaced when Archis updates"
---

# Archis — ask the repository, do not read it

Archis keeps a pre-built semantic index of this repository: every symbol, its kind,
its signature, its line span, its imports, and who calls whom. Asking it a
question costs a fraction of what finding the same answer by reading files
costs, and it is already built — the server indexes on its first call and
refreshes itself as files change.

This skill is the method. The tool descriptions say what each call *is*; what
follows is the order to make them in, and what to do when the answer is not
where you first looked.

## The one rule everything else follows from

**A turn is the unit of cost, not a token.** Every tool call ends a turn, and
every turn re-sends the entire conversation *and* buys a fresh reasoning block.
Ten calls in ten messages cost ten times what ten calls in one message cost, for
identical information.

So: **independent calls go in the same message**, and **never loop a singular
form when a plural exists**. `get_files(paths=[a, b, c])` is one turn;
three `get_file` calls are three. This is the difference the whole product is
built around, and it is the one thing a model reliably gets wrong unprompted.

## Start here: one call, not four

```
chi_context(task="<the whole question, in prose>", intent="understand")
```

This is the first call for anything you do not already have coordinates for. It
runs, inside the server, the passes you would otherwise spend a turn each on:
rank the repository against your task, outline the files it lands in, project
the symbols that matter, and scan for any literal your task quoted. One package,
one turn.

Measured on five real questions about this repository, the hand-made version of
that sequence costs three to five turns and 24,000–43,000 input tokens; the
single call costs 10,000–11,000 and answers the same questions. The saving is
not that the package is smaller — it is that the announce and the growing
conversation are not re-sent three more times.

**Name the intent.** It is an allocation, not a hint, and it changes what the
package is made of:

| `intent` | What you get |
|---|---|
| `understand` | outlines and projections, breadth, no bytes |
| `debug` | the same, plus a scan of the whole index for every literal your task quoted |
| `edit` | narrow, and exact: the target's source, its `content_hash`, its callers, the signatures it must keep honouring, its tests |
| `test` | what covers this, and where a new test would go |
| `review` | breadth, and who calls what |

**Quote what you saw.** For `debug`, put the error text, the log line or the
config key in quotes inside `task`. Quoted strings are scanned across every
indexed file — and if one is *not* there, you are told that too, which means it
is assembled from a format string and no whole-string search will ever find it.

**Read `confidence` for what it is.** It says how far the top candidate stands
clear of the runner-up, not whether it is right: a high value is often a
confident wrong answer, so check the top file against the task before building
on it. Low means the field was flat: `files` is then the part to trust, and the
response names the call that recovers.

**A second call on the same area does not repeat itself.** Projections this
session has already been given are left out and the room goes to ones it has
not, so the follow-up call is all new information rather than 60% restatement.

## Which call answers which question

After `chi_context`, for what it did not settle:

| What you want to know | Call |
|---|---|
| What is this repository, how big, what languages | `project_overview()` |
| What is in these files | `get_files(paths=[…], view="outline")` |
| What does this named thing look like | `get_symbols(ids=[…], detail="behavior")` |
| Does this exact text appear anywhere | `contains(tokens=[…], paths=[…])` |
| Where is something called X | `search(queries=[…])` |
| Who calls this, what does it call, what breaks if I change it | `get_relations(ids=[…])` |
| The literal bytes, because nothing else will do | `get_files(paths=[…], view="full")` or `get_symbols(ids=[…], detail="source")` |
| Code in the other repositories of this one's workspace | `federation_context(task="…")` |
| Which branch and commit each workspace member is at, what changed between two states, which ticket or PR made a commit | `federation_workspace`, `federation_diff`, `federation_lineage` |
| The lines around a fragment of another repository | `federation_read(repository="…", path="…", lines="120-260")` |
| Which commit, ticket or PR wrote those lines | `federation_history(repository="…", path="…", lines="1477-1478")` |

The row most often skipped is the expensive one to skip: **`contains` is the
only tool that sees inside bodies.** Outlines carry symbols, kinds, spans and
imports — not comments, not string literals, not statement bodies. If the
question is "is this string here", an outline will not answer it and a
`view="full"` read is a thousand times the tokens for the same yes/no.

Exact source is capped per session. When a call comes back trimmed, the response
says so and says what remains: that is the budget speaking. Do not route around
it by asking for the same bytes through a different tool.

## Recipes

**Unfamiliar repository, open-ended question.**
`project_overview()` and `chi_context(task="<the question>")` in one message.
The overview tells you the shape; the package tells you where to stand.

**A bug report or a stack trace.**
`chi_context(task="<paste the whole thing>", intent="debug")` — one call. Paste
it *whole*, quotes and all: every term seeds the ranking, and the quoted error
text is scanned across the index in the same pass. Do not summarise it first;
a fuller task is a better answer, not a costlier one.

**"Where is X handled?"**
If X is a name you already have, `search(queries=["X", "handleX", "x_handler"])`
— the plural form, several spellings, one call. If it is a behaviour rather than
a name, that is `chi_context`.

**Before changing a function.**
`chi_context(task="<what you are about to change and why>", intent="edit",
symbols=["<the function>"])`. That returns the current source, the hash to patch
against, the blast radius and the tests, in one turn — the four calls it used to
take.

**"Does this repository use Y anywhere?"**
`contains(tokens=["Y"])` — not a `search`, and certainly not a Grep sweep.
Hit counts and paths, no file bodies.

**The task is about another repository too.**
`federation_context(task="<the question>")`, when the session lists it — it is
there only where a registry composes this repository with others in a federated
workspace, on a Team or Enterprise plan. It searches every member at the exact
commits the workspace names, repositories that live only on the organization's
CAVS DB Server included, and each fragment says which repository and commit it
came from. A repository you may not read is listed under `inaccessible`, with
nothing of it returned: say that it exists, not what is in it. `chi_context`
points at it when its task names another repository of the workspace.
Where it is listed, `federation_workspace(federation_workspace="…")` gives each
member's requested branch and exact commits, `federation_diff(from="…")` the
repositories, files and commits that changed between two states, and
`federation_lineage(repository="…", commit="…")` the feature, ticket and pull
request behind a commit — ask them instead of inferring any of it from code.
`federation_read(repository="…", path="…", lines="…")` reads the lines around a
fragment: the function under a comment, the rest of a definition.
`federation_history(repository="…", path="…", lines="…")` names the commits that
wrote those lines, with the feature, ticket and pull request behind each — the
member's `git blame`, with or without a checkout here.

**Reviewing a change across several files.**
One `get_files(paths=[all of them], view="outline")` first. Outlines plus line
spans are usually enough to reason about structure; pull `view="full"` only for
the files where the change is subtle.

## Session memory

Archis remembers across turns so your context does not have to. Where the server
offers `session_report`, the accounting it returns — tokens per level, per tool,
per turn, escalation rates — is how you check that a long session is still
cheap. If a session is escalating to L3 repeatedly, passes 1–3 are being skipped.

The fuller session tools (`session_create`, `task_set`, `decision_add`,
`checkpoint_create`, `session_rehydrate`) exist on the full toolset. On a long
task, recording a decision costs one call and saves re-deriving it after a
compaction.

## Close a task with what it cost

When the work is done and you write your summary for the person, spend one call
on `session_report()` — no arguments, it reports the session you are in.

**Write it as one or two plain sentences at the end of your summary. Never a
table, never a code block, never the raw JSON.** The numbers below are what to
say, not a layout to fill in: this is a closing remark somebody reads in passing,
and the same fact rendered as a three-column table every time reads as a report
they did not ask for. What goes in those sentences:

- how many calls Archis answered, and the tokens it served;
- `saving.net`, which is `saving.baseline_tokens` less `saving.served_tokens` —
  what those projections stood in for, less what they cost to serve — with
  `saving.reduction` as the share;
- `saving.double_read` when it is not zero, because a file you outlined and then
  read in full anyway is a cost, not a saving, and a summary that hides it is
  the kind of number nobody should believe twice.

`saving.assumed_tokens` is not a saving and is never quoted as one: it is what
symbol views would claim had each replaced reading its whole file, an
assumption the figures above leave out on purpose.

If subagents did some of the reading, `session_report(scope="tree")` returns a
row per agent under `agents` and the sum under `totals`. Say the total, and name
the agents that spent the most in the same sentence rather than listing every
row: on a task that delegated its exploration, your own row is the smaller half
of what happened, and that is one clause, not a table.

Where `saving.full_tokens` is zero nothing has been priced, and the report says
why in `saving.reason` (`totals.reason` for a tree): Archis was never called,
or it answered from a missing index, or every call was an overview, a search or
a `contains` that replaces no file read. Say that sentence. A measured zero and
an unmeasured one are different answers and only one of them is honest here.

If every Archis call answers with an error saying the repository needs a Team
plan — the usual case is a Free account in an organization's repository — the
tools are disabled there, not failing. Stop calling them for the rest of the
session, read the code with your own tools, and tell the person once, in your
first reply, that Archis needs a Team plan for this repository. There is no
closing report to give in that case.

## Editing

If `apply_patch` is in the tool list, the server was started with writes on and
edits go through it: `apply_patch(patches=[{file, base_hash, operations}, …])`.
The outline already gave you every symbol's line span and every file's
`content_hash`, so an edit needs no further read. Emit only what the region
becomes — do not quote the old text back to locate it, and never re-emit a whole
file to change part of it. Every file and every hunk goes in one call: nothing is
written unless all of them verify.

If `apply_patch` is *not* in the tool list, writes are off by design. Use the
harness's own editor — but locate the edit with Archis first, so the editor is
handed coordinates instead of being used to search.

## When Archis's tools are not in this session

The MCP server may not be registered. Do not silently fall back to reading the
whole repository — say so, and use the CLI, which answers the same questions from
the same index:

```bash
chi overview                        # project_overview
chi search "<query>" --limit 20     # search
chi symbol <id> --detail behavior   # get_symbols (signature|behavior|source)
chi context "<the whole question>"  # chi_context; --intent edit for a patch
chi callers <id>                    # get_relations, callers
chi callees <id>                    # get_relations, callees
chi impact <id> --depth 3           # transitive callers — the blast radius
chi source <id>                     # exact source, L3
chi workspace context <ws> <words…> # federation_context
```

The CLI pays process start on every invocation and holds no session, so batch
what you can and prefer the server when it is available. Registering it is one
command and takes effect on the harness's next start:

```bash
chi mcp on claude      # or: chi mcp status, to see what is connected
```

If `chi` itself is missing from the PATH, Archis is not installed on this machine
and none of the above applies — fall back to the harness's own tools and say
that is what you are doing.

## When an answer is not Archis's

Archis never answers with a handle to fetch from another tool. Its own pointer
is `<<chi:…>>`, and `retrieve_artifact` resolves it. A chi call that comes back
as a `[CommandResult]` or `[FileObservation]` stub, with a `ccr://` handle and a
line about `caveman_retrieve`, was replaced after it left Archis, by another
tool's hook in the harness. If that handle resolves, use it. If it does not,
do not retry it. Tell the person that the hook is in the way, and point them
at `chi doctor`, which names the hook, the file it is in, and how to turn it
off. A hook that covers every tool covers the shell too, so the `chi` CLI is
no way around it.

## Anti-patterns

- Reading files one at a time to discover what is in them. That is pass 1, and
  it is one call.
- Looping `get_symbols` per symbol, or `get_files` per path. The plural is the
  point.
- Reaching for Grep to answer "does this text exist" — `contains` answers it
  without reading the files.
- Re-requesting content already returned this session. It is still in your
  context; asking again returns a pointer, not the bytes, and costs a turn.
  A file that changed since comes back as bytes, so a pointer is never stale.
- Escalating to `view="full"` because an outline "might" be missing something.
  Check with `contains` first — that is what it is for.
- Using `search` on a described symptom. `search` matches names; a symptom has
  none. That is `chi_context`.
- Assembling `chi_context`'s package by hand out of `compact_select`,
  `get_files` and `get_symbols`. Those calls all still work and each one costs
  a turn; the whole point of the package is that it costs one.
- Shortening the `task` to keywords. Every term in it seeds the ranking, and
  quoted text is searched for literally. Prose is the input format.
