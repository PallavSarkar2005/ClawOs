const prisma = require("../database/prisma");

async function getWorkflows(req, res) {
  const workflows = await prisma.workflow.findMany({
    where: {
      userId: req.user.id,
    },
  });

  res.json(workflows);
}

async function createWorkflow(req, res) {
  const { name, description, prompt, enabled } = req.body;
  const workflow = await prisma.workflow.create({
    data: {
      name,
      description: description || "",
      prompt: prompt || "",
      enabled,
      userId: req.user.id,
    },
  });

  res.json(workflow);
}

async function deleteWorkflow(req, res) {
  const existing = await prisma.workflow.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id,
    },
  });

  if (!existing) {
    return res.status(404).json({ message: "Workflow not found" });
  }

  await prisma.workflow.delete({
    where: {
      id: existing.id,
    },
  });

  res.json({
    success: true,
  });
}

module.exports = {
  getWorkflows,
  createWorkflow,
  deleteWorkflow,
};
