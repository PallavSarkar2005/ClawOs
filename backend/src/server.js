require("dotenv").config();

const app = require("./app");

const PORT = process.env.PORT || 5000;

const memoryRoutes = require("./routes/memory.routes");

const settingsRoutes = require("./routes/settings.routes");

app.use("/api/memory", memoryRoutes);
app.use("/api/settings", settingsRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
