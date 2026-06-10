const express = require("express");

const coordinatorAgent = require("../agents/coordinator.agent");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { message } = req.body;

    const reply = await coordinatorAgent(message);

    res.json({
      success: true,
      reply,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: "Something went wrong",
    });
  }
});

module.exports = router;
