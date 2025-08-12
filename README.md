# 🤖 Ebi AI - Telegram Bot & Admin Dashboard

A sophisticated, hybrid Telegram bot that impersonates the iconic Persian singer, Ebi ("Mr. Voice"). It uses a multi-layered response system and is managed through a comprehensive, password-protected web dashboard for live monitoring, statistics, and an AI-assisted content creation workflow.

## ✨ Core Features

This project is more than just a chatbot; it's a complete management and content-creation platform designed for stability and ease of use.

### The Bot

* **🧠 Hybrid Response System:** For instant replies, the bot first checks a local SQLite database for pre-written `exact` and `smart` match responses. This ensures common phrases are answered instantly without API calls.

* **🤖 Conversational AI:** If no database match is found, the bot falls back to a powerful AI model (via OpenRouter) to hold natural, in-character conversations, complete with a persistent, database-backed short-term memory.

* **🌐 AI with Web Search:** The bot automatically detects questions that require current information (e.g., "who is," "what is," "latest news") and uses a web search API (Tavily) to provide the AI with factual context for its answers.

### The Web Dashboard

The bot is managed through a secure, password-protected web interface built with Node.js and Express.

| Dashboard Page     | Screenshot                                           | Description                                                                                                                                                                                          |
| ------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Live Feed** | <img src="https://i.imgur.com/8a3OQ8C.png" width="200"> | A real-time stream of all bot interactions using Server-Sent Events. Admins can send broadcast messages to groups or direct replies to specific users.                                               |
| **Statistics** | <img src="https://i.imgur.com/b2J9q3s.png" width="200"> | Visual charts and live stats for bot activity, messages processed, AI usage, API costs, and errors.                                                                                                    |
| **Response Manager** | <img src="https://i.imgur.com/k2j4l5f.png" width="200"> | A form to manually add new triggers and responses directly to the bot's database.                                                                                                                  |
| **AI Brainstormer** | <img src="https://i.imgur.com/Jg7fH2x.png" width="200"> | The workflow-automation hub. It displays unanswered user questions and uses a dedicated AI (Gemini 2.5 Flash) to generate new, in-character JSON responses that can be reviewed and added to the database with one click. |

## 🛠️ Tech Stack & Architecture

This project uses a modern Node.js stack designed for stability and scalability.

| Category       | Technology           | Purpose                                                                                            |
| -------------- | -------------------- | -------------------------------------------------------------------------------------------------- |
| **Backend** | Node.js, Express.js  | Core runtime and web server for the API and dashboard.                                             |
| **Bot Framework**| Telegraf.js          | The primary framework for interacting with the Telegram Bot API.                                   |
| **Database** | SQLite3              | A lightweight, file-based database for storing all bot responses and AI conversation history.      |
| **AI Services** | OpenRouter, AvalAI   | Provides access to various LLMs (e.g., DeepSeek, Gemini 2.5 Flash).                                |
| **Search Service**| Tavily AI            | Provides the real-time web search context for the AI.                                              |
| **Deployment** | PM2, Nginx           | Manages the Node.js process to keep it running 24/7 and acts as a secure reverse proxy for HTTPS.  |

### Message Handling Flow

When a user sends a message, it goes through the following logic pipeline to determine the best response:

```
User Message
     |
[Telegraf] -> [Anti-Spam Middleware]
     |
[Text Handler]
     |
     +--> 1. Is user in a conversation state? -> [Contextual DB Response]
     |
     +--> 2. Is there an EXACT match in the DB? -> [DB Response]
     |
     +--> 3. Is there a SMART match in the DB? -> [DB Response]
     |
     +--> 4. Does the message need facts? -> [Web Search] -> [AI Response]
     |
     +--> 5. None of the above? -> [Conversational AI Response]
```

## 📂 File Structure Overview

The project is organized into a modular structure for maintainability.

* **`server.js`**: The main entry point. Starts the Express server and launches the bot.
* **`bot.js`**: Initializes the Telegraf bot instance and its core middleware.
* **`config.js`**: Central configuration for AI personas, API keys (via `.env`), and other settings.
* **`src/`**: Contains all the core application logic.
    * **`handlers/`**: Manages incoming Telegram updates (`textHandler.js`, `commandHandler.js`).
    * **`services/`**: Handles connections to external APIs (`aiService.js`, `searchService.js`).
    * **`utils/`**: Helper modules for the database, logging, scheduling, etc.
    * **`routes/`**: Defines the API endpoints that power the web dashboard.
    * **`middleware/`**: Contains middleware for dashboard authentication and bot anti-spam.
* **`public/`**: Contains static frontend assets (`css/` and `js/`).
* **`*.html`**: The frontend pages for the dashboard (`index.html`, `manager.html`, `stats.html`, `brainstormer.html`).
* **`bot_database.db`**: The SQLite database file containing all pre-programmed responses and AI chat history.
* **`unanswered_questions_text.txt`**: A log of user messages that the bot could not answer from its database, used by the Brainstormer.
