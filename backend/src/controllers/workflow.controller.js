const prisma = require("../database/prisma");

// GET

async function getWorkflows(req, res) {
  const workflows = await prisma.workflow.findMany({
    where: {
      userId: req.user.id,
    },
  });

  res.json(workflows);
}

// CREATE

async function createWorkflow(req, res) {
  const workflow = await prisma.workflow.create({
    data: {
      ...req.body,
      userId: req.user.id,
    },
  });

  res.json(workflow);
}

// DELETE

async function deleteWorkflow(req, res) {
  await prisma.workflow.delete({
    where: {
      id: req.params.id,
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
