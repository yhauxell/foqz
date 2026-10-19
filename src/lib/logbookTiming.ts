/**
 * Utilities for computing Workday sweep milestones and task eligibility
 * based on working hours and completion timestamps.
 */

export interface WorkingHoursConfig {
  startMin: number; // e.g. 540 = 9:00 AM
  endMin: number;   // e.g. 1020 = 5:00 PM
}

export function formatWorkdayId(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getMinuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Checks whether a completed task is ready to be swept into the Logbook.
 *
 * Locked rules from spec:
 * 1. Tasks completed during workday (startMin <= completedAt < endMin) sweep at endMin of that day.
 * 2. Tasks completed outside working hours stay visible overnight and sweep at next startMin.
 * 3. Tasks from earlier days whose sweep milestone has passed sweep immediately (offline catch-up).
 */
export function isTaskEligibleForSweep(
  completedAt: number,
  now: Date = new Date(),
  workingHours: WorkingHoursConfig = { startMin: 540, endMin: 1020 }
): { eligible: boolean; workdayId: string } {
  const cDate = new Date(completedAt);
  const workdayId = formatWorkdayId(cDate);
  const nowWorkdayId = formatWorkdayId(now);
  const cMin = getMinuteOfDay(cDate);
  const nowMin = getMinuteOfDay(now);

  const isCompletedInWorkingHours =
    cMin >= workingHours.startMin && cMin < workingHours.endMin;

  // Case 1: Completed on the current calendar day
  if (workdayId === nowWorkdayId) {
    if (isCompletedInWorkingHours) {
      // Sweeps at or after endMin today
      return {
        eligible: nowMin >= workingHours.endMin,
        workdayId,
      };
    }

    // Completed outside working hours today:
    if (cMin < workingHours.startMin) {
      // Completed in the early morning before work started (e.g. 2:00 AM).
      // Sweeps at startMin today.
      return {
        eligible: nowMin >= workingHours.startMin,
        workdayId,
      };
    }

    // Completed in late evening after work ended (cMin >= endMin).
    // Stays visible overnight; sweeps at next day's startMin.
    return {
      eligible: false,
      workdayId,
    };
  }

  // Case 2: Completed on a previous day
  // Calculate difference in calendar days
  const startOfCompletedDay = new Date(cDate.getFullYear(), cDate.getMonth(), cDate.getDate()).getTime();
  const startOfNowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayDiff = Math.round((startOfNowDay - startOfCompletedDay) / (1000 * 60 * 60 * 24));

  if (dayDiff > 1) {
    // 2 or more days ago: sweep milestone has definitely passed
    return { eligible: true, workdayId };
  }

  if (dayDiff === 1) {
    // Exactly yesterday:
    if (isCompletedInWorkingHours) {
      // Workday task from yesterday: milestone was yesterday endMin, so already passed
      return { eligible: true, workdayId };
    }

    if (cMin < workingHours.startMin) {
      // Early morning task from yesterday: milestone was yesterday startMin
      return { eligible: true, workdayId };
    }

    // Late night task from yesterday (completed after yesterday endMin):
    // Stays visible overnight until startMin TODAY.
    return {
      eligible: nowMin >= workingHours.startMin,
      workdayId,
    };
  }

  // If completed in future (clock skew), don't sweep
  return { eligible: false, workdayId };
}
