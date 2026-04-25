import express from "express";
import { generateStoryboard } from "../skill/generateStoryboard.js";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Video Storyboard Skill is running");
});

app.post("/generate", (req, res) => {
  try {
    const { prompt } = req.body;

    const result = generateStoryboard(prompt);

    res.json({
      success: true,
      result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});