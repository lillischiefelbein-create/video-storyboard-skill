export function generateStoryboard(prompt) {
    if (!prompt || typeof prompt !== "string") {
      throw new Error("prompt is required");
    }
  
    return {
      title: "AI Video Storyboard Skill",
      originalPrompt: prompt,
  
      structure: {
        idea: prompt,
        style: "cinematic / emotional / short video",
        duration: "30 seconds"
      },
  
      characters: [
        {
          name: "Main Character",
          description: "根据输入自动生成的角色，可以后续接AI扩展"
        }
      ],
  
      scenes: [
        {
          id: 1,
          title: "开场镜头",
          description: `${prompt}，画面缓慢展开，建立环境氛围`,
          camera: "slow push in",
          duration: "5s",
          keywords: ["opening", "atmosphere", "cinematic"]
        },
        {
          id: 2,
          title: "情绪推进",
          description: "角色进入或环境变化，情绪开始发展",
          camera: "medium shot",
          duration: "5s",
          keywords: ["emotion", "movement", "story"]
        },
        {
          id: 3,
          title: "高潮/转折",
          description: "出现关键视觉或情绪变化",
          camera: "close-up",
          duration: "5s",
          keywords: ["climax", "tension", "visual impact"]
        },
        {
          id: 4,
          title: "结尾镜头",
          description: "画面收束，留下余韵或记忆点",
          camera: "pull back",
          duration: "5s",
          keywords: ["ending", "memory", "final shot"]
        }
      ]
    };
  }