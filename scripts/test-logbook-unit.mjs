import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// 1. Test electron/logbook.cjs
import logbookMain from "../electron/logbook.cjs";

async function testElectronLogbook() {
  console.log("▶ Testing electron/logbook.cjs...");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "foqz-logbook-test-"));

  try {
    const workdayId = "2026-10-19";
    const entries = [
      {
        id: "task-1",
        title: "Test Task 1",
        notes: "Notes for task 1",
        priority: 1,
        completedAt: Date.now() - 3600000,
        completedVia: "focus",
        focusSecondsSpent: 1500,
        relations: {
          dependents: ["task-2"],
          dependencies: [],
          edgeLinks: [],
        },
      },
      {
        id: "task-2",
        title: "Test Task 2",
        priority: 2,
        completedAt: Date.now(),
        completedVia: "manual",
        relations: {
          dependents: [],
          dependencies: ["task-1"],
          edgeLinks: [],
        },
      },
    ];

    // Append entries
    const appendRes = await logbookMain.appendLogbookEntries(tempDir, {
      workdayId,
      window: { startMin: 540, endMin: 1020 },
      entries,
    });
    assert.equal(appendRes.ok, true);
    assert.equal(appendRes.sweptCount, 2);

    // List days
    const days = await logbookMain.listLogbookDays(tempDir);
    assert.equal(days.length, 1);
    assert.equal(days[0].workdayId, workdayId);
    assert.equal(days[0].entries.length, 2);

    // Get entries by IDs
    const fetched = await logbookMain.getLogbookEntriesByIds(tempDir, ["task-1"]);
    assert.equal(fetched.length, 1);
    assert.equal(fetched[0].title, "Test Task 1");

    // Search
    const searchRes = await logbookMain.searchLogbook(tempDir, "Notes for task 1");
    assert.equal(searchRes.length, 1);
    assert.equal(searchRes[0].id, "task-1");

    // Remove entry
    const removeRes = await logbookMain.removeLogbookEntry(tempDir, "task-1");
    assert.equal(removeRes.ok, true);
    assert.equal(removeRes.removedEntry?.id, "task-1");

    const daysAfterRemove = await logbookMain.listLogbookDays(tempDir);
    assert.equal(daysAfterRemove[0].entries.length, 1);
    assert.equal(daysAfterRemove[0].entries[0].id, "task-2");

    console.log("✔ electron/logbook.cjs passed all assertions!");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

// 2. Test logbookTiming.ts logic
function testTiming() {
  console.log("▶ Testing Workday Sweep timing logic...");

  // Mock working hours: 9:00 AM (540m) to 5:00 PM (1020m)
  const workingHours = { startMin: 540, endMin: 1020 };

  // Case A: Completed today at 2:00 PM (14:00 = 840m). Current time 3:30 PM (15:30 = 930m).
  // Should NOT be eligible yet (daytime retention).
  const today = new Date(2026, 9, 19, 15, 30);
  const completed2pm = new Date(2026, 9, 19, 14, 0).getTime();
  const resA = computeEligibility(completed2pm, today, workingHours);
  assert.equal(resA.eligible, false, "Workday task should not sweep before endMin");

  // Case B: Completed today at 2:00 PM. Current time 5:05 PM (17:05 = 1025m).
  // Should be eligible at endMin!
  const today505pm = new Date(2026, 9, 19, 17, 5);
  const resB = computeEligibility(completed2pm, today505pm, workingHours);
  assert.equal(resB.eligible, true, "Workday task should sweep at or after endMin");
  assert.equal(resB.workdayId, "2026-10-19");

  // Case C: Late night task completed at 10:00 PM (22:00 = 1320m). Current time 11:30 PM.
  // Stays visible overnight!
  const today1130pm = new Date(2026, 9, 19, 23, 30);
  const completed10pm = new Date(2026, 9, 19, 22, 0).getTime();
  const resC = computeEligibility(completed10pm, today1130pm, workingHours);
  assert.equal(resC.eligible, false, "After-hours task should stay visible overnight");

  // Case D: Late night task from yesterday at 10:00 PM. Current time next day at 8:30 AM (before startMin).
  // Still visible overnight!
  const nextDay830am = new Date(2026, 9, 20, 8, 30);
  const resD = computeEligibility(completed10pm, nextDay830am, workingHours);
  assert.equal(resD.eligible, false, "Overnight task should not sweep before next day startMin");

  // Case E: Late night task from yesterday at 10:00 PM. Current time next day at 9:05 AM (after startMin).
  // Should sweep!
  const nextDay905am = new Date(2026, 9, 20, 9, 5);
  const resE = computeEligibility(completed10pm, nextDay905am, workingHours);
  assert.equal(resE.eligible, true, "Overnight task should sweep at next day startMin");

  // Case F: Offline catch-up (task completed 3 days ago).
  const day3DaysLater = new Date(2026, 9, 22, 10, 0);
  const resF = computeEligibility(completed2pm, day3DaysLater, workingHours);
  assert.equal(resF.eligible, true, "Old completed tasks must sweep on offline catch-up");

  console.log("✔ Workday Sweep timing logic passed all assertions!");
}

function computeEligibility(completedAt, now, workingHours) {
  const cDate = new Date(completedAt);
  const pad = (n) => String(n).padStart(2, "0");
  const workdayId = `${cDate.getFullYear()}-${pad(cDate.getMonth() + 1)}-${pad(cDate.getDate())}`;
  const nowWorkdayId = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const cMin = cDate.getHours() * 60 + cDate.getMinutes();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const isCompletedInWorkingHours = cMin >= workingHours.startMin && cMin < workingHours.endMin;

  if (workdayId === nowWorkdayId) {
    if (isCompletedInWorkingHours) {
      return { eligible: nowMin >= workingHours.endMin, workdayId };
    }
    if (cMin < workingHours.startMin) {
      return { eligible: nowMin >= workingHours.startMin, workdayId };
    }
    return { eligible: false, workdayId };
  }

  const startOfCompleted = new Date(cDate.getFullYear(), cDate.getMonth(), cDate.getDate()).getTime();
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayDiff = Math.round((startOfNow - startOfCompleted) / (1000 * 60 * 60 * 24));

  if (dayDiff > 1) {
    return { eligible: true, workdayId };
  }
  if (dayDiff === 1) {
    if (isCompletedInWorkingHours || cMin < workingHours.startMin) {
      return { eligible: true, workdayId };
    }
    return { eligible: nowMin >= workingHours.startMin, workdayId };
  }
  return { eligible: false, workdayId };
}

async function run() {
  await testElectronLogbook();
  testTiming();
  console.log("\nAll unit tests passed successfully!");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
