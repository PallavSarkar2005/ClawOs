const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth.middleware");
const dashboardController = require("../controllers/dashboard.controller");

router.get("/stats", protect, (req, res) => dashboardController.getStats(req, res));
router.get("/activity", protect, (req, res) => dashboardController.getActivity(req, res));

module.exports = router;
