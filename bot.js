const { Telegraf, Markup } = require('telegraf');
const { Connection, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const express = require('express');
const axios = require('axios');

// ============== CONFIGURATION ==============
const BOT_TOKEN = process.env.BOT_TOKEN;
const TOKEN_MINT = new PublicKey(process.env.TOKEN_MINT || 'C8KsvkMBuqmvX416MWTJGKW9S9MpKiUjmpnj1fhzpump');
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const GAME_URL = process.env.GAME_URL || 'https://infinitecoin-jumper-tgz1.vercel.app';
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN;
const PORT = process.env.PORT || 10000;

// Validate required env vars
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN is required! Set it in Render Environment Variables.');
    process.exit(1);
}

// ============== INITIALIZATION ==============
const connection = new Connection(RPC_ENDPOINT, 'confirmed');
const bot = new Telegraf(BOT_TOKEN);
const app = express();

// Middleware
app.use(express.json());

// In-memory storage (use Redis/database for production)
const connectedWallets = new Map();

// ============== COMMAND HANDLERS ==============

// /start - Welcome message
bot.command('start', async (ctx) => {
    const userName = ctx.from.first_name || 'Player';
    
    await ctx.reply(
        `🎮 *Welcome to Infinitecoin Jumper, ${userName}!* 🚀\n\n` +
        `Jump, dodge, and collect Infinite Coins (IFC) in this thrilling Telegram P2E game! The higher you jump, the more you earn.\n\n` +
        `✨ *What makes us special:*\n` +
        `• 🕹️ *Free to Play* - Start jumping immediately\n` +
        `• 💰 *Earn Real IFC* - Collect coins convert to real tokens\n` +
        `• 🔒 *Secure Escrow* - Rewards held safely until you claim\n` +
        `• ⚡ *Instant Claims* - Withdraw to your wallet anytime\n\n` +
        `📋 *Available Commands:*\n` +
        `🎮 */play* - Launch the game and start jumping!\n` +
        `🔗 */connect* - Link your Phantom wallet to earn\n` +
        `💼 */wallet* - Check your wallet & IFC balance\n` +
        `❓ */help* - Game guide, tips, and requirements\n\n` +
        `⚠️ *Important:* You need at least *$2 worth of IFC* in your connected wallet to claim rewards.\n\n` +
        `Ready to jump into the infinite? Click /play to start! 🚀`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🎮 Play Now', 'play_game')],
                [Markup.button.callback('🔗 Connect Wallet', 'connect_wallet')],
                [Markup.button.callback('❓ How to Play', 'show_help')]
            ])
        }
    );
});

// /help - Game instructions
bot.command('help', async (ctx) => {
    await ctx.reply(
        `📚 *Infinitecoin Jumper - Complete Guide*\n\n` +
        `🎮 *How to Play:*\n` +
        `• Tap */play* to launch the game\n` +
        `• Tap/click to jump and double-jump\n` +
        `• Collect 🪙 golden coins for IFC tokens\n` +
        `• Avoid 🔺 red spikes and viruses\n` +
        `• Survive longer = higher score = more earnings\n\n` +
        `💰 *Earning IFC:*\n` +
        `• Each coin = IFC tokens earned\n` +
        `• Height bonus for climbing high\n` +
        `• Combo multiplier for consecutive collections\n\n` +
        `🔐 *Claiming Rewards:*\n` +
        `1. Connect wallet with */connect*\n` +
        `2. Play and earn (rewards held in escrow)\n` +
        `3. Use */wallet* to check balance\n` +
        `4. Click "Claim" when ready (need $2 IFC min)\n\n` +
        `⚠️ *Requirements:*\n` +
        `Must hold *$2 USD worth of IFC* to claim. This prevents bots and ensures fair distribution.\n\n` +
        `💡 *Need IFC?* Buy on [Jupiter](https://jup.ag/swap/SOL-C8KsvkMBuqmvX416MWTJGKW9S9MpKiUjmpnj1fhzpump)`,
        {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🎮 Start Playing', 'play_game')],
                [Markup.button.callback('🔗 Connect Wallet', 'connect_wallet')]
            ])
        }
    );
});

// /play - Launch game
bot.command('play', async (ctx) => {
    const telegramId = ctx.from.id;
    const hasWallet = connectedWallets.has(telegramId);
    
    const message = hasWallet 
        ? `🎮 *Ready to Jump?*\n\nYour wallet is connected! Collect coins, avoid spikes, and earn IFC!`
        : `🎮 *Ready to Jump?*\n\n⚠️ *Guest Mode:* Connect your wallet with */connect* to earn real IFC tokens!`;

    const buttons = [[Markup.button.webApp('🚀 Launch Game', GAME_URL)]];
    if (!hasWallet) {
        buttons.push([Markup.button.callback('🔗 Connect to Earn', 'connect_wallet')]);
    }

    await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
    });
});

// /connect - Connect Phantom wallet
bot.command('connect', async (ctx) => {
    const telegramId = ctx.from.id;
    
    // Check if already connected
    if (connectedWallets.has(telegramId)) {
        const wallet = connectedWallets.get(telegramId);
        return ctx.reply(
            `✅ *Wallet Connected*\n\n` +
            `🔗 Address: \`${wallet}\`\n\n` +
            `You're ready to earn and claim IFC!`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('💼 View Wallet', 'show_wallet')],
                    [Markup.button.callback('🎮 Play Game', 'play_game')],
                    [Markup.button.callback('🔗 Change Wallet', 'change_wallet')]
                ])
            }
        );
    }

    // Generate Phantom deep link
    const botInfo = await ctx.telegram.getMe();
    const botUsername = botInfo.username;
    const deepLink = `https://phantom.app/ul/v1/connect?app_url=https://t.me/${botUsername}&dapp_encryption_public_key=6n46W8rZvq7r27XLYfX9U5e6X8rZvq7r27XLYfX9U5e6&cluster=mainnet-beta&redirect_link=https://t.me/${botUsername}?start=wallet_${telegramId}`;

    await ctx.reply(
        `🔗 *Connect Your Phantom Wallet*\n\n` +
        `To earn IFC rewards, connect your Solana wallet:\n\n` +
        `1. Tap the button below to open Phantom\n` +
        `2. Select your wallet\n` +
        `3. Approve the connection\n` +
        `4. Return to Telegram\n\n` +
        `🔒 *Security:* We only need your public address. Never share your private key!`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.url('🔗 Open Phantom Wallet', deepLink)],
                [Markup.button.callback('❓ I need Phantom', 'no_phantom_help')]
            ])
        }
    );
});

// /wallet - Check wallet and balance
bot.command('wallet', async (ctx) => {
    const telegramId = ctx.from.id;
    const walletAddress = connectedWallets.get(telegramId);
    
    if (!walletAddress) {
        return ctx.reply(
            `💼 *No Wallet Connected*\n\n` +
            `Connect your Phantom wallet to:\n` +
            `• View IFC balance\n` +
            `• Track earnings\n` +
            `• Claim rewards\n\n` +
            `Use */connect* to link your wallet.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔗 Connect Wallet', 'connect_wallet')]
                ])
            }
        );
    }

    const loadingMsg = await ctx.reply('⏳ Checking your wallet...');

    try {
        const balance = await fetchTokenBalance(walletAddress);
        const usdValue = await calculateUsdValue(balance);
        const canClaim = usdValue >= 2;
        const pendingRewards = 0; // TODO: Fetch from smart contract

        await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});

        let statusText = `💼 *Your Wallet*\n\n` +
            `🔗 \`${walletAddress}\`\n\n` +
            `💰 *Balance:* ${formatNumber(balance)} IFC\n` +
            `💵 *~$${usdValue.toFixed(2)} USD*\n\n` +
            `🎁 *Pending:* ${formatNumber(pendingRewards)} IFC\n` +
            `🔓 *Status:* ${canClaim ? '✅ Ready to claim' : '❌ Need $2 IFC min'}\n\n`;

        if (!canClaim && pendingRewards > 0) {
            statusText += `⚠️ Add $${(2 - usdValue).toFixed(2)} more IFC to unlock claims.\n\n`;
        }

        const buttons = [];
        if (pendingRewards > 0 && canClaim) {
            buttons.push([Markup.button.callback('🎁 Claim Rewards', 'claim_rewards')]);
        }
        buttons.push(
            [Markup.button.callback('🔄 Refresh', 'refresh_wallet')],
            [Markup.button.callback('🔗 Change Wallet', 'change_wallet')]
        );

        await ctx.reply(statusText, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });

    } catch (error) {
        console.error('Wallet check error:', error);
        await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
        await ctx.reply('❌ Error checking wallet. Please try again.');
    }
});

// ============== ACTION HANDLERS ==============

bot.action('play_game', async (ctx) => {
    await ctx.answerCbQuery();
    await bot.telegram.sendMessage(ctx.from.id, '/play');
});

bot.action('connect_wallet', async (ctx) => {
    await ctx.answerCbQuery();
    await bot.telegram.sendMessage(ctx.from.id, '/connect');
});

bot.action('show_wallet', async (ctx) => {
    await ctx.answerCbQuery();
    await bot.telegram.sendMessage(ctx.from.id, '/wallet');
});

bot.action('show_help', async (ctx) => {
    await ctx.answerCbQuery();
    await bot.telegram.sendMessage(ctx.from.id, '/help');
});

bot.action('refresh_wallet', async (ctx) => {
    await ctx.answerCbQuery('Refreshing...');
    await bot.telegram.sendMessage(ctx.from.id, '/wallet');
});

bot.action('change_wallet', async (ctx) => {
    await ctx.answerCbQuery();
    connectedWallets.delete(ctx.from.id);
    await ctx.reply('🔄 Wallet disconnected. Use /connect to link a new one.');
});

bot.action('no_phantom_help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        `📱 *Get Phantom Wallet*\n\n` +
        `1. Download: [iOS](https://apps.apple.com/app/phantom-wallet/id1598432977) | [Android](https://play.google.com/store/apps/details?id=app.phantom) | [Chrome](https://chrome.google.com/webstore/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa)\n` +
        `2. Create wallet and save recovery phrase\n` +
        `3. Return and tap */connect*`,
        {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔗 Connect Now', 'connect_wallet')]
            ])
        }
    );
});

// Handle wallet connection from deep link
bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    const telegramId = ctx.from.id;

    // Check if it's a Solana wallet address (32-44 chars, base58)
    if (text.length >= 32 && text.length <= 44 && /^[A-HJ-NP-Za-km-z1-9]+$/.test(text)) {
        try {
            new PublicKey(text); // Validate
            connectedWallets.set(telegramId, text);
            
            await ctx.reply(
                `✅ *Wallet Connected!*\n\n` +
                `🔗 \`${text}\`\n\n` +
                `You're ready to earn IFC! Use /play to start.`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🎮 Play Now', 'play_game')],
                        [Markup.button.callback('💼 Check Wallet', 'show_wallet')]
                    ])
                }
            );
        } catch (e) {
            // Not a valid address, ignore
        }
    }
});

// ============== HELPER FUNCTIONS ==============

async function fetchTokenBalance(address) {
    try {
        const tokenAccount = await getAssociatedTokenAddress(
            TOKEN_MINT,
            new PublicKey(address),
            false
        );
        const account = await getAccount(connection, tokenAccount);
        return Number(account.amount);
    } catch (error) {
        return 0; // No token account yet
    }
}

async function calculateUsdValue(balance) {
    // TODO: Fetch real price from Jupiter API
    // Placeholder: assume $0.0001 per IFC
    return balance * 0.0001;
}

function formatNumber(num) {
    if (num === 0) return '0';
    if (num < 1000) return num.toString();
    if (num < 1000000) return (num / 1000).toFixed(1) + 'K';
    return (num / 1000000).toFixed(2) + 'M';
}

// ============== WEBHOOK SETUP ==============

// Health check endpoints (required for Render)
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        bot: 'Infinitecoin Jumper',
        timestamp: new Date().toISOString(),
        webhook: WEBHOOK_DOMAIN || 'not set'
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        uptime: process.uptime(),
        wallets_connected: connectedWallets.size
    });
});

// Webhook endpoint for Telegram
app.post('/webhook', (req, res) => {
    console.log('📩 Received webhook:', req.body.update_id);
    bot.handleUpdate(req.body, res);
});

// Error handling
bot.catch((err, ctx) => {
    console.error(`❌ Error for ${ctx.updateType}:`, err.message);
    ctx.reply('❌ An error occurred. Please try again.').catch(console.error);
});

// ============== START SERVER ==============

async function startBot() {
    // Start Express server first (non-blocking)
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`🌐 Server running on port ${PORT}`);
        console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    });

    // Set webhook if domain is provided (async, non-blocking)
    if (WEBHOOK_DOMAIN) {
        const webhookUrl = `${WEBHOOK_DOMAIN}/webhook`;
        try {
            await bot.telegram.deleteWebhook({ drop_pending_updates: true });
            await bot.telegram.setWebhook(webhookUrl, {
                allowed_updates: ['message', 'callback_query']
            });
            console.log(`✅ Webhook set: ${webhookUrl}`);
            
            // Verify webhook
            const info = await bot.telegram.getWebhookInfo();
            console.log('📊 Webhook info:', {
                url: info.url,
                pending_updates: info.pending_update_count,
                max_connections: info.max_connections
            });
        } catch (error) {
            console.error('❌ Webhook setup failed:', error.message);
            console.log('⚠️ Bot will still respond to health checks');
        }
    } else {
        console.log('⚠️ No WEBHOOK_DOMAIN set, using polling mode...');
        await bot.launch();
    }

    console.log('🤖 Bot is running!');
}

startBot().catch(err => {
    console.error('❌ Failed to start:', err);
    process.exit(1);
});

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down...');
    bot.stop('SIGINT');
    process.exit(0);
});
process.once('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down...');
    bot.stop('SIGTERM');
    process.exit(0);
});
