const { Telegraf, Markup } = require('telegraf');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const axios = require('axios');
const bs58 = require('bs58');
const express = require('express');

// ============== EXPRESS SERVER FOR RENDER ==============
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Infinitecoin Jumper Bot is running!');
});

app.listen(port, () => {
    console.log(`✅ Server listening on port ${port}`);
});

// ============== TELEGRAM BOT CONFIGURATION ==============
const BOT_TOKEN = '8695754535:AAF3WjpAdQmmRWXqubN6oSidYYGmQEdr_ek';
const PROGRAM_ID = new PublicKey('YourEscrowProgramID');
const TOKEN_MINT = new PublicKey('C8KsvkMBuqmvX416MWTJGKW9S9MpKiUjmpnj1fhzpump');
const RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';

// Initialize Solana connection
const connection = new Connection(RPC_ENDPOINT);

// Your bot wallet private key
const privateKeyBytes = bs58.decode('2CqHu3hM53aSoBHT2ABpWcUsMHM1hZfLLnuVv2saQiXjuZMrMM45irEiBYsopCU8J9jdaorjthNAyEGamHMXnJ8R');
const botWallet = Keypair.fromSecretKey(privateKeyBytes);

// Store user data
const connectedWallets = new Map();
const pendingConnections = new Map();

const bot = new Telegraf(BOT_TOKEN);

// ============== WELCOME MESSAGE (/start) ==============
bot.start(async (ctx) => {
    const userName = ctx.from.first_name || 'Player';
    const welcomeText = `
🎮 *Welcome to Infinitecoin Jumper, ${userName}!* 🚀

Jump, dodge, and collect Infinite Coins (IFC) in this thrilling Telegram P2E game! The higher you jump, the more you earn.

✨ *What makes us special:*
• 🕹️ *Free to Play* - Start jumping immediately
• 💰 *Earn Real IFC* - Collect coins convert to real tokens
• 🔒 *Secure Escrow* - Rewards held safely until you claim
• ⚡ *Instant Claims* - Withdraw to your wallet anytime

📋 *Available Commands:*

🎮 */play* - Launch the game and start jumping!
🔗 */connect* - Link your Phantom wallet to earn
💼 */wallet* - Check your wallet & IFC balance
❓ */help* - Game guide, tips, and requirements

⚠️ *Important:* You need at least *$2 worth of IFC* in your connected wallet to claim rewards.

Ready to jump into the infinite? Click /play to start! 🚀
`;

    await ctx.reply(welcomeText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🎮 Play Now', 'play_game')],
            [Markup.button.callback('🔗 Connect Wallet', 'connect_wallet')],
            [Markup.button.callback('❓ How to Play', 'show_help')]
        ])
    });
});

// ============== /HELP COMMAND ==============
bot.command('help', async (ctx) => {
    const helpText = `
📚 *Infinitecoin Jumper - Complete Guide*

🎮 *How to Play:*
• Tap */play* or click the button below to launch
• Your character jumps automatically - tap to double jump
• Collect floating 🪙 Infinite Coins for points
• Avoid red 🔺 spikes and viruses - they end your run!
• The higher you climb, the faster it gets

💰 *Earning IFC:*
• Each coin collected = IFC tokens earned
• Rewards based on coins collected and height reached

🔐 *Claiming Your Rewards:*
1. Connect your Phantom wallet using */connect*
2. Play and accumulate IFC in escrow
3. Click "Claim Rewards" when ready
4. Tokens sent directly to your wallet!

⚠️ *Requirements:*
You must hold at least *$2 USD worth of IFC* in your connected wallet to claim rewards.

💡 *Don't have IFC yet?*
Buy on [Jupiter](https://jup.ag/swap/SOL-C8KsvkMBuqmvX416MWTJGKW9S9MpKiUjmpnj1fhzpump)

🆘 *Need Support?*
Contact @YourSupportUsername for assistance
`;

    await ctx.reply(helpText, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🎮 Start Playing', 'play_game')],
            [Markup.button.callback('🔗 Connect Wallet', 'connect_wallet')]
        ])
    });
});

// ============== /PLAY COMMAND ==============
bot.command('play', async (ctx) => {
    const telegramId = ctx.from.id;
    const hasWallet = connectedWallets.has(telegramId);
    
    const playText = hasWallet 
        ? `🎮 *Ready to Jump, ${ctx.from.first_name}?*\n\nYour wallet is connected and ready to earn IFC! Collect as many coins as you can and avoid those spikes!`
        : `🎮 *Ready to Jump, ${ctx.from.first_name}?*\n\n⚠️ *Heads up:* You're playing in guest mode. Connect your wallet with */connect* to earn real IFC tokens!`;

    await ctx.reply(playText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.webApp('🚀 Launch Infinite Jumper', 'https://infinitecoin-jumper-tgz1.vercel.app')],
            ...(hasWallet ? [] : [[Markup.button.callback('🔗 Connect to Earn', 'connect_wallet')]])
        ])
    });
});

// ============== /WALLET COMMAND ==============
bot.command('wallet', async (ctx) => {
    const telegramId = ctx.from.id;
    const walletData = connectedWallets.get(telegramId);
    
    if (!walletData) {
        return ctx.reply(
            `💼 *Wallet Not Connected*\n\n` +
            `You haven't connected a Phantom wallet yet.\n\n` +
            `Use */connect* to get started!`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔗 Connect Wallet', 'connect_wallet')]
                ])
            }
        );
    }
    
    const loadingMsg = await ctx.reply('⏳ Fetching your wallet data...');
    
    try {
        const balance = await fetchWalletBalance(walletData.address);
        const usdValue = await calculateUsdValue(balance);
        const canClaim = usdValue >= 2;
        
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        
        const walletText = `
💼 *Your Infinitecoin Wallet*

🔗 *Address:* \`${walletData.address}\`

💰 *IFC Balance:* ${formatNumber(balance)} IFC
💵 *Value:* $${usdValue.toFixed(2)} USD

🔓 *Claim Status:* ${canClaim ? '✅ Eligible' : '❌ Locked'}

${!canClaim ? `\n⚠️ *Need $${(2 - usdValue).toFixed(2)} more to unlock claims*\nHold at least $2 worth of IFC to withdraw your rewards.` : ''}
`;

        const buttons = [];
        if (canClaim) {
            buttons.push([Markup.button.callback('🎁 Claim Rewards', 'claim_rewards')]);
        } else {
            buttons.push([Markup.button.url('🛒 Buy IFC', 'https://jup.ag/swap/SOL-C8KsvkMBuqmvX416MWTJGKW9S9MpKiUjmpnj1fhzpump')]);
        }
        buttons.push(
            [Markup.button.callback('🔄 Refresh', 'refresh_wallet')],
            [Markup.button.callback('🔗 Change Wallet', 'change_wallet')]
        );
        
        await ctx.reply(walletText, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
        
    } catch (error) {
        console.error('Wallet fetch error:', error);
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        await ctx.reply('❌ Error fetching wallet data. Please try again later.');
    }
});

// ============== /CONNECT COMMAND ==============
bot.command('connect', async (ctx) => {
    const telegramId = ctx.from.id;
    
    if (connectedWallets.has(telegramId)) {
        const wallet = connectedWallets.get(telegramId);
        return ctx.reply(
            `✅ *Wallet Already Connected*\n\n🔗 Address: \`${wallet.address}\``,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('💼 View Wallet', 'show_wallet')],
                    [Markup.button.callback('🎮 Play Game', 'play_game')],
                    [Markup.button.callback('🔗 Use Different Wallet', 'change_wallet')]
                ])
            }
        );
    }
    
    const botUsername = (await ctx.telegram.getMe()).username;
    const deepLink = `https://phantom.app/ul/v1/connect?app_url=https://t.me/${botUsername}&dapp_encryption_public_key=${botWallet.publicKey.toBase58()}&cluster=mainnet-beta&redirect_link=https://t.me/${botUsername}?start=connect_${telegramId}`;
    
    pendingConnections.set(telegramId, {
        status: 'waiting_phantom',
        timestamp: Date.now()
    });
    
    await ctx.reply(
        `🔗 *Connect Your Phantom Wallet*\n\n` +
        `To earn and claim IFC rewards, you need to connect your Solana wallet.\n\n` +
        `📱 *How to connect:*\n` +
        `1. Tap the button below to open Phantom\n` +
        `2. Select your wallet in Phantom\n` +
        `3. Approve the connection\n` +
        `4. Return to Telegram\n\n` +
        `⚠️ *Never share your private key!* We only need your public address.`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.url('🔗 Open Phantom Wallet', deepLink)],
                [Markup.button.callback('❓ I don\'t have Phantom', 'no_phantom_help')]
            ])
        }
    );
});

// ============== ACTION HANDLERS ==============
bot.action('play_game', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        `🎮 *Launching Infinitecoin Jumper...*\n\nTap the button below to start playing!`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🚀 Launch Game', 'https://infinitecoin-jumper-tgz1.vercel.app')]
            ])
        }
    );
});

bot.action('connect_wallet', async (ctx) => {
    await ctx.answerCbQuery();
    await bot.command('connect', { ...ctx, from: ctx.from });
});

bot.action('show_wallet', async (ctx) => {
    await ctx.answerCbQuery();
    await bot.command('wallet', { ...ctx, from: ctx.from });
});

bot.action('show_help', async (ctx) => {
    await ctx.answerCbQuery();
    await bot.command('help', { ...ctx, from: ctx.from });
});

bot.action('refresh_wallet', async (ctx) => {
    await ctx.answerCbQuery('Refreshing...');
    await bot.command('wallet', { ...ctx, from: ctx.from });
});

bot.action('change_wallet', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    connectedWallets.delete(telegramId);
    await ctx.reply(
        `🔄 *Wallet Disconnected*\n\nUse */connect* to link a new wallet.`
    );
});

bot.action('claim_rewards', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        `🎁 *Claim Your Rewards*\n\n` +
        `Your IFC rewards are being processed.\n\n` +
        `⚠️ *Note:* You need at least $2 worth of IFC in your wallet to claim.\n\n` +
        `This feature will be fully enabled after the escrow smart contract is deployed.`
    );
});

bot.action('no_phantom_help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        `📱 *Getting Started with Phantom*\n\n` +
        `Phantom is the most popular Solana wallet.\n\n` +
        `1️⃣ *Download Phantom:*\n` +
        `• iOS: App Store → Search "Phantom"\n` +
        `• Android: Play Store → Search "Phantom"\n` +
        `• Desktop: phantom.app/download\n\n` +
        `2️⃣ *Create Wallet:*\n` +
        `• Open Phantom app\n` +
        `• Tap "Create New Wallet"\n` +
        `• Save your recovery phrase securely!\n\n` +
        `3️⃣ *Add Solana:*\n` +
        `• Buy SOL from an exchange\n` +
        `• Transfer SOL to your Phantom address\n\n` +
        `4️⃣ *Connect to Game:*\n` +
        `• Return here and tap */connect*`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.url('📲 Download Phantom', 'https://phantom.app/download')],
                [Markup.button.callback('🔗 Try Connecting Again', 'connect_wallet')]
            ])
        }
    );
});

// ============== HELPER FUNCTIONS ==============
async function fetchWalletBalance(address) {
    try {
        const tokenAccount = await getAssociatedTokenAddress(
            TOKEN_MINT,
            new PublicKey(address)
        );
        const account = await getAccount(connection, tokenAccount);
        return Number(account.amount);
    } catch (error) {
        return 0;
    }
}

async function calculateUsdValue(ifcBalance) {
    try {
        const pricePerToken = 0.000001;
        return (ifcBalance * pricePerToken);
    } catch (error) {
        return 0;
    }
}

function formatNumber(num) {
    return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2,
        notation: num > 1000000 ? 'compact' : 'standard'
    }).format(num);
}

// ============== START BOT ==============
bot.launch();
console.log('🤖 Infinitecoin Jumper Bot is running!');
console.log('✅ Bot wallet public key:', botWallet.publicKey.toString());

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
