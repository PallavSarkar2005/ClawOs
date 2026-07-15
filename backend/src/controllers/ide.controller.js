const prisma = require("../database/prisma");
const projectRepository = require("../repositories/project.repository");
const fsWorkspace = require("../services/fs-workspace.service");
const runService = require("../services/run.service");
const gitService = require("../services/git.service");
const terminalService = require("../services/terminal.service");

class IdeController {
  async syncWorkspace(req, res) {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.user.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const root = await fsWorkspace.syncProjectToDisk(req.user.id, project);
      res.json({ root, ok: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: error.message || "Sync failed" });
    }
  }

  async detectType(req, res) {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.user.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const root = await fsWorkspace.syncProjectToDisk(req.user.id, project);
      const detected = fsWorkspace.detectProjectType(project.files, root);
      res.json(detected);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Detect failed" });
    }
  }

  async startRun(req, res) {
    try {
      const run = await runService.start({
        userId: req.user.id,
        projectId: req.params.projectId,
        command: req.body.command,
      });
      res.status(201).json(run);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: error.message || "Run failed" });
    }
  }

  async stopRun(req, res) {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.user.id);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const { runId } = req.body;
      if (runId) {
        const existing = await prisma.codeRun.findFirst({
          where: { id: runId, projectId: project.id },
        });
        if (!existing) return res.status(404).json({ message: "Run not found" });
        const run = await runService.stop(runId);
        return res.json(run);
      }
      await runService.stopProject(req.params.projectId);
      res.json({ ok: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Stop failed" });
    }
  }

  async listRuns(req, res) {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.user.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const runs = await prisma.codeRun.findMany({
        where: { projectId: req.params.projectId },
        orderBy: { startedAt: "desc" },
        take: 20,
      });
      const activeId = runService.getActive(req.params.projectId);
      res.json({ runs, activeId });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to list runs" });
    }
  }

  async getRun(req, res) {
    try {
      const run = await prisma.codeRun.findUnique({ where: { id: req.params.runId } });
      if (!run) return res.status(404).json({ message: "Run not found" });
      const project = await projectRepository.findById(run.projectId, req.user.id);
      if (!project) return res.status(403).json({ message: "Forbidden" });
      res.json(run);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to get run" });
    }
  }

  async moveFile(req, res) {
    try {
      const { fileId } = req.params;
      const { parentId, newPath } = req.body;
      const existing = await projectRepository.findFileById(fileId);
      if (!existing) return res.status(404).json({ message: "File not found" });

      const project = await projectRepository.findById(existing.projectId, req.user.id);
      if (!project) return res.status(403).json({ message: "Forbidden" });

      let resolvedPath = newPath;
      let resolvedParent = parentId === undefined ? existing.parentId : parentId;

      if (!resolvedPath) {
        if (resolvedParent) {
          const parent = project.files.find((f) => f.id === resolvedParent);
          if (!parent || !parent.isFolder) {
            return res.status(400).json({ message: "Invalid parent folder" });
          }
          resolvedPath = `${parent.path.replace(/\/$/, "")}/${existing.name}`;
        } else {
          resolvedPath = `/${existing.name}`;
        }
      }

      await fsWorkspace.syncProjectToDisk(req.user.id, project);
      try {
        await fsWorkspace.moveOnDisk(
          req.user.id,
          project.id,
          existing.path,
          resolvedPath
        );
      } catch {
        /* disk move optional if not synced */
      }

      const file = await projectRepository.updateFile(fileId, {
        parentId: resolvedParent || null,
        path: resolvedPath,
      });

      // Update children paths if folder
      if (existing.isFolder) {
        const prefix = existing.path.replace(/\/$/, "");
        const newPrefix = resolvedPath.replace(/\/$/, "");
        for (const f of project.files) {
          if (f.id === existing.id) continue;
          if (f.path === prefix || f.path.startsWith(prefix + "/")) {
            const next = newPrefix + f.path.slice(prefix.length);
            await projectRepository.updateFile(f.id, { path: next });
          }
        }
      }

      await projectRepository.createLog(project.id, {
        level: "info",
        source: "system",
        message: `Moved ${existing.path} → ${resolvedPath}`,
      });

      res.json(file);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Move failed" });
    }
  }

  async saveLayout(req, res) {
    try {
      const { layout, tabs } = req.body;
      const project = await projectRepository.findById(req.params.projectId, req.user.id);
      if (!project) return res.status(404).json({ message: "Project not found" });

      if (layout !== undefined) {
        await projectRepository.update(req.params.projectId, req.user.id, { layout });
      }

      if (Array.isArray(tabs)) {
        await prisma.editorTab.deleteMany({ where: { projectId: req.params.projectId } });
        if (tabs.length) {
          await prisma.editorTab.createMany({
            data: tabs.map((t, i) => ({
              projectId: req.params.projectId,
              fileId: t.fileId || t.id,
              isActive: Boolean(t.isActive),
              viewGroup: t.viewGroup || "main",
              sortOrder: t.sortOrder ?? i,
            })),
          });
        }
      }

      const savedTabs = await prisma.editorTab.findMany({
        where: { projectId: req.params.projectId },
        orderBy: { sortOrder: "asc" },
      });
      const updated = await projectRepository.findById(req.params.projectId, req.user.id);
      res.json({ layout: updated.layout, tabs: savedTabs });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to save layout" });
    }
  }

  async getLayout(req, res) {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.user.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const tabs = await prisma.editorTab.findMany({
        where: { projectId: req.params.projectId },
        orderBy: { sortOrder: "asc" },
      });
      const terminals = await prisma.terminalSession.findMany({
        where: { projectId: req.params.projectId },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      res.json({ layout: project.layout, tabs, terminals });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to get layout" });
    }
  }

  async listTerminals(req, res) {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.user.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const live = terminalService.listByProject(req.params.projectId, req.user.id);
      const stored = await prisma.terminalSession.findMany({
        where: { projectId: req.params.projectId },
        orderBy: { updatedAt: "desc" },
        take: 20,
      });
      res.json({ live, stored });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to list terminals" });
    }
  }

  async createTerminal(req, res) {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.user.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      await fsWorkspace.syncProjectToDisk(req.user.id, project);
      const session = await prisma.terminalSession.create({
        data: {
          projectId: req.params.projectId,
          name: req.body.name || `Terminal`,
          cwd: fsWorkspace.projectDir(req.user.id, req.params.projectId),
          cols: req.body.cols || 80,
          rows: req.body.rows || 24,
          history: [],
          active: true,
        },
      });
      res.status(201).json(session);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to create terminal" });
    }
  }

  async deleteTerminal(req, res) {
    try {
      const session = await prisma.terminalSession.findUnique({
        where: { id: req.params.sessionId },
      });
      if (!session) return res.status(404).json({ message: "Not found" });
      const project = await projectRepository.findById(session.projectId, req.user.id);
      if (!project) return res.status(403).json({ message: "Forbidden" });
      terminalService.kill(session.id);
      await prisma.terminalSession.delete({ where: { id: session.id } });
      res.json({ ok: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to delete terminal" });
    }
  }

  async gitStatus(req, res) {
    try {
      const status = await gitService.getStatus(req.user.id, req.params.projectId);
      res.json(status);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: error.message || "Git status failed" });
    }
  }

  async gitDiff(req, res) {
    try {
      const diff = await gitService.getDiff(
        req.user.id,
        req.params.projectId,
        req.query.path
      );
      res.json(diff);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: error.message || "Git diff failed" });
    }
  }

  async gitStage(req, res) {
    try {
      const status = await gitService.stage(
        req.user.id,
        req.params.projectId,
        req.body.paths || []
      );
      res.json(status);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: error.message || "Stage failed" });
    }
  }

  async gitCommit(req, res) {
    try {
      const status = await gitService.commit(
        req.user.id,
        req.params.projectId,
        req.body.message
      );
      res.json(status);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: error.message || "Commit failed" });
    }
  }

  async gitCheckout(req, res) {
    try {
      const status = await gitService.checkout(
        req.user.id,
        req.params.projectId,
        req.body.branch,
        Boolean(req.body.create)
      );
      res.json(status);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: error.message || "Checkout failed" });
    }
  }

  async gitPush(req, res) {
    try {
      const result = await gitService.push(
        req.user.id,
        req.params.projectId,
        req.body.remote,
        req.body.branch
      );
      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: error.message || "Push failed" });
    }
  }

  async gitPull(req, res) {
    try {
      const result = await gitService.pull(
        req.user.id,
        req.params.projectId,
        req.body.remote,
        req.body.branch
      );
      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: error.message || "Pull failed" });
    }
  }

  async cancelExecution(req, res) {
    try {
      const exec = await prisma.aiExecution.findUnique({
        where: { id: req.params.executionId },
      });
      if (!exec) return res.status(404).json({ message: "Not found" });
      const project = await projectRepository.findById(exec.projectId, req.user.id);
      if (!project) return res.status(403).json({ message: "Forbidden" });
      const stages = (exec.stages || []).map((s) =>
        s.status === "running" ? { ...s, status: "cancelled", summary: "Cancelled by user" } : s
      );
      const updated = await prisma.aiExecution.update({
        where: { id: exec.id },
        data: {
          status: "cancelled",
          currentStage: "Cancelled",
          stages,
          summary: "Cancelled by user",
        },
      });
      await projectRepository.update(exec.projectId, req.user.id, { status: "idle" });
      res.json(updated);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Cancel failed" });
    }
  }
}

module.exports = new IdeController();
