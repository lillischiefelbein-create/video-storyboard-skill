import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { generateStoryboard } from "../skill/generateStoryboard.js";
import { runSeedanceVideoJob } from "../utils/volcengineSeedance.js";

dotenv.config();

const app = express();
app.use(express.json({ limit: "10mb" }));

function ensureOutputDir() {
  const outputDir = path.resolve("outputs");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  return outputDir;
}

function saveJson(prefix, data) {
  const outputDir = ensureOutputDir();
  const fileName = `${prefix}-${Date.now()}.json`;
  const filePath = path.join(outputDir, fileName);

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");

  return filePath;
}

function readJson(filePath) {
  if (!filePath) {
    throw new Error("filePath is required");
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`file not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

async function runMockImageJob(job) {
  const safeName = job.id.replace(/[^a-zA-Z0-9-_]/g, "_");

  return {
    provider: "mock",
    url: `mock://generated/${safeName}.png`,
    localPath: `outputs/mock-images/${safeName}.png`,
    promptUsed: job.prompt,
    negativePromptUsed: job.negativePrompt || "",
    generatedAt: new Date().toISOString(),
  };
}

app.get("/", (req, res) => {
  res.send("Video Storyboard Skill is running");
});

app.post("/generate", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.json({
        success: false,
        error: "prompt is required",
      });
    }

    const result = await generateStoryboard(prompt);

    res.json({
      success: true,
      result,
    });
  } catch (err) {
    res.json({
      success: false,
      error: err.message,
    });
  }
});

app.post("/generate-and-save", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.json({
        success: false,
        error: "prompt is required",
      });
    }

    const result = await generateStoryboard(prompt);
    const filePath = saveJson("storyboard", result);

    res.json({
      success: true,
      file: filePath,
      result,
    });
  } catch (err) {
    res.json({
      success: false,
      error: err.message,
    });
  }
});

app.post("/extract-assets", async (req, res) => {
  try {
    const { filePath } = req.body;
    const data = readJson(filePath);

    const assets = {
      projectName: data.projectName || "untitled-project",

      characters: (data.characterDesign || []).map((character, index) => ({
        id: `character-${index + 1}`,
        name: character.name || `Character ${index + 1}`,
        type: "character_three_view",
        prompt: character.threeViewPrompt || "",
        frontViewPrompt: character.frontViewPrompt || "",
        sideViewPrompt: character.sideViewPrompt || "",
        backViewPrompt: character.backViewPrompt || "",
        consistencyLock: character.consistencyLock || {},
      })),

      scenes: (data.sceneConceptDesign || []).map((scene, index) => ({
        id: `scene-${index + 1}`,
        name: scene.sceneName || `Scene ${index + 1}`,
        type: "scene_concept_art",
        prompt: scene.conceptArtPrompt || "",
        continuityLock: scene.continuityLock || {},
      })),

      keyframes: (data.storyboard || []).map((shot, index) => ({
        id: `keyframe-${index + 1}`,
        shotId: shot.id || index + 1,
        type: "storyboard_keyframe",
        duration: shot.duration || "5s",
        prompt: shot.keyframePrompt || "",
        videoPrompt: shot.videoPrompt || "",
        negativePrompt: shot.negativePrompt || "",
        cameraExecution: shot.cameraExecution || {},
        continuityNote: shot.continuityNote || "",
      })),
    };

    const assetsFilePath = saveJson("assets-plan", assets);

    res.json({
      success: true,
      file: assetsFilePath,
      assets,
    });
  } catch (err) {
    res.json({
      success: false,
      error: err.message,
    });
  }
});

app.post("/create-generation-jobs", async (req, res) => {
  try {
    const { filePath, provider = "mock" } = req.body;
    const assets = readJson(filePath);

    const jobs = [];

    for (const character of assets.characters || []) {
      jobs.push({
        id: `job-character-${jobs.length + 1}`,
        assetId: character.id,
        type: "character_three_view",
        provider,
        status: "pending",
        prompt: character.prompt,
        negativePrompt:
          "low quality, blurry, deformed face, bad hands, extra fingers, text, watermark, inconsistent character",
        output: null,
        metadata: {
          name: character.name,
          consistencyLock: character.consistencyLock,
          frontViewPrompt: character.frontViewPrompt,
          sideViewPrompt: character.sideViewPrompt,
          backViewPrompt: character.backViewPrompt,
        },
      });
    }

    for (const scene of assets.scenes || []) {
      jobs.push({
        id: `job-scene-${jobs.length + 1}`,
        assetId: scene.id,
        type: "scene_concept_art",
        provider,
        status: "pending",
        prompt: scene.prompt,
        negativePrompt:
          "low quality, blurry, broken perspective, messy layout, text, watermark, overexposed, inconsistent lighting",
        output: null,
        metadata: {
          name: scene.name,
          continuityLock: scene.continuityLock,
        },
      });
    }

    for (const keyframe of assets.keyframes || []) {
      jobs.push({
        id: `job-keyframe-${jobs.length + 1}`,
        assetId: keyframe.id,
        shotId: keyframe.shotId,
        type: "storyboard_keyframe",
        provider,
        status: "pending",
        prompt: keyframe.prompt,
        negativePrompt:
          keyframe.negativePrompt ||
          "low quality, blurry, deformed face, bad hands, extra fingers, text, watermark, inconsistent character, inconsistent costume, broken physics",
        output: null,
        metadata: {
          duration: keyframe.duration,
          videoPrompt: keyframe.videoPrompt,
          cameraExecution: keyframe.cameraExecution,
          continuityNote: keyframe.continuityNote,
        },
      });
    }

    const generationPlan = {
      projectName: assets.projectName || "untitled-project",
      provider,
      createdAt: new Date().toISOString(),
      summary: {
        totalJobs: jobs.length,
        characterJobs: jobs.filter(
          (job) => job.type === "character_three_view"
        ).length,
        sceneJobs: jobs.filter((job) => job.type === "scene_concept_art")
          .length,
        keyframeJobs: jobs.filter((job) => job.type === "storyboard_keyframe")
          .length,
      },
      jobs,
    };

    const jobsFilePath = saveJson("generation-jobs", generationPlan);

    res.json({
      success: true,
      file: jobsFilePath,
      generationPlan,
    });
  } catch (err) {
    res.json({
      success: false,
      error: err.message,
    });
  }
});

app.post("/run-jobs", async (req, res) => {
  try {
    const { filePath, provider = "mock" } = req.body;
    const generationPlan = readJson(filePath);

    const executedJobs = [];

    console.log("========== RUN JOBS START ==========");
    console.log("provider:", provider);
    console.log("filePath:", filePath);
    console.log("total jobs:", generationPlan.jobs?.length || 0);

    for (const job of generationPlan.jobs || []) {
      const startedAt = new Date().toISOString();

      console.log("----------------------------------");
      console.log("current job:", job.id);
      console.log("job type:", job.type);

      try {
        let output;

        if (provider === "mock") {
          console.log("running mock job:", job.id);
          output = await runMockImageJob(job);
        } else if (provider === "volcengine") {
          if (job.type === "storyboard_keyframe") {
            console.log("running Seedance video job:", job.id);
            output = await runSeedanceVideoJob(job);
          } else {
            console.log("skip non-video job:", job.id);

            output = {
              provider: "volcengine",
              skipped: true,
              reason: "Only storyboard_keyframe jobs are sent to Seedance video generation.",
              originalType: job.type,
              generatedAt: new Date().toISOString(),
            };
          }
        } else {
          throw new Error(`provider ${provider} is not implemented yet`);
        }

        executedJobs.push({
          ...job,
          provider,
          status: "done",
          startedAt,
          finishedAt: new Date().toISOString(),
          output,
          error: null,
          rawError: null,
        });
      } catch (jobErr) {
        console.error("Job failed:", job.id);
        console.error(jobErr);

        executedJobs.push({
          ...job,
          provider,
          status: "failed",
          startedAt,
          finishedAt: new Date().toISOString(),
          output: null,
          error: jobErr?.message || JSON.stringify(jobErr),
          rawError: {
            name: jobErr?.name || null,
            message: jobErr?.message || null,
            stack: jobErr?.stack || null,
            raw: JSON.stringify(jobErr),
          },
        });
      }
    }

    const executedPlan = {
      ...generationPlan,
      provider,
      executedAt: new Date().toISOString(),
      summary: {
        totalJobs: executedJobs.length,
        doneJobs: executedJobs.filter((job) => job.status === "done").length,
        failedJobs: executedJobs.filter((job) => job.status === "failed")
          .length,
        skippedJobs: executedJobs.filter((job) => job.output?.skipped).length,
        videoJobs: executedJobs.filter(
          (job) => job.type === "storyboard_keyframe"
        ).length,
      },
      jobs: executedJobs,
    };

    const executedFilePath = saveJson("executed-jobs", executedPlan);

    console.log("========== RUN JOBS END ==========");
    console.log("saved file:", executedFilePath);

    res.json({
      success: true,
      file: executedFilePath,
      executedPlan,
    });
  } catch (err) {
    console.error("run-jobs fatal error:", err);

    res.json({
      success: false,
      error: err.message,
    });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});