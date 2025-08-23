# 🤖 Ebi AI - Telegram Bot & Admin Dashboard

A sophisticated, hybrid Telegram bot that impersonates the iconic Persian singer, Ebi ("Mr. Voice"). It uses a multi-layered response system and is managed through a comprehensive, password-protected web dashboard for live monitoring, statistics, and an AI-assisted content creation workflow.

## ✨ Core Features

This project is more than just a chatbot; it's a complete management and content-creation platform designed for stability, performance, and ease of use.

### The Bot

* **🧠 Hybrid Response System:** For instant replies, the bot first checks a local SQLite database for pre-written `exact` and `smart` match responses. This ensures common phrases are answered instantly without costly API calls, providing a snappy user experience.

* **🤖 Conversational AI with Memory:** If no database match is found, the bot falls back to a powerful AI model (via OpenRouter) to hold natural, in-character conversations. It features a persistent, database-backed short-term memory to recall recent parts of the conversation with a user.

* **🌐 AI with Web Search:** The bot automatically detects questions that require current information (e.g., "who is," "what is," "latest news") and uses a web search API (Tavily) to provide the AI with factual, up-to-date context for its answers.

### The Web Dashboard

The bot is managed through a secure, password-protected web interface built with Node.js and Express, providing a suite of powerful administrative tools.

| Dashboard Page | Screenshot | Description |
| :--- | :--- | :--- |
| **Live Feed** | <img src="https://i.imgur.com/8a3OQ8C.png" width="250"> | A real-time stream of all bot interactions using Server-Sent Events. Admins can send broadcast messages to all known groups or send direct replies to specific users right from the dashboard. |
| **Statistics** | <img src="https://i.imgur.com/b2J9q3s.png" width="250"> | Visual charts and live counters for bot activity, including total messages processed, AI usage, API costs, and logged errors, with daily stats saved automatically. |
| **Response Manager** | <img src="https://i.imgur.com/k2j4l5f.png" width="250"> | A powerful interface to directly manage the bot's knowledge base. You can add, edit, and delete `exact` and `smart` match responses in the SQLite database. |
| **AI Brainstormer** | <img src="https://i.imgur.com/Jg7fH2x.png" width="250"> | The workflow-automation hub. It displays a list of unanswered user questions and uses a dedicated AI (Gemini 2.5 Flash) to generate new, in-character JSON responses that can be reviewed and added to the database with a single click. |

---

## 🚀 Getting Started

Follow these instructions to get a local copy of the project up and running for development and testing.

### Prerequisites

* **Node.js**: Make sure you have Node.js (v18 or newer) installed. You can download it from the [official website](https://nodejs.org/).
* **API Keys**: This project requires API keys to function. You will need to obtain them from the following services:
    * A **Telegram Bot Token** from [@BotFather on Telegram](https://t.me/botfather).
    * An **OpenRouter API Key** for the primary conversational AI.
    * One or more **Tavily API Keys** for the web search functionality.

### Installation & Setup

1.  **Clone the Repository**
    Open your terminal, navigate to the directory where you want to store the project, and run the following command:
    ```sh
    git clone [https://github.com/NotEduCo342/EbiAI.git](https://github.com/NotEduCo342/EbiAI.git)
    cd EbiAI
    ```

2.  **Install Dependencies**
    Install all the required npm packages using:
    ```sh
    npm install
    ```

3.  **Configure Environment Variables**
    Create a new file named `.env` in the root of your project folder. This file will store your secret keys and passwords. Copy the contents of `.env.example` (if available) or use the template below, replacing the placeholder values with your actual credentials.

    ```env
    # Telegram Bot Token from BotFather
    BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN

    # A secure, unique password to access the web dashboard
    ADMIN_PASSWORD=YOUR_SECURE_ADMIN_PASSWORD

    # API Keys for AI and Search services
    OPENROUTER_API_KEY=YOUR_OPENROUTER_API_KEY
    AVALAI_API_KEY=YOUR_AVALAI_API_KEY_OPTIONAL
    TAVILY_API_KEYS=YOUR_TAVILY_API_KEY_1,YOUR_TAVILY_API_KEY_2
    ```

4.  **Run the Application**
    To start the bot and the web server, run the following command from the project root:
    ```sh
    npm start
    ```
    If the configuration is correct, you will see log messages in your terminal indicating that the "Telegraf bot launched" and the "Express server started."

5.  **Access the Dashboard**
    Open your favorite web browser and navigate to `http://localhost:3001`. You will be prompted for the admin password you defined in your `.env` file.

---

## 🛠️ Tech Stack & Architecture

This project uses a modern Node.js stack designed for stability, scalability, and ease of maintenance.

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Backend** | Node.js, Express.js | Core server runtime and web framework for the API and dashboard. |
| **Bot Framework**| Telegraf.js | The primary framework for robust interaction with the Telegram Bot API. |
| **Database** | SQLite3 | A lightweight, file-based SQL database for storing all bot responses, user data, and AI conversation history. |
| **AI Services** | OpenRouter, AvalAI | Acts as a gateway to various Large Language Models (e.g., DeepSeek, Gemini 2.5 Flash). |
| **Search Service**| Tavily AI | Provides the real-time, factual web search context for the AI. |
| **Deployment** | PM2, Nginx | PM2 is a process manager that keeps the Node.js app running 24/7. Nginx is used as a secure reverse proxy for handling HTTPS. |

### Message Handling Flow

When a user sends a message, it goes through the following logic pipeline to determine the most efficient and accurate response:

User Message|[Telegraf] -> [Anti-Spam Middleware]|[Text Handler]|+--> 1. Is user in a conversation state? -> [Contextual DB Response]|+--> 2. Is there an EXACT match in the DB? -> [DB Response]|+--> 3. Is there a SMART match in the DB? -> [DB Response]|+--> 4. Does the message need facts? -> [Web Search] -> [AI Response]|+--> 5. None of the above? -> [Conversational AI Response]
---

## 📂 File Structure Overview

The project is organized into a modular structure to keep the codebase clean and maintainable.

* **`server.js`**: The main entry point. It initializes and starts the Express server and launches the Telegraf bot.
* **`bot.js`**: Initializes the Telegraf bot instance, registers core middleware like anti-spam, and loads all event handlers.
* **`config.js`**: Central configuration file for AI personas, API endpoints, cooldowns, and other settings (loads secrets from `.env`).
* **`src/`**: Contains all the core application logic.
    * **`handlers/`**: Modules responsible for handling incoming Telegram updates (`textHandler.js`, `commandHandler.js`).
    * **`services/`**: Modules that handle connections to external APIs (`aiService.js`, `searchService.js`).
    * **`utils/`**: Helper modules and utilities for database interaction, logging, scheduling, etc.
    * **`routes/`**: Defines the API endpoints (`/api/...`) that power the interactive web dashboard.
    * **`middleware/`**: Contains custom middleware functions for dashboard authentication (`auth.js`) and bot anti-spam logic (`antiSpam.js`).
* **`public/`**: Contains all static frontend assets that are served to the client, including CSS stylesheets and JavaScript files.
* **`*.html`**: The HTML files for the various dashboard pages (`index.html`, `manager.html`, `stats.html`, `brainstormer.html`).
* **`.gitignore`**: **Crucially**, this file is configured to prevent sensitive files like `bot_database.db`, `.env`, and log files from ever being committed to the repository.

---

## 🔐 Security & Privacy

User privacy and data security are taken seriously.

* **Credentials**: All API keys, bot tokens, and passwords are managed through a `.env` file, which is explicitly excluded from version control by the `.gitignore` file.
* **User Data**: The `bot_database.db` file and all log files (`*.txt`, `*.jsonl`) are also listed in `.gitignore` to ensure no private user data is ever pushed to the public repository.
* **Dashboard Access**: The web dashboard is protected by a password authentication middleware to prevent unauthorized access.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/NotEduCo342/EbiAI/issues).

## 📜 License

This project is licensed under the MIT License. See the `LICENSE` file for details.
