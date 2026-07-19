/**
 * Autonomous Software Engineer — main orchestration engine.
 * Reuses Coordinator Runtime, agents, tools, context, knowledge, observability.
 */

const EventEmitter = require("events");
const {
  SESSION_STATUS,
  GOAL_STATUS,
  STREAM_EVENTS,
  HEARTBEAT_INTERVAL_MS,
} = require("./constants");
const { createMasterPlan, replanAfterFailure } = require("./planner/master");
const { createSharedMemory } = require("./agents/collaboration");
const {
  createGoal,
  updateGoal,
  persistPlan,
  createSession,
  updateSession,
  saveCheckpoint,
  getSession,
  listSessions,
  listGoals,
  getGoal,
  requestCancel,
} = require("./session/persist");
const { executePlan } = require("./execution/runner");
const { runImprovementLoop } = require("./loops/improvement");
const { createBranch, commitChanges, planPullRequest, getDiff } = require("./git/integration");
const { beginSessionTrace, attachAutonomyEmitter } = require("./bridge/observability");
const { listApprovals, resolveApproval } = require("./approval/gate");
const { listDecisions } = require("./decision/engine");
const { listArtifacts, getArtifact } = require("./artifacts/manager");
const { evaluateSession } = require("./quality/gates");
const { resolveProjectRoot } = require("../tools/engine/workspace-path");

const activeSessions = new Map();

class AutonomousEngine extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
    attachAutonomyEmitter(this);
  }

  #emit(sessionId, event, data = {}) {
    const payload = {
      event,
      sessionId,
      ts: new Date().toISOString(),
      ...data,
    };
    this.emit(sessionId, payload);
    this.emit("event", payload);
    const handle = activeSessions.get(sessionId);
    try {
      handle?.onEvent?.(payload);
    } catch {
      /* ignore */
    }
  }

  async createGoal(userId, data) {
    const goal = await createGoal(userId, data);
    this.#emit(null, STREAM_EVENTS.GOAL_CREATED, {
      goalId: goal.id,
      title: goal.title,
    });
    return goal;
  }

  async start(input) {
    const userId = input.userId;
    if (!userId) throw new Error("userId required");

    let goal = null;
    if (input.goalId) {
      goal = await getGoal(input.goalId, userId);
      if (!goal) throw Object.assign(new Error("Goal not found"), { code: "NOT_FOUND" });
    } else {
      goal = await createGoal(userId, {
        projectId: input.projectId,
        title: input.title || String(input.description || "").slice(0, 120),
        description: input.description || input.message || input.title,
        priority: input.priority,
        complexity: input.complexity,
        successCriteria: input.successCriteria,
      });
    }

    const session = await createSession(userId, {
      goalId: goal.id,
      projectId: input.projectId || goal.projectId,
      conversationId: input.conversationId,
      sharedMemory: createSharedMemory(),
    });

    const abortController = new AbortController();
    const handle = {
      sessionId: session.id,
      cancelRequested: false,
      abortController,
      onEvent: input.onEvent,
      timers: [],
    };
    activeSessions.set(session.id, handle);

    beginSessionTrace(
      {
        userId,
        projectId: session.projectId,
        conversationId: session.conversationId,
        goalId: goal.id,
        description: goal.description,
      },
      session.id,
    );

    this.#emit(session.id, STREAM_EVENTS.SESSION_STARTED, {
      goalId: goal.id,
      status: SESSION_STATUS.PENDING,
    });

    // Heartbeat + periodic checkpoints
    handle.timers.push(
      setInterval(() => {
        updateSession(session.id, {}).catch(() => {});
      }, HEARTBEAT_INTERVAL_MS),
    );

    // Fire-and-forget async execution (long-running)
    setImmediate(() => {
      this.#runSession(session, goal, input, handle).catch((err) => {
        this.#emit(session.id, STREAM_EVENTS.SESSION_FAILED, { error: err.message });
      });
    });

    return {
      sessionId: session.id,
      goalId: goal.id,
      status: SESSION_STATUS.PENDING,
    };
  }

  async #runSession(session, goal, input, handle) {
    const emit = (event, data) => this.#emit(session.id, event, data);
    const ctxBase = {
      userId: session.userId,
      sessionId: session.id,
      goalId: goal.id,
      projectId: session.projectId || input.projectId,
      conversationId: session.conversationId,
      goalDescription: goal.description,
      settings: input.settings || {},
      signal: handle.abortController.signal,
      cancelRequested: () => handle.cancelRequested,
      sharedMemory: createSharedMemory(session.sharedMemory || {}),
      artifacts: [],
      projectMeta: input.projectMeta || {},
      cwd: input.cwd || null,
      maxCycles: input.maxCycles,
      stopOnFailure: input.stopOnFailure === true,
      autoWaitApproval: input.autoWaitApproval === true,
      emit,
    };

    // Resolve project cwd if possible
    if (!ctxBase.cwd && ctxBase.projectId) {
      try {
        ctxBase.cwd = await resolveProjectRoot(ctxBase);
      } catch {
        ctxBase.cwd = null;
      }
    }

    try {
      await updateSession(session.id, {
        status: SESSION_STATUS.PLANNING,
        phase: "planning",
        startedAt: new Date(),
      });
      emit(STREAM_EVENTS.SESSION_PHASE, { phase: "planning" });

      // Optional feature branch
      if (ctxBase.cwd && input.createBranch !== false) {
        try {
          await createBranch(ctxBase, input.branchName || `autonomy/${goal.id.slice(0, 8)}`);
        } catch (err) {
          emit(STREAM_EVENTS.LOG, {
            level: "warn",
            message: `Branch creation skipped: ${err.message}`,
          });
        }
      }

      let plan = await createMasterPlan(ctxBase);
      let dbPlan = await persistPlan(goal.id, plan, { version: 1 });
      await updateSession(session.id, { planId: dbPlan.id });

      emit(STREAM_EVENTS.PLAN_CREATED, {
        planId: dbPlan.id,
        intent: plan.intent,
        tasks: plan.tasks,
        milestones: plan.milestones,
        executionGraph: plan.executionGraph,
      });

      await updateSession(session.id, {
        status: SESSION_STATUS.EXECUTING,
        phase: "execution",
      });
      emit(STREAM_EVENTS.SESSION_PHASE, { phase: "execution" });

      let execution = await executePlan(plan, dbPlan, ctxBase);

      // Re-plan once on failures
      if (execution.failures.length && input.allowReplan !== false) {
        emit(STREAM_EVENTS.LOG, {
          level: "warn",
          message: `Re-planning after ${execution.failures.length} failure(s)`,
        });
        plan = await replanAfterFailure(ctxBase, plan, {
          message: execution.failures.map((f) => f.error).join("; "),
          failedTaskIds: execution.failures.map((f) => f.taskId),
        });
        dbPlan = await persistPlan(goal.id, plan, {
          version: (dbPlan.version || 1) + 1,
          parentPlanId: dbPlan.id,
        });
        await updateSession(session.id, { planId: dbPlan.id });
        emit(STREAM_EVENTS.PLAN_REPLANNED, {
          planId: dbPlan.id,
          reason: plan.replanReason,
          tasks: plan.tasks,
        });
        execution = await executePlan(plan, dbPlan, {
          ...ctxBase,
          planId: dbPlan.id,
        });
      }

      await updateSession(session.id, {
        status: SESSION_STATUS.IMPROVING,
        phase: "improvement",
        sharedMemory: ctxBase.sharedMemory,
      });
      emit(STREAM_EVENTS.SESSION_PHASE, { phase: "improvement" });

      const improvement = await runImprovementLoop(
        { ...ctxBase, planId: dbPlan.id },
        { initialOutputs: execution.outputs },
      );

      if (improvement.stopped === "approval") {
        await updateSession(session.id, {
          status: SESSION_STATUS.WAITING_APPROVAL,
          phase: "approval",
          qualityGate: improvement.quality || {},
        });
        return {
          sessionId: session.id,
          status: SESSION_STATUS.WAITING_APPROVAL,
          approval: improvement.approval,
        };
      }

      // Git commit + PR plan when workspace available
      if (ctxBase.cwd && input.commit !== false) {
        try {
          const diff = await getDiff(ctxBase);
          if (diff.status?.trim()) {
            await commitChanges(
              ctxBase,
              input.commitMessage ||
                `autonomy: ${goal.title}\n\nSession ${session.id}`,
            );
          }
          await planPullRequest(ctxBase, {
            title: `Autonomy: ${goal.title}`,
          });
        } catch (err) {
          emit(STREAM_EVENTS.LOG, {
            level: "warn",
            message: `Git finalize warning: ${err.message}`,
          });
        }
      }

      const quality =
        improvement.quality ||
        evaluateSession({
          build: improvement.build,
          tests: improvement.tests,
          review: improvement.review,
          architectureViolations: improvement.architectureViolations,
        });

      const success = quality.ok || improvement.stopped === "quality_met";
      await updateSession(session.id, {
        status: success ? SESSION_STATUS.COMPLETED : SESSION_STATUS.FAILED,
        phase: "done",
        progress: 1,
        qualityGate: quality,
        finishedAt: new Date(),
        error: success ? null : quality.summary,
        sharedMemory: ctxBase.sharedMemory,
        metrics: {
          tasksCompleted: execution.outputs.length,
          tasksFailed: execution.failures.length,
          cycles: improvement.cycles?.length || 0,
          qualityScore: quality.score,
        },
      });

      await updateGoal(goal.id, session.userId, {
        status: success ? GOAL_STATUS.COMPLETED : GOAL_STATUS.FAILED,
        completedAt: success ? new Date() : null,
      });

      await saveCheckpoint(session.id, {
        final: true,
        quality,
        outputs: execution.outputs.map((o) => o.taskId),
      });

      if (success) {
        emit(STREAM_EVENTS.SESSION_COMPLETED, {
          status: SESSION_STATUS.COMPLETED,
          quality,
        });
      } else {
        emit(STREAM_EVENTS.SESSION_FAILED, {
          status: SESSION_STATUS.FAILED,
          error: quality.summary,
          quality,
        });
      }

      return {
        sessionId: session.id,
        status: success ? SESSION_STATUS.COMPLETED : SESSION_STATUS.FAILED,
        quality,
        execution,
        improvement,
      };
    } catch (error) {
      if (error.code === "CANCELLED" || handle.cancelRequested) {
        await updateSession(session.id, {
          status: SESSION_STATUS.CANCELLED,
          finishedAt: new Date(),
          error: "Cancelled",
        });
        emit(STREAM_EVENTS.SESSION_CANCELLED, { status: SESSION_STATUS.CANCELLED });
        return { sessionId: session.id, status: SESSION_STATUS.CANCELLED };
      }

      await updateSession(session.id, {
        status: SESSION_STATUS.FAILED,
        finishedAt: new Date(),
        error: error.message,
      });
      await updateGoal(goal.id, session.userId, { status: GOAL_STATUS.FAILED });
      emit(STREAM_EVENTS.SESSION_FAILED, {
        status: SESSION_STATUS.FAILED,
        error: error.message,
      });
      return {
        sessionId: session.id,
        status: SESSION_STATUS.FAILED,
        error: error.message,
      };
    } finally {
      for (const t of handle.timers) clearInterval(t);
      activeSessions.delete(session.id);
    }
  }

  async resume(sessionId, userId, input = {}) {
    const session = await getSession(sessionId, userId);
    if (!session) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });

    if (
      ![
        SESSION_STATUS.PAUSED,
        SESSION_STATUS.WAITING_APPROVAL,
        SESSION_STATUS.FAILED,
        SESSION_STATUS.PENDING,
      ].includes(session.status) &&
      !input.force
    ) {
      // Allow resume of interrupted executing sessions via checkpoint
      if (session.status !== SESSION_STATUS.EXECUTING && session.status !== SESSION_STATUS.IMPROVING) {
        return session;
      }
    }

    const goal = session.goal || (await getGoal(session.goalId, userId));
    return this.start({
      userId,
      goalId: goal.id,
      projectId: session.projectId,
      conversationId: session.conversationId,
      description: goal.description,
      cwd: input.cwd,
      settings: input.settings,
      createBranch: false,
      onEvent: input.onEvent,
      resumeFrom: session.checkpoint,
    });
  }

  async cancel(sessionId, userId) {
    const handle = activeSessions.get(sessionId);
    if (handle) {
      handle.cancelRequested = true;
      handle.abortController.abort();
    }
    const row = await requestCancel(sessionId, userId);
    if (row) {
      this.#emit(sessionId, STREAM_EVENTS.SESSION_CANCELLED, {
        status: SESSION_STATUS.CANCELLED,
      });
    }
    return row;
  }

  getActive(sessionId) {
    return activeSessions.get(sessionId) || null;
  }

  async getProgress(sessionId, userId) {
    const session = await getSession(sessionId, userId);
    if (!session) return null;
    return {
      sessionId: session.id,
      status: session.status,
      phase: session.phase,
      progress: session.progress,
      currentTaskId: session.currentTaskId,
      qualityGate: session.qualityGate,
      metrics: session.metrics,
      checkpoint: session.checkpoint,
      lastHeartbeatAt: session.lastHeartbeatAt,
      cycles: session.cycles,
      approvals: session.approvals?.filter((a) => a.status === "pending"),
    };
  }

  async getDashboard(userId, hours = 24) {
    const since = new Date(Date.now() - hours * 3600_000);
    const [goals, sessions, approvals, recentDecisions] = await Promise.all([
      listGoals(userId, { limit: 20 }),
      listSessions(userId, { limit: 20 }),
      listApprovals(userId, { status: "pending", limit: 20 }),
      listDecisions({ userId, limit: 30 }),
    ]);

    const recentSessions = sessions.filter((s) => new Date(s.createdAt) >= since);
    const active = sessions.filter((s) =>
      [
        SESSION_STATUS.PLANNING,
        SESSION_STATUS.EXECUTING,
        SESSION_STATUS.IMPROVING,
        SESSION_STATUS.WAITING_APPROVAL,
      ].includes(s.status),
    );

    return {
      hours,
      counts: {
        goals: goals.length,
        sessions: sessions.length,
        active: active.length,
        pendingApprovals: approvals.length,
        completed: sessions.filter((s) => s.status === SESSION_STATUS.COMPLETED).length,
        failed: sessions.filter((s) => s.status === SESSION_STATUS.FAILED).length,
      },
      goals,
      sessions: recentSessions,
      active,
      approvals,
      decisions: recentDecisions,
    };
  }
}

const engine = new AutonomousEngine();

module.exports = {
  AutonomousEngine,
  engine,
  activeSessions,
  createGoal,
  listGoals,
  getGoal,
  listSessions,
  getSession,
  listApprovals,
  resolveApproval,
  listDecisions,
  listArtifacts,
  getArtifact,
};
