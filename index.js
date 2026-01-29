process.env.TZ = 'Europe/Moscow';
require('dotenv').config();
const { Telegraf } = require('telegraf');
const schedule = require('node-schedule');
const chrono = require('chrono-node');
const fs = require('fs');
const path = require('path');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MISTRAL_KEY = process.env.MISTRAL_API_KEY;
const API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MODEL = 'mistral-small-latest';
const REMINDERS_FILE = path.join(__dirname, 'reminders.json');

const bot = new Telegraf(TELEGRAM_TOKEN);
let reminders = [];
try { if (fs.existsSync(REMINDERS_FILE)) reminders = JSON.parse(fs.readFileSync(REMINDERS_FILE)); } catch (e) {}

function saveReminders() { fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2)); }
function formatTime(iso) { return new Date(iso).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long' }); }

function scheduleJob(reminder) {
    const jobTime = new Date(reminder.time);
    if (jobTime <= new Date()) {
        reminders = reminders.filter(r => r.id !== reminder.id);
        saveReminders();
        return;
    }
    schedule.scheduleJob(jobTime, function() {
        bot.telegram.sendMessage(reminder.chatId, `🔔 <b>Напоминание</b>\n\n▫️ ${reminder.text}`, { parse_mode: 'HTML' }).catch(() => {});
        reminders = reminders.filter(r => r.id !== reminder.id);
        saveReminders();
    });
}
reminders.forEach(scheduleJob);

async function getAIResponse(text) {
    const systemPrompt = `
    Ты ассистент Minibrick.
    Если вопрос - отвечай кратко.
    Если команда - отвечай ТОЛЬКО JSON-блоком.
    
    ФОРМАТ JSON:
    <<<JSON
    {"actions": [
       {"type": "remind", "text": "...", "time": "..."},
       {"type": "delete", "keyword": "..."},
       {"type": "clear_all"},
       {"type": "list"}
    ]}
    JSON>>>
    
    Примеры:
    "Удали все" -> <<<JSON {"actions": [{"type": "clear_all"}]} JSON>>>
    "Очисти список" -> <<<JSON {"actions": [{"type": "clear_all"}]} JSON>>>
    `;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MISTRAL_KEY}` },
            body: JSON.stringify({ model: MODEL, messages: [{role: "system", content: systemPrompt}, {role: "user", content: text}], temperature: 0.1 })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "";
    } catch (e) { return "Ошибка AI"; }
}

bot.on('text', async (ctx) => {
    try {
        const msg = ctx.message.text;
        if (['group','supergroup'].includes(ctx.chat.type) && !msg.includes('@minibrickbot') && !ctx.message.reply_to_message) return;
        
        ctx.sendChatAction('typing');
        const clean = msg.replace('@minibrickbot', '').trim();
        const raw = await getAIResponse(clean);

        const jsonRegex = /<<<JSON([\s\S]*?)JSON>>>/;
        const match = raw.match(jsonRegex);
        let textToSend = raw;
        let actions = [];

        if (match) {
            textToSend = raw.replace(match[0], '').trim();
            try { const p = JSON.parse(match[1]); actions = p.actions || []; } catch (e) {}
        }

        if (textToSend.trim()) await ctx.reply(textToSend, { reply_to_message_id: ctx.message.message_id, parse_mode: 'Markdown' });

        for (const a of actions) {
            if (a.type === 'remind') {
                const d = chrono.ru.parseDate(a.time, new Date(), { forwardDate: true });
                if (d) {
                    if (d < new Date() && a.time.includes('завтра')) d.setDate(d.getDate() + 1);
                    const isDup = reminders.some(r => r.chatId === ctx.chat.id && r.text.toLowerCase() === a.text.toLowerCase() && Math.abs(new Date(r.time) - d) < 60000);
                    if (!isDup) {
                        const r = { id: Date.now()+Math.random().toString(), chatId: ctx.chat.id, text: a.text, time: d.toISOString() };
                        reminders.push(r); saveReminders(); scheduleJob(r);
                        await ctx.reply(`✍️ <b>Записал:</b> ${a.text}\n⏰ ${formatTime(d.toISOString())}`, { parse_mode: 'HTML' });
                    }
                }
            }
            if (a.type === 'list') {
                const list = reminders.filter(r => r.chatId === ctx.chat.id).sort((x,y) => new Date(x.time)-new Date(y.time));
                if (!list.length) { if (!textToSend.trim()) await ctx.reply("📂 Пусто."); }
                else {
                    const unique = []; const seen = new Set();
                    list.forEach(r => { const k = r.text+r.time; if(!seen.has(k)){seen.add(k); unique.push(r);} });

                    let msg = "📋 <b>Ваши задачи:</b>\n";
                    let curDay = "";
                    unique.forEach(r => {
                        const d = new Date(r.time);
                        const dayStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short', timeZone: 'Europe/Moscow' });
                        const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
                        if (dayStr !== curDay) { msg += `\n📅 <b>${dayStr}</b>\n`; curDay = dayStr; }
                        msg += `   └ <code>${timeStr}</code> ${r.text}\n`;
                    });
                    await ctx.reply(msg, { parse_mode: 'HTML' });
                }
            }
            if (a.type === 'delete') {
                const k = a.keyword?.toLowerCase();
                if (k) {
                    const l = reminders.length;
                    reminders = reminders.filter(r => r.chatId !== ctx.chat.id || !r.text.toLowerCase().includes(k));
                    if (reminders.length < l) { saveReminders(); await ctx.reply(`🗑 Удалено: "${k}"`); }
                    else await ctx.reply(`🔍 Не нашел: "${k}"`);
                }
            }
            // NEW: Clear All
            if (a.type === 'clear_all') {
                const l = reminders.length;
                reminders = reminders.filter(r => r.chatId !== ctx.chat.id);
                if (reminders.length < l) { saveReminders(); await ctx.reply("🗑 Все задачи удалены."); }
                else await ctx.reply("📂 Список и так пуст.");
            }
        }
    } catch (e) { console.error(e); }
});

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
