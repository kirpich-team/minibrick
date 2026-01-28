process.env.TZ = 'Europe/Moscow';

require('dotenv').config();
const { Telegraf } = require('telegraf');
const schedule = require('node-schedule');
const chrono = require('chrono-node');
const fs = require('fs');
const path = require('path');

// --- КОНФИГУРАЦИЯ ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MISTRAL_KEY = process.env.MISTRAL_API_KEY;
const BOT_TAG = '@minibrickbot'; 
const API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MODEL = 'mistral-small-latest';
const REMINDERS_FILE = path.join(__dirname, 'reminders.json');

const bot = new Telegraf(TELEGRAM_TOKEN);

// --- ХРАНИЛИЩЕ ---
let reminders = [];
if (fs.existsSync(REMINDERS_FILE)) {
    try { reminders = JSON.parse(fs.readFileSync(REMINDERS_FILE)); } catch (e) {}
}

function saveReminders() {
    fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
}

function scheduleJob(reminder) {
    const jobTime = new Date(reminder.time);
    if (jobTime <= new Date()) {
        reminders = reminders.filter(r => r.id !== reminder.id);
        saveReminders();
        return;
    }
    schedule.scheduleJob(jobTime, function() {
        bot.telegram.sendMessage(reminder.chatId, 
            `🔔 <b>НАПОМИНАНИЕ!</b>\n\n📝 "${reminder.text}"\n👤 Для: ${reminder.user}`, 
            { parse_mode: 'HTML' }
        ).catch(err => console.error("Ошибка отправки:", err.message));
        
        reminders = reminders.filter(r => r.id !== reminder.id);
        saveReminders();
    });
}
reminders.forEach(scheduleJob);

// --- МОЗГ БОТА (MISTRAL) ---
async function getAIResponse(text, contextReminders) {
    const now = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    
    const remindersContext = contextReminders.length > 0 
        ? "ТЕКУЩИЕ НАПОМИНАНИЯ:\n" + contextReminders.map(r => `- ${r.text} (${new Date(r.time).toLocaleTimeString()})`).join("\n")
        : "Список пуст.";

    const systemPrompt = `
    Ты — умный строительный ассистент и секретарь. Время: ${now}.
    ${remindersContext}

    ИНСТРУКЦИЯ ПО ОТВЕТАМ:
    1. Сначала ответь на вопрос пользователя текстом (про укладку, пироги пола и т.д.).
    2. Если пользователь просит что-то сделать (напомнить, удалить, показать список) — добавь специальный блок КОМАНДЫ в конце ответа.
    
    ФОРМАТ КОМАНДЫ (пиши строго в конце сообщения):
    <<<JSON
    {"actions": [
       {"type": "remind", "text": "...", "time": "..."},
       {"type": "list"}
    ]}
    JSON>>>

    ПРИМЕР 1 (Вопрос + Напоминание):
    Пользователь: "Как мешать бетон? Напомни купить цемент через час."
    Твой ответ:
    Для бетона нужна пропорция 1:3:5...
    <<<JSON
    {"actions": [{"type": "remind", "text": "Купить цемент", "time": "через час"}]}
    JSON>>>

    ПРИМЕР 2 (Мульти-команда):
    Пользователь: "Напомни позвонить маме в 5 и покажи список."
    Твой ответ:
    Сделано!
    <<<JSON
    {"actions": [
       {"type": "remind", "text": "Позвонить маме", "time": "в 17:00"},
       {"type": "list"}
    ]}
    JSON>>>
    
    Если команд нет, просто отвечай текстом без тегов JSON.
    `;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MISTRAL_KEY}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: text }
                ],
                temperature: 0.5
            })
        });

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "";

    } catch (e) {
        console.error("AI Error:", e);
        return "⚠️ Ошибка связи.";
    }
}

// --- ОБРАБОТЧИК ---
bot.on('text', async (ctx) => {
    const msg = ctx.message.text;
    const isGroup = ['group', 'supergroup'].includes(ctx.chat.type);
    
    const tagRegex = new RegExp(BOT_TAG, 'i');
    const isMentioned = tagRegex.test(msg);
    const isReply = ctx.message.reply_to_message?.from?.username === ctx.botInfo.username;

    if (isGroup && !isMentioned && !isReply) return;

    const cleanText = msg.replace(tagRegex, '').trim();
    if (!cleanText && !isReply) return;

    ctx.sendChatAction('typing');

    const chatReminders = reminders.filter(r => r.chatId === ctx.chat.id);
    const rawResponse = await getAIResponse(cleanText, chatReminders);

    // --- ПАРСИНГ ОТВЕТА ---
    // Ищем блок <<<JSON ... JSON>>>
    const jsonRegex = /<<<JSON([\s\S]*?)JSON>>>/;
    const match = rawResponse.match(jsonRegex);

    let textToSend = rawResponse;
    let actions = [];

    if (match) {
        // Если есть команды, отделяем их от текста
        textToSend = rawResponse.replace(match[0], '').trim();
        try {
            const parsed = JSON.parse(match[1]);
            if (parsed.actions) actions = parsed.actions;
        } catch (e) {
            console.error("JSON Parse Error", e);
        }
    }

    // 1. Отправляем текстовый ответ (если есть)
    if (textToSend) {
        await ctx.reply(textToSend, { reply_to_message_id: ctx.message.message_id, parse_mode: 'Markdown' });
    }

    // 2. Выполняем действия
    for (const action of actions) {
        if (action.type === 'remind') {
            const parsedDate = chrono.ru.parseDate(action.time, new Date(), { forwardDate: true });
            
            if (parsedDate) {
                const newReminder = {
                    id: Date.now().toString() + Math.random(),
                    chatId: ctx.chat.id,
                    user: ctx.from.first_name,
                    time: parsedDate.toISOString(),
                    text: action.text
                };
                reminders.push(newReminder);
                saveReminders();
                scheduleJob(newReminder);
                
                await ctx.reply(`✍️ <b>Добавлено напоминание:</b> "${action.text}"\n⏰ ${parsedDate.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`, { parse_mode: 'HTML' });
            } else {
                 await ctx.reply(`⚠️ Не смог понять время для напоминания: "${action.time}"`);
            }
        }

        if (action.type === 'list') {
            if (chatReminders.length === 0 && reminders.filter(r => r.chatId === ctx.chat.id).length === 0) { // Check refreshed list
                 await ctx.reply("📂 Список напоминаний пуст.");
            } else {
                // Re-read reminders to include the one just added
                const freshList = reminders.filter(r => r.chatId === ctx.chat.id);
                const listText = freshList
                    .sort((a,b) => new Date(a.time) - new Date(b.time))
                    .map(r => `🔹 <b>${new Date(r.time).toLocaleString('ru-RU', { hour:'2-digit', minute:'2-digit', day:'numeric' })}</b>: ${r.text}`)
                    .join('\n');
                await ctx.reply(`📋 <b>Ваши напоминания:</b>\n${listText}`, { parse_mode: 'HTML' });
            }
        }
        
        if (action.type === 'delete') {
             // Simple keyword deletion
             const keyword = action.keyword?.toLowerCase();
             const initialLen = reminders.length;
             reminders = reminders.filter(r => !r.text.toLowerCase().includes(keyword));
             
             if (reminders.length < initialLen) {
                 saveReminders();
                 await ctx.reply(`🗑 Напоминание с "${keyword}" удалено.`);
             } else {
                 await ctx.reply(`🤷‍♂️ Не нашел напоминания с "${keyword}".`);
             }
        }
    }
});

console.log("🚀 Бот (v4 - Мультизадачный) запущен!");
bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
