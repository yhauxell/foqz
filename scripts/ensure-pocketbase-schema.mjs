/**
 * Create Foqz `workspaces` and `boards` on a PocketBase server.
 * Existing collections are left untouched. Writes require `--apply`.
 *
 * Dry run (no writes):
 *   POCKETBASE_URL=https://foqz.yruiz.site \
 *   POCKETBASE_ADMIN_EMAIL=... \
 *   POCKETBASE_ADMIN_PASSWORD=... \
 *   node ./scripts/ensure-pocketbase-schema.mjs
 *
 * Apply:
 *   node ./scripts/ensure-pocketbase-schema.mjs --apply
 */
import { USERS_COLLECTION_ID } from "./pocketbase-schema-defs.mjs";

const APPLY = process.argv.includes("--apply");
const url = (process.env.POCKETBASE_URL || "https://foqz.yruiz.site").replace(/\/+$/, "");
const email = process.env.POCKETBASE_ADMIN_EMAIL || "";
const password = process.env.POCKETBASE_ADMIN_PASSWORD || "";

const OWNER_RULE = "owner = @request.auth.id";
const BOARD_READ = "workspace.owner = @request.auth.id";
const BOARD_WRITE =
  "@request.auth.id != '' && workspace.owner = @request.auth.id && last_modified_by = @request.auth.id";

function workspaceCollection(usersId) {
  return {
    name: "workspaces",
    type: "base",
    listRule: OWNER_RULE,
    viewRule: OWNER_RULE,
    createRule: `@request.auth.id != '' && ${OWNER_RULE}`,
    updateRule: OWNER_RULE,
    deleteRule: OWNER_RULE,
    fields: [
      { name: "name", type: "text", required: true, min: 1, max: 120 },
      {
        name: "owner",
        type: "relation",
        required: true,
        collectionId: usersId,
        cascadeDelete: false,
        minSelect: 1,
        maxSelect: 1,
      },
    ],
    indexes: ["CREATE INDEX `idx_workspaces_owner` ON `workspaces` (`owner`)"],
  };
}

function boardCollection(usersId, workspaceId) {
  return {
    name: "boards",
    type: "base",
    listRule: BOARD_READ,
    viewRule: BOARD_READ,
    createRule: BOARD_WRITE,
    updateRule: BOARD_WRITE,
    deleteRule: BOARD_READ,
    fields: [
      {
        name: "workspace",
        type: "relation",
        required: true,
        collectionId: workspaceId,
        cascadeDelete: true,
        minSelect: 1,
        maxSelect: 1,
      },
      { name: "name", type: "text", required: true, min: 1, max: 200 },
      { name: "local_id", type: "text", required: true, min: 1, max: 80 },
      { name: "snapshot", type: "json", required: true, maxSize: 1_500_000 },
      { name: "revision", type: "number", required: true, onlyInt: true, min: 0 },
      {
        name: "last_modified_by",
        type: "relation",
        required: true,
        collectionId: usersId,
        cascadeDelete: false,
        minSelect: 1,
        maxSelect: 1,
      },
    ],
    indexes: [
      "CREATE UNIQUE INDEX `idx_boards_workspace_local_id` ON `boards` (`workspace`, `local_id`)",
      "CREATE INDEX `idx_boards_workspace` ON `boards` (`workspace`)",
    ],
  };
}

async function main() {
  console.log(`${APPLY ? "Apply" : "Dry run"} against ${url}`);
  console.log("Collections: workspaces, boards");
  console.log(`Users relation target: ${USERS_COLLECTION_ID}`);
  if (!email || !password) {
    console.log("Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD to talk to the server.");
    console.log("No request was sent.");
    return;
  }

  const authRes = await fetch(`${url}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identity: email, password }),
  });
  if (!authRes.ok) {
    throw new Error(`Superuser auth failed (${authRes.status}). No collections were changed.`);
  }
  const auth = await authRes.json();
  const headers = {
    authorization: auth.token,
    "content-type": "application/json",
  };
  const listRes = await fetch(`${url}/api/collections?perPage=200`, { headers });
  if (!listRes.ok) throw new Error(`Could not list collections (${listRes.status}).`);
  const listed = await listRes.json();
  const items = Array.isArray(listed.items) ? listed.items : [];
  const byName = new Map(items.map((item) => [item.name, item]));

  if (byName.has("workspaces") && byName.has("boards")) {
    console.log("workspaces and boards already exist. Nothing to create.");
    return;
  }

  if (!APPLY) {
    console.log("Missing collections would be created only with --apply.");
    if (!byName.has("workspaces")) console.log("  create workspaces");
    if (!byName.has("boards")) console.log("  create boards");
    return;
  }

  let workspaceId = byName.get("workspaces")?.id;
  if (!workspaceId) {
    const created = await createCollection(url, headers, workspaceCollection(USERS_COLLECTION_ID));
    workspaceId = created.id;
    console.log(`Created workspaces (${workspaceId}).`);
  }
  if (!byName.has("boards")) {
    const created = await createCollection(
      url,
      headers,
      boardCollection(USERS_COLLECTION_ID, workspaceId)
    );
    console.log(`Created boards (${created.id}).`);
  }
}

async function createCollection(baseUrl, headers, body) {
  const res = await fetch(`${baseUrl}/api/collections`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Create ${body.name} failed (${res.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
