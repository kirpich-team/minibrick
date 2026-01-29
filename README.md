# 🧱 MINIBRICK

**Intelligent Telegram Bot for Construction & Daily Activities**

A Level 2 AI-powered assistant built with Telegraf, Mistral AI, and Node.js. Combines expert construction knowledge with smart reminder system using natural Russian language processing.

## 🚀 Current Features (v0.1)

### Level 1: Construction Expert
- 📚 Expert knowledge in construction, flooring, concrete mixing
- 💬 Context-aware responses via Mistral AI API
- 👥 Group chat support with @minibrickbot mentions
- 💭 Reply message handling

### Level 2: Smart Reminder System
- ⏰ Natural Russian language time parsing
- 📝 AI-powered reminder creation from conversational requests
- 🔔 Scheduled notifications with persistent storage
- 📋 Reminder list management
- 🗑 Smart deletion by keyword
- 🌍 Moscow timezone support (Europe/Moscow)

## 🛠️ Tech Stack

- **Runtime:** Node.js
- **Bot Framework:** Telegraf (Telegram Bot API)
- **AI Engine:** Mistral AI (mistral-small-latest)
- **Scheduling:** node-schedule
- **Natural Language:** chrono-node (Russian date parsing)
- **Storage:** JSON file-based (reminders.json)

## 📦 Installation

git clone https://github.com/kirpich-team/minibrick.git
cd minibrick
npm install

## 🎮 Usage

User: "Как мешать бетон?"
Bot: Expert answer about concrete

User: "Напомни купить цемент через час"
Bot: Sets reminder for 1 hour

## 📁 Project Structure

minibrick/
├── index.js              # Main bot logic
├── reminders.json        # Persistent storage
├── package.json          # Dependencies
└── README.md             # Documentation

## 🔄 Bot Architecture

TELEGRAM API (Telegraf)
    ↓
MESSAGE HANDLER (bot.on('text'))
    ↓
AI PROCESSOR (Mistral API)
    ↓
SCHEDULER (node-schedule + chrono)
    ↓
STORAGE (reminders.json)

## 🎯 Roadmap

Level 3: Professional Cost Estimator
- File upload support (PDF, Word, Excel)
- Document parsing and analysis
- Cost calculation engine

## 📊 Version History

v0.1 (2026-01-29) - Initial release with Level 2 functionality

Status: Active Development | Level: 2/3 Complete
