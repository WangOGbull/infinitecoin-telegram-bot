const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');

// ============== CONFIGURATION ==============
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN;
const GAME_URL = process.env.GAME_URL || 'https://infinitecoin-jumper-tgz1.vercel.app';
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

let users = {};

// ============== DATA PERSISTENCE ==============

async function loadUsers() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        users = JSON.parse(data);
        console.log(`📊 Loaded ${Object.keys(users).length} users`);
    } catch (err) {
        users = {};
    }
}

async function saveUsers() {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(users, null, 2));
    } catch (err) {
        console.error('❌ Save failed:', err);
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

function maskWallet(address) {
    if (!address || address.length < 8) return 'Not connected';
    return address.slice(0, 4) + '...' + address.slice(-4);
}

// ============== COMMAND HANDLERS ==============

// /start - Welcome with inline buttons
bot.command('start', async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'Player';
    const user = getUser(userId);
    user.username = userName;
    await saveUsers();

    const walletStatus = user.connected 
        ? `💼 ${maskWallet(user.wallet)}` 
        : '❌ Not connected';

    await ctx.reply(
        `🎮 *Welcome to Infinitecoin Jumper, ${userName}!* 🚀\n\n` +
        `💰 *Your Stats:*\n` +
        `• Balance: ${user.balance} IFC\n` +
        `• Unclaimed: ${user.unclaimed} IFC\n` +
        `• Wallet: ${walletStatus}\n\n` +
        `Choose an option below:`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🎮 Play Game', 'play_game')],
                [Markup.button.callback('🔗 Connect Wallet', 'connect_wallet')],
                [Markup.button.callback('💰 Balance', 'show_balance')],
                [Markup.button.callback('❓ Help', 'show_help')]
            ])
        }
    );
});

// /help - Command list
bot.command('help', async (ctx) => {
    await ctx.reply(
        `📚 *Infinitecoin Jumper Commands*\n\n` +
        `🎮 */play* - Launch the jumping game\n` +
        `🔗 */wallet* - Connect your Phantom wallet\n` +
        `💰 */balance* - Check IFC balance & earnings\n` +
        `🎁 */claim* - Collect unclaimed earnings\n` +
        `❓ */help* - Show this help message\n\n` +
        `*How to earn:*\n` +
        `1. Connect wallet with /wallet\n` +
        `2. Play game with /play\n` +
        `3. Earn IFC by collecting coins\n` +
        `4. Claim rewards with /claim\n\n` +
        `⚠️ *Min $2 IFC required to claim*`,
        { parse_mode: 'Markdown' }
    );
});

// /play - Launch game with professional presentation
bot.command('play', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);

    const walletDisplay = user.connected 
        ? `💼 ${maskWallet(user.wallet)}` 
        : '❌ Not connected';

    const gameText = 
        `🎮 *Infinitecoin Jumper* 🚀\n\n` +
        `Tap the button below to start jumping!\n\n` +
        `💰 *Your Stats:*\n` +
        `• Balance: ${user.balance} IFC\n` +
        `• Unclaimed: ${user.unclaimed} IFC\n` +
        `• Wallet: ${walletDisplay}\n\n` +
        `${!user.connected ? '⚠️ Connect wallet to earn real IFC!' : '✅ Ready to earn!'}`;

    await ctx.reply(gameText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.webApp('🚀 Launch Game', GAME_URL)],
            ...(user.connected ? [] : [[Markup.button.callback('🔗 Connect Wallet First', 'connect_wallet')]])
        ])
    });
});

// /wallet - Connect Phantom wallet (FIXED)
bot.command('wallet', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);

    if (user.connected && user.wallet) {
        return ctx.reply(
            `✅ *Wallet Connected*\n\n` +
            `💼 \`${maskWallet(user.wallet)}\`\n\n` +
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

    // Generate connection URL with user ID
    const connectUrl = `${WEBHOOK_DOMAIN}/connect.html?user=${userId}&source=telegram`;
    const phantomDeepLink = `https://phantom.app/ul/browse/${encodeURIComponent(connectUrl)}`;

    await ctx.reply(
        `🔗 *Connect Your Phantom Wallet*\n\n` +
        `Follow these steps:\n` +
        `1️⃣ Tap "Open Phantom" below\n` +
        `2️⃣ Phantom will open\n` +
        `3️⃣ Tap "Connect" in Phantom\n` +
        `4️⃣ Return to Telegram automatically\n\n` +
        `🔒 *We only store your public address*`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.url('👻 Open Phantom Wallet', phantomDeepLink)],
                [Markup.button.callback('❓ Need Help?', 'wallet_help')]
            ])
        }
    );
});

// /balance - Show stats
bot.command('balance', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId);

    const balanceText = 
        `💰 *Your Infinitecoin Balance*\n\n` +
        `🪙 *Available:* ${user.balance} IFC\n` +
        `🎁 *Unclaimed:* ${user.unclaimed} IFC\n` +
        `💵 *Total:* ${user.balance + user.unclaimed} IFC\n\n` +
        `💼 *Wallet:* ${user.connected ? `\`${maskWallet(user.wallet)}\`` : 'Not connected'}\n\n` +
        `${user.unclaimed > 0 ? '🎁 Use /claim to collect!' : '🎮 Use /play to earn more!'}`;

    await ctx.reply(balanceText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🎮 Play', 'play_game'), Markup.button.callback('🎁 Claim', 'claim_rewards')]
        ])
    });
});

// /claim - Collect earnings
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
            `Connect your wallet first with /wallet`,
            { parse_mode: 'Markdown' }
        );
    }

    // TODO: Replace with actual escrow contract call to: https://github.com/WangOGbull/infinitejumper-escrow
    // const escrowProgram = new PublicKey("YOUR_ESCROW_PROGRAM_ID");
    // await escrowProgram.methods.claimRewards().accounts({...}).rpc();

    const claimed = user.unclaimed;
    user.balance += claimed;
    user.unclaimed = 0;
    await saveUsers();

    await ctx.reply(
        `🎉 *Claim Successful!*\n\n` +
        `✅ ${claimed} IFC added to balance\n` +
        `💼 Wallet: \`${maskWallet(user.wallet)}\`\n` +
        `💰 New balance: ${user.balance} IFC\n\n` +
        `_Mock claim - production will use escrow contract_`,
        { parse_mode: 'Markdown' }
    );
});

// ============== ACTION HANDLERS ==============

bot.action('play_game', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const user = getUser(userId);
    
    const walletDisplay = user.connected 
        ? `💼 ${maskWallet(user.wallet)}` 
        : '❌ Not connected';

    await ctx.editMessageText(
        `🎮 *Infinitecoin Jumper* 🚀\n\n` +
        `Tap the button below to start jumping!\n\n` +
        `💰 *Your Stats:*\n` +
        `• Balance: ${user.balance} IFC\n` +
        `• Unclaimed: ${user.unclaimed} IFC\n` +
        `• Wallet: ${walletDisplay}\n\n` +
        `${!user.connected ? '⚠️ Connect wallet to earn real IFC!' : '✅ Ready to earn!'}`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🚀 Launch Game', GAME_URL)],
                ...(user.connected ? [] : [[Markup.button.callback('🔗 Connect Wallet', 'connect_wallet')]])
            ])
        }
    );
});

bot.action('connect_wallet', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const user = getUser(userId);

    if (user.connected && user.wallet) {
        return ctx.reply(
            `✅ *Already Connected*\n\n` +
            `💼 \`${maskWallet(user.wallet)}\`\n\n` +
            `Your wallet is already linked!`,
            { parse_mode: 'Markdown' }
        );
    }

    const connectUrl = `${WEBHOOK_DOMAIN}/connect.html?user=${userId}&source=telegram`;
    const phantomDeepLink = `https://phantom.app/ul/browse/${encodeURIComponent(connectUrl)}`;

    await ctx.reply(
        `🔗 *Connect Phantom Wallet*\n\n` +
        `Tap below to open Phantom:`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.url('👻 Open Phantom', phantomDeepLink)]
            ])
        }
    );
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

bot.action('wallet_help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        `📱 *How to Connect*\n\n` +
        `1. Install Phantom wallet (phantom.app)\n` +
        `2. Return and tap /wallet\n` +
        `3. Tap "Open Phantom"\n` +
        `4. Approve connection\n` +
        `5. Done! Your wallet is linked`
    );
});

// ============== API ENDPOINTS ==============

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

// API: Connect wallet from landing page
app.post('/api/connect-wallet', async (req, res) => {
    const { userId, walletAddress, source } = req.body;
    
    if (!userId || !walletAddress) {
        return res.status(400).json({ error: 'Missing userId or walletAddress' });
    }

    const user = getUser(userId);
    user.wallet = walletAddress;
    user.connected = true;
    await saveUsers();

    // Notify user via Telegram
    try {
        await bot.telegram.sendMessage(userId, 
            `✅ *Wallet Connected!*\n\n` +
            `💼 \`${maskWallet(walletAddress)}\`\n\n` +
            `${source === 'game' ? 'Return to the game and start earning!' : 'Use /play to start earning!'}`,
            { parse_mode: 'Markdown' }
        );
    } catch (err) {
        console.error('Failed to notify user:', err);
    }

    res.json({ 
        success: true, 
        message: 'Wallet connected',
        maskedWallet: maskWallet(walletAddress)
    });
});

// API: Get user data (for game integration)
app.get('/api/user/:userId', async (req, res) => {
    const userId = req.params.userId;
    const user = getUser(userId);
    
    res.json({
        connected: user.connected,
        wallet: user.wallet,
        maskedWallet: maskWallet(user.wallet),
        balance: user.balance,
        unclaimed: user.unclaimed
    });
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Telegram webhook
app.post('/webhook', (req, res) => {
    bot.handleUpdate(req.body, res);
});

// ============== START ==============

async function start() {
    await loadUsers();
    
    app.listen(PORT, '0.0.0.0', async () => {
        console.log(`🌐 Server running on port ${PORT}`);
        
        if (WEBHOOK_DOMAIN) {
            const webhookUrl = `${WEBHOOK_DOMAIN}/webhook`;
            try {
                await bot.telegram.deleteWebhook({ drop_pending_updates: true });
                await bot.telegram.setWebhook(webhookUrl);
                console.log(`✅ Webhook: ${webhookUrl}`);
            } catch (err) {
                console.error('❌ Webhook failed:', err.message);
            }
        }
        
        console.log('🤖 Bot ready!');
    });
}

start().catch(console.error);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
