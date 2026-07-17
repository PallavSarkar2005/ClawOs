const prisma = require("../../database/prisma");
const { nextCronRun } = require("./cron");
const { startExecution } = require("../engine/runtime");

let timer = null;
let running = false;

async function computeNextRun(schedule) {
  if (schedule.oneShotAt) {
    return new Date(schedule.oneShotAt) > new Date() ? new Date(schedule.oneShotAt) : null;
  }
  if (schedule.delayMs && !schedule.lastRunAt) {
    return new Date(Date.now() + Number(schedule.delayMs));
  }
  if (schedule.cron) {
    return nextCronRun(schedule.cron, new Date(), schedule.timezone || "UTC");
  }
  return null;
}

async function ensureNextRun(schedule) {
  const next = await computeNextRun(schedule);
  if (next?.getTime() !== schedule.nextRunAt?.getTime()) {
    await prisma.workflowSchedule.update({
      where: { id: schedule.id },
      data: { nextRunAt: next },
    });
  }
  return next;
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const due = await prisma.workflowSchedule.findMany({
      where: {
        enabled: true,
        OR: [
          { nextRunAt: { lte: now } },
          // missed recovery: last scheduled but never ran past window
          {
            missedRecovery: true,
            nextRunAt: null,
            oneShotAt: { lte: now },
          },
        ],
      },
      include: { workflow: true },
      take: 50,
    });

    for (const schedule of due) {
      if (!schedule.workflow?.enabled) continue;
      if (schedule.maxRuns != null && schedule.runCount >= schedule.maxRuns) {
        await prisma.workflowSchedule.update({
          where: { id: schedule.id },
          data: { enabled: false, lastStatus: "max_runs" },
        });
        continue;
      }

      try {
        await startExecution({
          workflowId: schedule.workflowId,
          userId: schedule.workflow.userId,
          inputs: schedule.inputs || {},
          triggerType: schedule.cron ? "cron" : schedule.oneShotAt ? "schedule" : "schedule",
          triggerData: { scheduleId: schedule.id, cron: schedule.cron, timezone: schedule.timezone },
          projectId: schedule.workflow.projectId,
        });

        const updated = await prisma.workflowSchedule.update({
          where: { id: schedule.id },
          data: {
            lastRunAt: now,
            lastStatus: "started",
            runCount: { increment: 1 },
            oneShotAt: schedule.oneShotAt ? null : schedule.oneShotAt,
            enabled: schedule.oneShotAt || schedule.delayMs ? false : schedule.enabled,
          },
        });

        if (updated.enabled && updated.cron) {
          const next = nextCronRun(updated.cron, now, updated.timezone || "UTC");
          await prisma.workflowSchedule.update({
            where: { id: updated.id },
            data: { nextRunAt: next },
          });
        } else {
          await prisma.workflowSchedule.update({
            where: { id: schedule.id },
            data: { nextRunAt: null },
          });
        }
      } catch (err) {
        await prisma.workflowSchedule.update({
          where: { id: schedule.id },
          data: { lastStatus: `error:${err.message}`.slice(0, 200) },
        });
        // still advance cron to avoid hammering
        if (schedule.cron) {
          const next = nextCronRun(schedule.cron, now, schedule.timezone || "UTC");
          await prisma.workflowSchedule.update({
            where: { id: schedule.id },
            data: { nextRunAt: next },
          });
        }
      }
    }

    // Backfill nextRunAt for enabled schedules missing it
    const missing = await prisma.workflowSchedule.findMany({
      where: { enabled: true, nextRunAt: null, cron: { not: null } },
      take: 20,
    });
    for (const s of missing) await ensureNextRun(s);
  } finally {
    running = false;
  }
}

function startWorkflowScheduler(intervalMs = 15_000) {
  if (timer) return { ok: true, already: true };
  timer = setInterval(() => {
    tick().catch((e) => console.warn("[workflow-scheduler]", e.message));
  }, intervalMs);
  timer.unref?.();
  tick().catch(() => null);
  console.log("[workflow-scheduler] started");
  return { ok: true };
}

function stopWorkflowScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

async function createSchedule(workflowId, userId, data) {
  const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, userId } });
  if (!workflow) throw Object.assign(new Error("Workflow not found"), { status: 404 });

  const schedule = await prisma.workflowSchedule.create({
    data: {
      workflowId,
      cron: data.cron || null,
      timezone: data.timezone || "UTC",
      enabled: data.enabled !== false,
      oneShotAt: data.oneShotAt ? new Date(data.oneShotAt) : null,
      delayMs: data.delayMs != null ? Number(data.delayMs) : null,
      inputs: data.inputs || {},
      missedRecovery: data.missedRecovery !== false,
      maxRuns: data.maxRuns != null ? Number(data.maxRuns) : null,
    },
  });
  const next = await computeNextRun(schedule);
  return prisma.workflowSchedule.update({
    where: { id: schedule.id },
    data: { nextRunAt: next },
  });
}

module.exports = {
  startWorkflowScheduler,
  stopWorkflowScheduler,
  tick,
  createSchedule,
  computeNextRun,
  ensureNextRun,
  nextCronRun,
};
