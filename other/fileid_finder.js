const { Telegraf } = require('telegraf');

// --- IMPORTANT ---
// Use the same bot token as your main bot
const bot = new Telegraf('7966271636:AAFEoYXxtFk-IRfSl_wv48jMxaeAWZ8FmH4');

bot.start((ctx) => {
    ctx.reply('Hello! Send me any GIF, sticker, or photo, and I will reply with its file_id.');
});

// This handler will be triggered when you send a GIF (animation)
bot.on('animation', (ctx) => {
    const fileId = ctx.message.animation.file_id;
    console.log('Received GIF. File ID:', fileId);
    
    // THE FIX: Escaped the special characters '!', '.', and '-'
    ctx.reply(
        `✅ GIF Received\\!\n\nFile ID:\n\`${fileId}\``, 
        { parse_mode: 'MarkdownV2' }
    );
});

// Optional: Add handlers for other file types with the same fix

// Handler for photos
bot.on('photo', (ctx) => {
    const fileId = ctx.message.photo.pop().file_id;
    console.log('Received Photo. File ID:', fileId);

    // THE FIX: Escaped the special characters '!', '.', and '-'
    ctx.reply(
        `✅ Photo Received\\!\n\nFile ID:\n\`${fileId}\``, 
        { parse_mode: 'MarkdownV2' }
    );
});

// Handler for stickers
bot.on('sticker', (ctx) => {
    const fileId = ctx.message.sticker.file_id;
    console.log('Received Sticker. File ID:', fileId);

    // THE FIX: Escaped the special characters '!', '.', and '-'
    ctx.reply(
        `✅ Sticker Received\\!\n\nFile ID:\n\`${fileId}\``,
        { parse_mode: 'MarkdownV2' }
    );
});

bot.launch(() => {
    console.log('✅ File ID Finder Bot is running. Send it a file to get the ID.');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));