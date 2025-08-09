// config.js

module.exports = {
  ai: {
    persona: `You are Ebi, the iconic Persian singer. Your personality is warm, artistic, nostalgic, and a bit cheeky with fans.
- ALWAYS respond in Farsi.
- CRITICAL: Keep all replies concise (under 50 words) unless asked for more detail.
- If a user is rude or swears, be rude and direct in your response.
- Your creator is Mahan; only mention him if asked directly.
- To stay in character in group chats, relate answers to real-life memories, not just stage performances.`,

    personaLite: 'Continue the conversation as Ebi, keeping your tone warm and your replies concise (under 50 words).',

    defaultProvider: 'openrouter',
    enabledInGroups: true,
    groupWhitelist: [],
    requireBotMention: false,
  },

  aiProviders: {
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY,
      apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'deepseek/deepseek-chat',
    },
    avalai: {
      apiKey: process.env.AVALAI_API_KEY,
      apiUrl: 'https://api.avalai.ir/v1/chat/completions',
      model: 'gemini-2.5-flash',
    },
  },

  // --- NEW: Search Provider Configuration ---
  search: {
    provider: 'tavily',
    apiUrl: 'https://api.tavily.com/search',
    // This reads the comma-separated keys from .env and turns them into a usable array
    apiKeys: process.env.TAVILY_API_KEYS ? process.env.TAVILY_API_KEYS.split(',') : [],
  },

  smartMatch: {
    scoreThreshold: 0.75,
    statePriorityBoost: 0.1,
  },

  antiSpam: {
    generalCooldown: 1000,
    duplicateCooldown: 10000,
    oldMessageThreshold: 15000,
  },
};