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
 * Prefer a live superuser JWT (Admin UI / MCP `POCKETBASE_AUTH_TOKEN`):
 *   POCKETBASE_URL=https://foqz.yruiz.site \
 *   POCKETBASE_AUTH_TOKEN='eyJ...' \
 *   node ./scripts/ensure-pocketbase-schema.mjs --apply
 *
 * A fresh server with no superuser can use the installer URL from
 * `journalctl -u pb-foqz` instead. The installer token lasts 30 minutes.
 *   POCKETBASE_URL=https://foqz.yruiz.site \
 *   POCKETBASE_INSTALLER_TOKEN='https://foqz.yruiz.site/_/#/pbinstall/...' \
 *   node ./scripts/ensure-pocketbase-schema.mjs --apply
 *
 * Apply:
 *   node ./scripts/ensure-pocketbase-schema.mjs --apply
 */
import { USERS_COLLECTION_ID } from "./pocketbase-schema-defs.mjs";
import {
  authTokenFrom,
  installerTokenFrom,
  placeholderAdminBlocked,
} from "./pocketbase-schema-auth.mjs";

const APPLY = process.argv.includes("--apply");
const url = (process.env.POCKETBASE_URL || "https://foqz.yruiz.site").replace(/\/+$/, "");
const email = process.env.POCKETBASE_ADMIN_EMAIL || "";
const password = process.env.POCKETBASE_ADMIN_PASSWORD || "";
const bearerToken = authTokenFrom(process.env.POCKETBASE_AUTH_TOKEN);
const installerToken = installerTokenFrom(process.env.POCKETBASE_INSTALLER_TOKEN);

const OWNER_RULE = "owner = @request.auth.id";
const BOARD_READ = "workspace.owner = @request.auth.id";
const BOARD_WRITE =
  "@request.auth.id != '' && workspace.owner = @request.auth.id && last_modified_by = @request.auth.id";
const TIMESTAMP_FIELDS = [
  { name: "created", type: "autodate", onCreate: true, onUpdate: false },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];

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
      ...TIMESTAMP_FIELDS,
    ],
    indexes: [
      "CREATE UNIQUE INDEX `idx_workspaces_owner_name` ON `workspaces` (`owner`, `name`)",
    ],
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
      ...TIMESTAMP_FIELDS,
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
  if (placeholderAdminBlocked(url, email) && !installerToken && !bearerToken) {
    console.error(
      "Refusing placeholder example.com admin against a non-local PocketBase server. No collections were changed."
    );
    process.exitCode = 1;
    return;
  }

  const token =
    bearerToken || installerToken || (await passwordToken(url, email, password));
  if (!token) return;

  const headers = {
    authorization: token,
    "content-type": "application/json",
  };
  const listRes = await fetch(`${url}/api/collections?perPage=200`, { headers });
  if (!listRes.ok) throw new Error(`Could not list collections (${listRes.status}).`);
  const listed = await listRes.json();
  const items = Array.isArray(listed.items) ? listed.items : [];
  const byName = new Map(items.map((item) => [item.name, item]));

  const workspaceDesired = workspaceCollection(USERS_COLLECTION_ID);
  const workspaceExisting = byName.get("workspaces");
  const workspaceId = workspaceExisting?.id;
  const boardDesired = workspaceId
    ? boardCollection(USERS_COLLECTION_ID, workspaceId)
    : null;
  const boardExisting = byName.get("boards");

  const plan = [];
  if (!workspaceExisting) plan.push("create workspaces");
  else if (rulesDrift(workspaceExisting, workspaceDesired)) plan.push("update workspaces rules");
  if (workspaceExisting && missingTimestamps(workspaceExisting).length) {
    plan.push("add workspaces created and updated");
  }
  if (!boardExisting) plan.push("create boards");
  else if (boardDesired && rulesDrift(boardExisting, boardDesired)) plan.push("update boards rules");
  if (boardExisting && missingTimestamps(boardExisting).length) {
    plan.push("add boards created and updated");
  }

  if (!APPLY) {
    if (plan.length === 0) console.log("workspaces and boards already match.");
    else console.log(`Pending with --apply:\n  ${plan.join("\n  ")}`);
    return;
  }

  let ensuredWorkspaceId = workspaceId;
  if (!workspaceExisting) {
    const created = await createCollection(url, headers, workspaceDesired);
    ensuredWorkspaceId = created.id;
    console.log(`Created workspaces (${ensuredWorkspaceId}).`);
  } else if (rulesDrift(workspaceExisting, workspaceDesired)) {
    await patchCollection(url, headers, workspaceExisting.id, rulePatch(workspaceDesired));
    console.log(`Updated workspaces rules (${workspaceExisting.id}).`);
  }
  if (workspaceExisting) await ensureTimestamps(url, headers, workspaceExisting);

  const ensuredBoardDesired = boardCollection(USERS_COLLECTION_ID, ensuredWorkspaceId);
  if (!boardExisting) {
    const created = await createCollection(url, headers, ensuredBoardDesired);
    console.log(`Created boards (${created.id}).`);
  } else if (rulesDrift(boardExisting, ensuredBoardDesired)) {
    await patchCollection(url, headers, boardExisting.id, rulePatch(ensuredBoardDesired));
    console.log(`Updated boards rules (${boardExisting.id}).`);
  }
  if (boardExisting) await ensureTimestamps(url, headers, boardExisting);
  if (plan.length === 0) console.log("workspaces and boards already match.");
}

async function passwordToken(baseUrl, identity, secret) {
  if (!identity || !secret) {
    console.log(
      "Set POCKETBASE_AUTH_TOKEN, POCKETBASE_INSTALLER_TOKEN, or POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD."
    );
    console.log("No request was sent.");
    return "";
  }
  const authRes = await fetch(`${baseUrl}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identity, password: secret }),
  });
  if (!authRes.ok) {
    throw new Error(`Superuser auth failed (${authRes.status}). No collections were changed.`);
  }
  const auth = await authRes.json();
  return typeof auth.token === "string" ? auth.token : "";
}

function rulePatch(body) {
  return {
    listRule: body.listRule,
    viewRule: body.viewRule,
    createRule: body.createRule,
    updateRule: body.updateRule,
    deleteRule: body.deleteRule,
    indexes: body.indexes,
  };
}

function missingTimestamps(existing) {
  const names = new Set((existing.fields ?? []).map((field) => field.name));
  return TIMESTAMP_FIELDS.filter((field) => !names.has(field.name));
}

async function ensureTimestamps(baseUrl, headers, existing) {
  const missing = missingTimestamps(existing);
  if (missing.length === 0) return existing;
  await patchCollection(baseUrl, headers, existing.id, {
    fields: [...(existing.fields ?? []), ...missing],
  });
  console.log(`Added created and updated on ${existing.name} (${existing.id}).`);
  return existing;
}

function rulesDrift(existing, desired) {
  const patch = rulePatch(desired);
  const rulesDiffer = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"].some(
    (key) => (existing[key] ?? "") !== (patch[key] ?? "")
  );
  const indexesDiffer = JSON.stringify(existing.indexes ?? []) !== JSON.stringify(patch.indexes);
  return rulesDiffer || indexesDiffer;
}

async function patchCollection(baseUrl, headers, id, body) {
  const res = await fetch(`${baseUrl}/api/collections/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Update ${id} failed (${res.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
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
