const projectRepository = require("../repositories/project.repository");
const workspaceService = require("../services/workspace.service");
const fsWorkspace = require("../services/fs-workspace.service");

class ProjectController {
  async getProjects(req, res) {
    try {
      const projects = await projectRepository.findAllByUserId(req.user.id);
      res.json(projects);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  }

  async createProject(req, res) {
    try {
      const { name, description, framework = "react", generate = true } = req.body;
      if (!name?.trim()) {
        return res.status(400).json({ message: "Project name is required" });
      }

      const project = await projectRepository.create(req.user.id, {
        name: name.trim(),
        description: description || "",
        framework,
        status: generate ? "building" : "idle",
      });

      await projectRepository.createLog(project.id, {
        level: "info",
        source: "system",
        message: `Project "${project.name}" created`,
      });

      if (generate) {
        // Run pipeline async-ish but await so client gets populated project
        const populated = await workspaceService.runGenerationPipeline(
          project,
          req.user.id
        );
        return res.status(201).json(populated);
      }

      const updated = await projectRepository.findById(project.id, req.user.id);
      res.status(201).json(updated);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to create project" });
    }
  }

  async getProjectDetails(req, res) {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.user.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      await projectRepository.update(project.id, req.user.id, {
        lastOpenedAt: new Date(),
      });
      const refreshed = await projectRepository.findById(req.params.projectId, req.user.id);
      res.json(refreshed);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to fetch project details" });
    }
  }

  async updateProject(req, res) {
    try {
      const { name, description, framework, status, isFavorite } = req.body;
      const data = {};
      if (name !== undefined) data.name = name;
      if (description !== undefined) data.description = description;
      if (framework !== undefined) data.framework = framework;
      if (status !== undefined) data.status = status;
      if (isFavorite !== undefined) data.isFavorite = Boolean(isFavorite);

      const project = await projectRepository.update(
        req.params.projectId,
        req.user.id,
        data
      );
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to update project" });
    }
  }

  async reorderProjects(req, res) {
    try {
      const { orderedIds } = req.body;
      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ message: "orderedIds array required" });
      }
      const projects = await projectRepository.reorder(req.user.id, orderedIds);
      res.json(projects);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to reorder projects" });
    }
  }

  async deleteProject(req, res) {
    try {
      await projectRepository.delete(req.params.projectId, req.user.id);
      res.json({ success: true, message: "Project deleted successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to delete project" });
    }
  }

  async createFile(req, res) {
    try {
      const { projectId } = req.params;
      const { name, path: filePath, content, isFolder, parentId } = req.body;
      if (!name?.trim()) {
        return res.status(400).json({ message: "File name is required" });
      }

      const project = await projectRepository.findById(projectId, req.user.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      let resolvedPath = filePath;
      if (!resolvedPath) {
        if (parentId) {
          const parent = project.files.find((f) => f.id === parentId);
          resolvedPath = parent ? `${parent.path.replace(/\/$/, "")}/${name}` : `/${name}`;
        } else {
          resolvedPath = `/${name}`;
        }
      }

      const file = await projectRepository.createFile(projectId, {
        name: name.trim(),
        path: resolvedPath,
        content: isFolder ? "" : content ?? "",
        isFolder: Boolean(isFolder),
        parentId: parentId || null,
      });

      try {
        if (isFolder) {
          await fsWorkspace.ensureDir(
            fsWorkspace.safeJoin(fsWorkspace.projectDir(req.user.id, projectId), resolvedPath)
          );
        } else {
          await fsWorkspace.writeFileToDisk(req.user.id, projectId, resolvedPath, content ?? "");
        }
      } catch (e) {
        console.warn("disk sync:", e.message);
      }

      await projectRepository.createLog(projectId, {
        level: "info",
        source: "system",
        message: `${isFolder ? "Folder" : "File"} created: ${resolvedPath}`,
      });

      res.status(201).json(file);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to create file" });
    }
  }

  async updateFile(req, res) {
    try {
      const { fileId } = req.params;
      const { content, name, path: filePath } = req.body;
      const existing = await projectRepository.findFileById(fileId);
      if (!existing) {
        return res.status(404).json({ message: "File not found" });
      }

      const project = await projectRepository.findById(existing.projectId, req.user.id);
      if (!project) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const data = {};
      if (content !== undefined) data.content = content;
      if (name !== undefined) data.name = name;
      if (filePath !== undefined) data.path = filePath;

      const file = await projectRepository.updateFile(fileId, data);

      if (content !== undefined) {
        try {
          await fsWorkspace.writeFileToDisk(
            req.user.id,
            existing.projectId,
            file.path,
            content
          );
        } catch (e) {
          console.warn("disk sync:", e.message);
        }
        await projectRepository.createLog(existing.projectId, {
          level: "info",
          source: "system",
          message: `Saved ${file.path}`,
        });
      }

      res.json(file);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to update file" });
    }
  }

  async renameFile(req, res) {
    try {
      const { fileId } = req.params;
      const { name } = req.body;
      if (!name?.trim()) {
        return res.status(400).json({ message: "Name required" });
      }

      const existing = await projectRepository.findFileById(fileId);
      if (!existing) {
        return res.status(404).json({ message: "File not found" });
      }

      const project = await projectRepository.findById(existing.projectId, req.user.id);
      if (!project) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const parts = existing.path.split("/");
      parts[parts.length - 1] = name.trim();
      const newPath = parts.join("/") || `/${name.trim()}`;

      const file = await projectRepository.updateFile(fileId, {
        name: name.trim(),
        path: newPath,
      });

      await projectRepository.createLog(existing.projectId, {
        level: "info",
        source: "system",
        message: `Renamed ${existing.path} → ${newPath}`,
      });

      res.json(file);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to rename file" });
    }
  }

  async deleteFile(req, res) {
    try {
      const { fileId } = req.params;
      const existing = await projectRepository.findFileById(fileId);
      if (!existing) {
        return res.status(404).json({ message: "File not found" });
      }

      const project = await projectRepository.findById(existing.projectId, req.user.id);
      if (!project) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await projectRepository.deleteFile(fileId);
      try {
        await fsWorkspace.deleteFromDisk(
          req.user.id,
          existing.projectId,
          existing.path,
          existing.isFolder
        );
      } catch (e) {
        console.warn("disk sync:", e.message);
      }
      await projectRepository.createLog(existing.projectId, {
        level: "warning",
        source: "system",
        message: `Deleted ${existing.path}`,
      });

      res.json({ success: true, message: "File deleted successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to delete file" });
    }
  }

  async uploadFiles(req, res) {
    try {
      const { projectId } = req.params;
      const project = await projectRepository.findById(projectId, req.user.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const files = req.body.files;
      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ message: "files array required" });
      }

      const created = [];
      for (const f of files) {
        if (!f.name) continue;
        const file = await projectRepository.createFile(projectId, {
          name: f.name,
          path: f.path || `/${f.name}`,
          content: f.content || "",
          isFolder: false,
          parentId: f.parentId || null,
        });
        created.push(file);
      }

      await projectRepository.createLog(projectId, {
        level: "info",
        source: "system",
        message: `Uploaded ${created.length} file(s)`,
      });

      res.status(201).json(created);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to upload files" });
    }
  }

  async getLogs(req, res) {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.user.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const logs = await projectRepository.getLogs(req.params.projectId);
      res.json(logs);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to fetch logs" });
    }
  }

  async addLog(req, res) {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.user.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const log = await projectRepository.createLog(req.params.projectId, {
        level: req.body.level || "info",
        source: req.body.source || "runtime",
        message: req.body.message || "",
      });
      res.status(201).json(log);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to add log" });
    }
  }

  async getExecutions(req, res) {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.user.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const executions = await projectRepository.getExecutions(req.params.projectId);
      res.json(executions);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to fetch executions" });
    }
  }

  async getDiffs(req, res) {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.user.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const diffs = await projectRepository.getDiffs(
        req.params.projectId,
        req.query.status
      );
      res.json(diffs);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to fetch diffs" });
    }
  }

  async acceptDiff(req, res) {
    try {
      const diff = await projectRepository.findDiffById(req.params.diffId);
      if (!diff) {
        return res.status(404).json({ message: "Diff not found" });
      }

      const project = await projectRepository.findById(diff.projectId, req.user.id);
      if (!project) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (diff.fileId) {
        await projectRepository.updateFile(diff.fileId, { content: diff.after });
      }

      const updated = await projectRepository.updateDiff(diff.id, {
        status: "accepted",
      });

      await projectRepository.createLog(diff.projectId, {
        level: "info",
        source: "ai",
        message: `Accepted AI changes for ${diff.filePath}`,
      });

      res.json(updated);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to accept diff" });
    }
  }

  async rejectDiff(req, res) {
    try {
      const diff = await projectRepository.findDiffById(req.params.diffId);
      if (!diff) {
        return res.status(404).json({ message: "Diff not found" });
      }

      const project = await projectRepository.findById(diff.projectId, req.user.id);
      if (!project) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const updated = await projectRepository.updateDiff(diff.id, {
        status: "rejected",
      });

      await projectRepository.createLog(diff.projectId, {
        level: "warning",
        source: "ai",
        message: `Rejected AI changes for ${diff.filePath}`,
      });

      res.json(updated);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to reject diff" });
    }
  }

  async aiEdit(req, res) {
    try {
      const { projectId } = req.params;
      const { fileId, selection, action, instruction } = req.body;
      if (!fileId || !action) {
        return res.status(400).json({ message: "fileId and action required" });
      }

      const project = await workspaceService.runAiEdit({
        projectId,
        userId: req.user.id,
        fileId,
        selection,
        action,
        instruction,
      });

      res.json(project);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: error.message || "AI edit failed" });
    }
  }

  async analyzeProblems(req, res) {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.user.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const problems = [];
      for (const file of project.files.filter((f) => !f.isFolder)) {
        const lines = (file.content || "").split("\n");
        lines.forEach((line, idx) => {
          if (/TODO|FIXME/.test(line)) {
            problems.push({
              fileId: file.id,
              filePath: file.path,
              line: idx + 1,
              severity: "warning",
              message: line.trim().slice(0, 120),
              source: "syntax",
            });
          }
          if (/syntax error|undefined is not|cannot find/i.test(line)) {
            problems.push({
              fileId: file.id,
              filePath: file.path,
              line: idx + 1,
              severity: "error",
              message: line.trim().slice(0, 120),
              source: "build",
            });
          }
          // Unbalanced braces heuristic
          const opens = (line.match(/{/g) || []).length;
          const closes = (line.match(/}/g) || []).length;
          if (Math.abs(opens - closes) > 2 && line.length < 80) {
            // skip noisy lines
          }
        });

        const openBraces = (file.content.match(/{/g) || []).length;
        const closeBraces = (file.content.match(/}/g) || []).length;
        if (openBraces !== closeBraces && /\.(jsx?|tsx?|css)$/.test(file.name)) {
          problems.push({
            fileId: file.id,
            filePath: file.path,
            line: 1,
            severity: "error",
            message: `Unbalanced braces ({ ${openBraces} vs } ${closeBraces})`,
            source: "syntax",
          });
        }
      }

      res.json(problems);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to analyze problems" });
    }
  }
}

module.exports = new ProjectController();
