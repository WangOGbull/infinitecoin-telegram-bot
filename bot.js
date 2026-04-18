const { Telegraf, Markup } = require('telegraf');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const axios = require('axios');
const express = require('express');

// ============== CONFIGURATION ==============
const BOT_TOKEN = '8695754535:AAF3WjpAdQmmRWXqubN6oSidYYGmQEdr_ek';
const PROGRAM_ID = new PublicKey('YourEscrowProgramID');
const TOKEN_MINT = new PublicKey('C8KsvkMBuqmvX416MWTJGKW9S9MpKiUjmpnj1fhzpump');
const RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';

// Initialize Solana connection
const connection = new Connection(RPC_ENDPOINT);

// Bot wallet from Base64 private key
const privateKeyBase64 = 'MkNxSHUzaE01M1NvQkhUMkFCcFdjVXNNSG0xaFpmTExudVZ2MnNhUWlYanVacE1yTU00NWlyRWlCWXNvcENVOEo5amRhb3JqdGhOQXlFR2FtSE1Ybko4Ug==';
const secretKey = Buffer.from(privateKeyBase64, 'base64');
const botWallet = Keypair.fromSecretKey(secretKey);

// Store user data
const connectedWallets = new Map();
const pendingConnections = new Map();

const bot = new Telegraf(BOT_TOKEN);

// ============== EXPRESS SERVER FOR RENDER ==============
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Infinitecoin Jumper Bot is running!');
});

app.listen(port, () => {
    console.log(`✅ Server listening on port ${port}`);
});

// ============== WELCOME MESSAGE (/start) ==============
bot.start(async (ctx) => {
    const userName = ctx.from.first_name || 'Player';
    const welcomeText = `
🎮 *Welcome to Infinitecoin Jumper, ${userName}!* 🚀

Jump, dodge, and collect Infinite Coins (IFC) in this thrilling Telegram P2E game!

📋 *Commands:*
🎮 */play* - Launch the game
🔗 */connect* - Connect Phantom wallet
💼 */wallet* - Check balance
❓ */help* - Game guide

⚠️ *Need $2 IFC to claim rewards*

Ready to jump? Click /play to start! 🚀
`;

    await ctx.reply(welcomeText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🎮 Play Now', 'play_game')],
            [Markup.button.callback('🔗 Connect Wallet', 'connect_wallet')]
        ])
    });
});

// ============== /HELP COMMAND ==============
bot.command('help', async (ctx) => {
    const helpText = `
📚 *Infinitecoin Jumper Guide*

🎮 *How to Play:*
• Tap /play to launch
• Tap to double jump
• Collect 🪙 coins for points
• Avoid red spikes

💰 *Earning IFC:*
• Each coin = IFC tokens

🔐 *Claim Rewards:*
1. Connect wallet with /connect
2. Play and earn
3. Click "Claim Rewards"

⚠️ *Need $2 IFC in wallet to claim*
`;

    await ctx.reply(helpText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🎮 Play', 'play_game')],
            [Markup.button.callback('🔗 Connect', 'connect_wallet')]
        ])
    });
});

// ============== /PLAY COMMAND ==============
bot.command('play', async (ctx) => {
    await ctx.reply(
        `🎮 *Launching Infinitecoin Jumper...*`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🚀 PLAY NOW', 'https://infinitecoin-jumper-tgz1.vercel.app')]
            ])
        }
    );
});

// ============== /WALLET COMMAND ==============
bot.command('wallet', async (ctx) => {
    const telegramId = ctx.from.id;
    const walletData = connectedWallets.get(telegramId);
    
    if (!walletData) {
        return ctx.reply(
            `💼 *No Wallet Connected*\n\nUse /connect to link your Phantom wallet.`,
            { parse_mode: 'Markdown' }
        );
    }
    
    await ctx.reply(
        `💼 *Your Wallet*\n\n🔗 \`${walletData.address}\``,
        { parse_mode: 'Markdown' }
    );
});

// ============== /CONNECT COMMAND ==============
bot.command('connect', async (ctx) => {
    const telegramId = ctx.from.id;
    
    if (connectedWallets.has(telegramId)) {
        return ctx.reply(`✅ Wallet already connected! Use /wallet to view.`);
    }
    
    const botUsername = (await ctx.telegram.getMe()).username;
    const deepLink = `https://phantom.app/ul/v1/connect?app_url=https://t.me/${botUsername}&dapp_encryption_public_key=${botWallet.publicKey.toBase58()}&cluster=mainnet-beta&redirect_link=https://t.me/${botUsername}?start=connect_${telegramId}`;
    
    pendingConnections.set(telegramId, {
        status: 'waiting_phantom',
        timestamp: Date.now()
    });
    
    await ctx.reply(
        `🔗 *Connect Phantom Wallet*\n\n` +
        `1. Tap the button below\n` +
        `2. Select your wallet\n` +
        `3. Approve connection\n` +
        `4. Return to Telegram\n\n` +
        `⚠️ Need $2 IFC to claim rewards`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.url('🔗 Open Phantom', deepLink)]
            ])
        }
    );
});

// ============== ACTION HANDLERS ==============
bot.action('play_game', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        `🎮 *Launching Game...*`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🚀 PLAY', 'https://infinitecoin-jumper-tgz1.vercel.app')]
            ])
        }
    );
});

bot.action('connect_wallet', async (ctx) => {
    await ctx.answerCbQuery();
    await bot.command('connect', { ...ctx, from: ctx.from });
});

// ============== START BOT ==============
bot.launch();
console.log('🤖 Bot is running!');
console.log('✅ Bot wallet:', botWallet.publicKey.toString());

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
