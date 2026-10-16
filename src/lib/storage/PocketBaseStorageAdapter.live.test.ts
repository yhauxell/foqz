import { randomUUID } from "node:crypto";
import PocketBase from "pocketbase";
import { describe, expect, it } from "vitest";
import { CloudConflictError } from "@/lib/pocketbase/errors";
import { toPocketBaseClient } from "@/lib/pocketbase/client";
import { PocketBaseStorageAdapter } from "@/lib/storage/PocketBaseStorageAdapter";
import { createEmptySnapshot } from "@/lib/storage/snapshot";

const url = process.env.POCKETBASE_URL ?? "";

async function registerUser(): Promise<PocketBase> {
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  const email = `live-${randomUUID()}@example.com`;
  const password = "live-pass-123";
  await pb.collection("users").create({
    email,
    password,
    passwordConfirm: password,
    name: "Live",
    emailVisibility: false,
  });
  await pb.collection("users").authWithPassword(email, password);
  return pb;
}

describe.skipIf(!url)("PocketBaseStorageAdapter against a PocketBase server", () => {
  it("creates a personal workspace, saves a board, and hides it from other users", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const adapter = new PocketBaseStorageAdapter(() => toPocketBaseClient(owner));
    const snapshot = createEmptySnapshot({
      revision: 1,
      nodes: [{ id: "n1", position: { x: 4, y: 8 }, data: { label: "Task" } }],
      updatedAt: 1_700_000_000_000,
    });

    await adapter.saveBoard("board-default", snapshot, "Focus");
    const listed = await adapter.listBoards();
    expect(listed.map((board) => board.id)).toEqual(["board-default"]);
    expect(listed[0]?.name).toBe("Focus");

    const loaded = await adapter.loadBoard("board-default");
    expect(loaded?.revision).toBe(1);
    expect(loaded?.nodes).toEqual(snapshot.nodes);

    await adapter.saveBoardCatalog([{ id: "board-default", name: "Renamed", createdAt: 1 }]);
    const renamed = await adapter.listBoards();
    expect(renamed[0]?.name).toBe("Renamed");

    const outsider = new PocketBaseStorageAdapter(() => toPocketBaseClient(other));
    await expect(outsider.listBoards()).resolves.toEqual([]);
    await expect(outsider.loadBoard("board-default")).resolves.toBeNull();

    const row = await owner.collection("boards").getFirstListItem('local_id = "board-default"');
    await expect(
      other.collection("boards").update(row.id, { name: "Stolen", revision: 2 })
    ).rejects.toMatchObject({ status: 404 });

    await adapter.deleteBoard("board-default");
    await expect(adapter.loadBoard("board-default")).resolves.toBeNull();
  });

  it("refuses to overwrite a newer remote revision", async () => {
    const owner = await registerUser();
    const adapter = new PocketBaseStorageAdapter(() => toPocketBaseClient(owner));
    const snapshot = createEmptySnapshot({ revision: 1, updatedAt: 1 });
    await adapter.saveBoard("board-conflict", snapshot, "Conflict");

    const row = await owner.collection("boards").getFirstListItem('local_id = "board-conflict"');
    await owner.collection("boards").update(row.id, {
      revision: 8,
      snapshot: { ...snapshot, revision: 8 },
      last_modified_by: owner.authStore.record?.id,
    });

    const next = createEmptySnapshot({ revision: 2, updatedAt: 2 });
    await expect(adapter.saveBoard("board-conflict", next, "Conflict")).rejects.toBeInstanceOf(
      CloudConflictError
    );
    const remote = await adapter.loadBoard("board-conflict");
    expect(remote?.revision).toBe(8);
  });

  it("keeps this device one revision past a newer remote row", async () => {
    const owner = await registerUser();
    const adapter = new PocketBaseStorageAdapter(() => toPocketBaseClient(owner));
    const snapshot = createEmptySnapshot({ revision: 1, updatedAt: 1 });
    await adapter.saveBoard("board-keep", snapshot, "Keep");
    const row = await owner.collection("boards").getFirstListItem('local_id = "board-keep"');
    await owner.collection("boards").update(row.id, {
      revision: 4,
      snapshot: {
        ...snapshot,
        revision: 4,
        nodes: [{ id: "remote", position: { x: 1, y: 1 }, data: {} }],
      },
      last_modified_by: owner.authStore.record?.id,
    });

    const kept = await adapter.keepLocalBoard(
      "board-keep",
      createEmptySnapshot({
        revision: 2,
        updatedAt: 2,
        nodes: [{ id: "local", position: { x: 0, y: 0 }, data: {} }],
      }),
      "Keep"
    );

    expect(kept.revision).toBe(5);
    expect(kept.nodes[0]?.id).toBe("local");
    const remote = await adapter.loadBoard("board-keep");
    expect(remote?.revision).toBe(5);
    expect(remote?.nodes[0]?.id).toBe("local");
  });

  it("rejects a second Personal workspace for the same owner", async () => {
    const owner = await registerUser();
    const adapter = new PocketBaseStorageAdapter(() => toPocketBaseClient(owner));
    await adapter.saveBoard(
      "board-a",
      createEmptySnapshot({ revision: 1, updatedAt: 1 }),
      "A"
    );
    await expect(
      owner.collection("workspaces").create({
        name: "Personal",
        owner: owner.authStore.record?.id,
      })
    ).rejects.toMatchObject({ status: 400 });
    const listed = await adapter.listBoards();
    expect(listed.map((board) => board.id)).toEqual(["board-a"]);
  });

  it.skipIf(typeof EventSource === "undefined")(
    "receives a remote board update on one realtime subscription",
    async () => {
      const owner = await registerUser();
      const listener = new PocketBase(url);
      listener.autoCancellation(false);
      listener.authStore.save(owner.authStore.token, owner.authStore.record);
      const adapter = new PocketBaseStorageAdapter(() => toPocketBaseClient(listener));
      const snapshot = createEmptySnapshot({ revision: 1, updatedAt: 1 });
      await adapter.saveBoard("board-live", snapshot, "Live");

      const seen: number[] = [];
      const stop = await adapter.subscribeChanges((event) => {
        if (event.localId === "board-live" && event.snapshot) seen.push(event.snapshot.revision);
      });
      const row = await owner.collection("boards").getFirstListItem('local_id = "board-live"');
      await owner.collection("boards").update(row.id, {
        revision: 3,
        snapshot: { ...snapshot, revision: 3 },
        last_modified_by: owner.authStore.record?.id,
      });

      const deadline = Date.now() + 5000;
      while (seen.length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      stop();
      expect(seen).toContain(3);
    }
  );
});
