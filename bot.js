const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');

// ============== CONFIGURATION ==============
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN; // e.g., https://your-bot.onrender.com
const PORT = process.env.PORT || 10000;
const DATA_FILE = path.join(__dirname, 'users.json');

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN is required!');
    process.exit(1);
}

// ============== INITIALIZATION ==============
const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(express.json());

// In-memory storage (persisted to JSON file)
let users = {}; // { userId: { wallet: string, balance: number, unclaimed: number, connected: boolean } }

// ============== DATA PERSISTENCE ==============

async function loadUsers() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        users = JSON.parse(data);
        console.log(`📊 Loaded ${Object.keys(users).length} users from disk`);
    } catch (err) {
        console.log('📁 No existing user data, starting fresh');
        users = {};
    }
}

async function saveUsers() {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(users, null, 2));
    } catch (err) {
        console.error('❌ Failed to save users:', err);
    }
}

function getUser(userId) {
    if (!users[userId]) {
        users[userId] = {
            wallet: null,
            balance: 0,
            unclaimed: 0,
            connected: false,
            username: null
        };
    }
    return users[userId];
}

// ============== COMMAND HANDLERS ==============

// 1. /start - Welcome message with inline buttons
bot.command('start', async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'Player';
    const user = getUser(userId);
    user.username = userName;
    await saveUsers();

    const welcomeText = 
        `🎮 *Welcome to Infinitecoin Jumper, ${userName}!* 🚀\n\n` +
        `Jump, dodge, and collect Infinite Coins (IFC) in this thrilling P2E game!\n\n` +
        `💰 *Your Stats:*\n` +
        `• Balance: ${user.balance} IFC\n` +
        `• Unclaimed: ${user.unclaimed} IFC\n` +
        `• Wallet: ${user.connected ? '✅ Connected' : '❌ Not connected'}\n\n` +
        `Use the buttons below to get started!`;

    await ctx.reply(welcomeText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🎮 Play', 'play_game'), Markup.button.callback('🔗 Connect Wallet', 'connect_wallet')],
            [Markup.button.callback('💰 Balance', 'show_balance'), Markup.button.callback('❓ Help', 'show_help')]
        ])
    });
});

// 2. /help - List all commands
bot.command('help', async (ctx) => {
    const helpText = 
        `📚 *Infinitecoin Jumper Commands*\n\n` +
        `🎮 */play* - Jump and earn IFC\n` +
        `🔗 */connect* - Link your Phantom wallet\n` +
        `💰 */balance* - Check your IFC balance\n` +
        `🎁 */claim* - Move unclaimed earnings to balance\n` +
        `❓ */help* - Show this help message\n\n` +
        `*How it works:*\n` +
        `1. Connect your wallet with /connect\n` +
        `2. Play with /play to earn IFC\n` +
        `3. Check earnings with /balance\n` +
        `4. Claim earnings with /claim\n\n` +
        `⚠️ *Note:* You need $2 worth of IFC to claim rewards.`;

    await ctx.reply(helpText, { parse_mode: 'Markdown' });
});

// 3. /play - Simulate game and earn IFC
bot.command('play', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);
    
    // Simulate game earnings (random 5-50 IFC)
    const earned = Math.floor(Math.random() * 46) + 5;
    user.unclaimed += earned;
    await saveUsers();

    const playText = 
        `🎮 *Jumping!*\n\n` +
        `You earned +${earned} IFC! 🪙\n\n` +
        `• Unclaimed: ${user.unclaimed} IFC\n` +
        `• Use /claim to collect your earnings`;

    await ctx.reply(playText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🎮 Play Again', 'play_game')],
            [Markup.button.callback('🎁 Claim Now', 'claim_rewards')]
        ])
    });
});

// 4. /connect - Phantom wallet deep link
bot.command('connect', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);

    if (user.connected && user.wallet) {
        return ctx.reply(
            `✅ *Wallet Already Connected*\n\n` +
            `🔗 Address: \`${user.wallet}\`\n\n` +
            `You're ready to earn and claim IFC!`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🎮 Play', 'play_game')],
                    [Markup.button.callback('💰 Balance', 'show_balance')]
                ])
            }
        );
    }

    // Generate Phantom deep link to our landing page
    const landingPageUrl = `${WEBHOOK_DOMAIN}/connect.html?user=${userId}`;
    const phantomDeepLink = `https://phantom.app/ul/browse/${encodeURIComponent(landingPageUrl)}`;

    await ctx.reply(
        `🔗 *Connect Your Phantom Wallet*\n\n` +
        `Tap the button below to open Phantom and connect your wallet.\n\n` +
        `🔒 *Security:* We only need your public address. Never share your private key!`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.url('🔗 Open Phantom Wallet', phantomDeepLink)],
                [Markup.button.callback('❓ How to connect', 'connect_help')]
            ])
        }
    );
});

// 5. /balance - Show user's IFC balance
bot.command('balance', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);

    const balanceText = 
        `💰 *Your Infinitecoin Balance*\n\n` +
        `🪙 *Available:* ${user.balance} IFC\n` +
        `🎁 *Unclaimed:* ${user.unclaimed} IFC\n` +
        `💵 *Total:* ${user.balance + user.unclaimed} IFC\n\n` +
        `🔗 *Wallet:* ${user.connected ? `\`${user.wallet}\`` : 'Not connected'}\n\n` +
        `${user.unclaimed > 0 ? 'Use /claim to collect unclaimed earnings!' : 'Play /play to earn more!'}`;

    await ctx.reply(balanceText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🎮 Play', 'play_game'), Markup.button.callback('🎁 Claim', 'claim_rewards')]
        ])
    });
});

// 6. /claim - Move unclaimed to balance (mock escrow release)
bot.command('claim', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);

    if (user.unclaimed <= 0) {
        return ctx.reply(
            `❌ *Nothing to Claim*\n\n` +
            `You have no unclaimed earnings.\n` +
            `Use /play to earn IFC!`,
            { parse_mode: 'Markdown' }
        );
    }

    if (!user.connected) {
        return ctx.reply(
            `❌ *Wallet Not Connected*\n\n` +
            `You need to connect your wallet first.\n` +
            `Use /connect to link your Phantom wallet.`,
            { parse_mode: 'Markdown' }
        );
    }

    // TODO: Replace with actual escrow contract call to: https://github.com/WangOGbull/infinitejumper-escrow
    // const escrowProgram = new PublicKey("YOUR_ESCROW_PROGRAM_ID");
    // await escrowProgram.methods.claimRewards().accounts({...}).rpc();

    const claimedAmount = user.unclaimed;
    user.balance += claimedAmount;
    user.unclaimed = 0;
    await saveUsers();

    await ctx.reply(
        `🎉 *Claim Successful!*\n\n` +
        `✅ ${claimedAmount} IFC added to your balance\n` +
        `💰 New balance: ${user.balance} IFC\n\n` +
        `_Note: This is a mock claim. In production, this will call the escrow contract._`,
        { parse_mode: 'Markdown' }
    );
});

// ============== ACTION HANDLERS (Inline Buttons) ==============

bot.action('play_game', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const user = getUser(userId);
    
    const earned = Math.floor(Math.random() * 46) + 5;
    user.unclaimed += earned;
    await saveUsers();

    await ctx.editMessageText(
        `🎮 *Jumping!*\n\n` +
        `You earned +${earned} IFC! 🪙\n\n` +
        `• Unclaimed: ${user.unclaimed} IFC\n` +
        `• Use /claim to collect your earnings`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🎮 Play Again', 'play_game')],
                [Markup.button.callback('🎁 Claim Now', 'claim_rewards')]
            ])
        }
    );
});

bot.action('connect_wallet', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('/connect');
});

bot.action('show_balance', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('/balance');
});

bot.action('show_help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('/help');
});

bot.action('claim_rewards', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('/claim');
});

bot.action('connect_help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        `📱 *How to Connect Phantom Wallet*\n\n` +
        `1. Tap "Open Phantom Wallet" button\n` +
        `2. Phantom app will open\n` +
        `3. Approve the connection\n` +
        `4. Your wallet will be linked automatically\n\n` +
        `🔒 We only store your public wallet address.`
    );
});

// ============== WEBHOOK ENDPOINTS FOR LANDING PAGE ==============

// Health check
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        bot: 'Infinitecoin Jumper',
        users: Object.keys(users).length,
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        uptime: process.uptime(),
        users_count: Object.keys(users).length
    });
});

// Telegram webhook
app.post('/webhook', (req, res) => {
    bot.handleUpdate(req.body, res);
});

// API endpoint for landing page to confirm wallet connection
app.post('/api/connect-wallet', async (req, res) => {
    const { userId, walletAddress } = req.body;
    
    if (!userId || !walletAddress) {
        return res.status(400).json({ error: 'Missing userId or walletAddress' });
    }

    const user = getUser(userId);
    user.wallet = walletAddress;
    user.connected = true;
    await saveUsers();

    // Send confirmation message to user via bot
    try {
        await bot.telegram.sendMessage(userId, 
            `✅ *Wallet Connected!*\n\n` +
            `🔗 Address: \`${walletAddress}\`\n\n` +
            `You're ready to earn IFC! Use /play to start.`,
            { parse_mode: 'Markdown' }
        );
    } catch (err) {
        console.error('Failed to notify user:', err);
    }

    res.json({ success: true, message: 'Wallet connected' });
});

// Serve static files (landing page)
app.use(express.static(path.join(__dirname, 'public')));

// ============== ERROR HANDLING ==============

bot.catch((err, ctx) => {
    console.error(`❌ Error for ${ctx.updateType}:`, err.message);
});

// ============== START SERVER ==============

async function start() {
    await loadUsers();
    
    app.listen(PORT, '0.0.0.0', async () => {
        console.log(`🌐 Server running on port ${PORT}`);
        
        if (WEBHOOK_DOMAIN) {
            const webhookUrl = `${WEBHOOK_DOMAIN}/webhook`;
            try {
                await bot.telegram.deleteWebhook({ drop_pending_updates: true });
                await bot.telegram.setWebhook(webhookUrl);
                console.log(`✅ Webhook set: ${webhookUrl}`);
            } catch (err) {
                console.error('❌ Webhook failed:', err.message);
            }
        } else {
            console.log('⚠️ No WEBHOOK_DOMAIN, using polling...');
            await bot.launch();
        }
        
        console.log('🤖 Bot is running!');
    });
}

start().catch(console.error);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
