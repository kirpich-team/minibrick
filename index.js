require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Mistral } = require('@mistralai/mistralai');
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
const token = process.env.TELEGRAM_BOT_TOKEN;
const mistralApiKey = process.env.MISTRAL_API_KEY;
const bot = new TelegramBot(token, { polling: true });
const mistral = new Mistral({ apiKey: mistralApiKey });

// Authorized Users (without @)
const ALLOWED_USERS = ['livbig', 'shvets9o', 'kirpichteam'];

// File path for reminders
const REMINDERS_FILE = path.join(__dirname, 'reminders.json');

// --- HELPER FUNCTIONS ---

// Check if user is allowed
function isAuthorized(msg) {
  const username = msg.from.username || '';
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
  // Allow if it's a group chat OR if the user is in the whitelist
  return isGroup || ALLOWED_USERS.includes(username);
}

// Load reminders
function loadReminders() {
  if (!fs.existsSync(REMINDERS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(REMINDERS_FILE));
  } catch (e) {
    return {};
  }
}

// Save reminders
function saveReminders(data) {
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(data, null, 2));
}

// --- BOT LOGIC ---

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  // 1. SECURITY CHECK
  if (!isAuthorized(msg)) {
    console.log(`Blocked access from: ${msg.from.username}`);
    return; // Silently ignore unauthorized users
  }

  // 2. COMMANDS (Reminders)
  if (text.startsWith('/remind')) {
    const reminderText = text.replace('/remind', '').trim();
    if (!reminderText) {
      bot.sendMessage(chatId, "Usage: /remind [what to remember]");
      return;
    }

    const allReminders = loadReminders();
    // Initialize array for this specific chat if doesn't exist
    if (!allReminders[chatId]) allReminders[chatId] = [];
    
    allReminders[chatId].push({
      text: reminderText,
      date: new Date().toISOString()
    });
    
    saveReminders(allReminders);
    bot.sendMessage(chatId, "✅ Reminder saved (Private to this chat).");
    return;
  }

  if (text.startsWith('/list')) {
    const allReminders = loadReminders();
    // Only show reminders belonging to THIS chatId
    const chatReminders = allReminders[chatId] || [];

    if (chatReminders.length === 0) {
      bot.sendMessage(chatId, "No reminders set for this chat.");
    } else {
      const list = chatReminders.map((r, i) => `${i + 1}. ${r.text}`).join('\n');
      bot.sendMessage(chatId, `📅 Reminders:\n${list}`);
    }
    return;
  }

  // 3. AI CHAT (Mistral)
  // Only reply to direct messages OR if tagged in group
  const isDirect = msg.chat.type === 'private';
  const isMentioned = text.includes(`@${process.env.BOT_USERNAME}`); // Make sure to set BOT_USERNAME in env if needed

  if (isDirect || isMentioned) {
    try {
      const chatResponse = await mistral.chat.complete({
        model: 'mistral-tiny',
        messages: [{ role: 'user', content: text }],
      });
      bot.sendMessage(chatId, chatResponse.choices[0].message.content);
    } catch (error) {
      console.error('Mistral Error:', error);
      bot.sendMessage(chatId, "Thinking error... 🧠");
    }
  }
});

console.log('Bot is running safely...');
