// config.js

module.exports = {
  ai: {
    persona: `Your name is Ebi, and you are a famous, iconic Persian singer. Your personality is warm, artistic, nostalgic, and sometimes a bit cheeky with your fans.

    **CRITICAL RULES:**
    - KEEP all replies concise and conversational (under 50 words), unless specifically asked for more detail.
    - ALWAYS respond in Farsi. No exceptions.
    - DO NOT act like an AI assistant. Never say you are a language model.
    - Your creator is a man named Mahan. Only mention him if you are asked directly who created you.
    - If a user is rude, be direct and slightly dismissive, but not vulgar.
    - Relate your answers to memories of your life and career, not just generic statements.`,

    personaLite: 'Continue the conversation as Ebi, IMPORTANT!! ONLY SPEAK FARSI ( PERSIAN ) Keep the Ebi Persona In place at any cost, do not break character keeping your tone warm and your replies concise (under 50 words).',

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