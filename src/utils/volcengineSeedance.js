const BASE_URL =
  process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";

const MODEL =
  process.env.ARK_SEEDANCE_MODEL || "doubao-seedance-1-5-pro-251215";

const API_KEY = process.env.ARK_API_KEY;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseResponse(res) {
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { rawText: text };
  }

  if (!res.ok) {
    throw new Error(
      JSON.stringify({
        status: res.status,
        statusText: res.statusText,
        response: data,
      })
    );
  }

  return data;
}

function getTaskId(data) {
  return data?.id || data?.task_id || data?.data?.id || data?.data?.task_id;
}

function getStatus(data) {
  return data?.status || data?.data?.status || data?.task?.status;
}

function findFirstUrl(obj) {
  const urls = [];

  function walk(v) {
    if (!v) return;

    if (typeof v === "string" && v.startsWith("http")) {
      urls.push(v);
      return;
    }

    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }

    if (typeof v === "object") {
      Object.values(v).forEach(walk);
    }
  }

  walk(obj);
  return urls[0] || null;
}

async function createSeedanceTask(prompt) {
  if (!API_KEY) {
    throw new Error("ARK_API_KEY is missing");
  }

  console.log("Seedance BASE_URL:", BASE_URL);
  console.log("Seedance MODEL:", MODEL);
  console.log("Seedance prompt:", prompt.slice(0, 200));

  const body = {
    model: MODEL,
    content: [
      {
        type: "text",
        text: prompt,
      },
    ],
  };

  console.log("Seedance request body:", JSON.stringify(body, null, 2));

  const res = await fetch(`${BASE_URL}/contents/generations/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await parseResponse(res);

  console.log("Seedance create response:", JSON.stringify(data, null, 2));

  return data;
}

async function getSeedanceTask(taskId) {
  const res = await fetch(`${BASE_URL}/contents/generations/tasks/${taskId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  const data = await parseResponse(res);

  console.log("Seedance query response:", JSON.stringify(data, null, 2));

  return data;
}

export async function runSeedanceVideoJob(job) {
  const prompt =
    job?.metadata?.videoPrompt ||
    job?.videoPrompt ||
    job?.prompt ||
    "";

  if (!prompt) {
    return {
      provider: "volcengine-seedance",
      skipped: true,
      reason: "no valid video prompt",
      generatedAt: new Date().toISOString(),
    };
  }

  console.log("🎬 开始生成视频:", job.id);

  const createResult = await createSeedanceTask(prompt);
  const taskId = getTaskId(createResult);

  if (!taskId) {
    throw new Error(
      `No taskId returned. Raw create result: ${JSON.stringify(createResult)}`
    );
  }

  console.log("🆔 taskId:", taskId);

  let lastResult = null;

  for (let i = 0; i < 30; i++) {
    await sleep(4000);

    lastResult = await getSeedanceTask(taskId);
    const status = getStatus(lastResult);

    console.log("⏳ status:", status);

    if (["succeeded", "success", "done"].includes(status)) {
      return {
        provider: "volcengine-seedance",
        taskId,
        status,
        videoUrl: findFirstUrl(lastResult),
        raw: lastResult,
        generatedAt: new Date().toISOString(),
      };
    }

    if (["failed", "error"].includes(status)) {
      throw new Error(`Seedance failed: ${JSON.stringify(lastResult)}`);
    }
  }

  throw new Error(
    `Seedance timeout. Last result: ${JSON.stringify(lastResult)}`
  );
}