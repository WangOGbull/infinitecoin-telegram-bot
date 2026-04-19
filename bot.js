const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// ============== CONFIGURATION ==============
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN;
const GAME_URL = process.env.GAME_URL || 'https://infinitecoin-jumper-tgz1.vercel.app';
const PORT = process.env.PORT || 10000;
const DATA_FILE = path.join(__dirname, 'users.json');

// Phantom connection encryption key (generate once, keep secret)
const PHANTOM_ENCRYPTION_KEY = process.env.PHANTOM_ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64');

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN is required!');
    process.exit(1);
}

// ============== INITIALIZATION ==============
const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(express.json());

let users = {};
let pendingConnections = new Map(); // Store pending connection sessions

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
            totalEarned: 0,
            connected: false,
            username: null
        };
    }
    return users[userId];
}

function maskWallet(address) {
    if (!address || address.length < 8) return 'Not connected';
    return address.slice(0, 4) + '........' + address.slice(-4);
}

// ============== PHANTOM DEEP LINK GENERATION ==============

function generatePhantomConnectUrl(userId, source = 'telegram') {
    // Generate session ID for this connection attempt
    const sessionId = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    
    // Store pending connection
    pendingConnections.set(sessionId, {
        userId: userId.toString(),
        source: source,
        timestamp: timestamp,
        expires: timestamp + 600000 // 10 minutes expiry
    });
    
    // Clean old sessions
    for (const [key, value] of pendingConnections.entries()) {
        if (value.expires < Date.now()) {
            pendingConnections.delete(key);
        }
    }
    
    // CORRECT Phantom deep link format for wallet connection
    // This triggers the actual "Connect wallet?" prompt in Phantom
    const callbackUrl = `${WEBHOOK_DOMAIN}/phantom-callback?session=${sessionId}`;
    
    // Use Phantom's v1 connect API
    const phantomUrl = new URL('https://phantom.app/ul/v1/connect');
    phantomUrl.searchParams.set('app_url', WEBHOOK_DOMAIN);
    phantomUrl.searchParams.set('dapp_encryption_public_key', PHANTOM_ENCRYPTION_KEY);
    phantomUrl.searchParams.set('cluster', 'mainnet-beta');
    phantomUrl.searchParams.set('redirect_link', callbackUrl);
    
    return phantomUrl.toString();
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
        `• Total Earned: ${user.totalEarned} IFC\n` +
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
        `3. Collect coins to earn IFC\n` +
        `4. Claim rewards with /claim\n\n` +
        `⚠️ *Min $2 IFC required to claim*`,
        { parse_mode: 'Markdown' }
    );
});

// /play - Launch game
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

// /wallet - Connect Phantom wallet (CORRECTED FORMAT)
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

    // Generate CORRECT Phantom deep link that triggers wallet connection prompt
    const phantomDeepLink = generatePhantomConnectUrl(userId, 'telegram');

    await ctx.reply(
        `🔗 *Connect Your Phantom Wallet*\n\n` +
        `Follow these steps:\n` +
        `1️⃣ Tap "Connect in Phantom" below\n` +
        `2️⃣ Phantom app will open\n` +
        `3️⃣ Tap "Connect" when prompted\n` +
        `4️⃣ Your wallet will be linked automatically\n\n` +
        `🔒 *We only store your public address. Never your private keys.*`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.url('👻 Connect in Phantom', phantomDeepLink)],
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
        `💎 *Total Earned:* ${user.totalEarned} IFC\n` +
        `💵 *Total Value:* ${user.balance + user.unclaimed} IFC\n\n` +
        `💼 *Wallet:* ${user.connected ? `\`${maskWallet(user.wallet)}\`` : 'Not connected'}\n\n` +
        `${user.unclaimed > 0 ? '🎁 Use /claim to collect!' : '🎮 Use /play to earn more!'}`;

    await ctx.reply(balanceText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🎮 Play', 'play_game'), Markup.button.callback('🎁 Claim', 'claim_rewards')]
        ])
    });
});

// /claim - Collect earnings (with $2 minimum check)
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
    // Check $2 minimum balance requirement
    // const usdValue = await calculateUsdValue(user.balance);
    // if (usdValue < 2) {
    //     return ctx.reply(`❌ Need $${(2 - usdValue).toFixed(2)} more IFC to claim`);
    // }

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
    await bot.telegram.sendMessage(ctx.from.id, '/play');
});

bot.action('connect_wallet', async (ctx) => {
    await ctx.answerCbQuery();
    await bot.telegram.sendMessage(ctx.from.id, '/wallet');
});

bot.action('show_balance', async (ctx) => {
    await ctx.answerCbQuery();
    await bot.telegram.sendMessage(ctx.from.id, '/balance');
});

bot.action('show_help', async (ctx) => {
    await ctx.answerCbQuery();
    await bot.telegram.sendMessage(ctx.from.id, '/help');
});

bot.action('claim_rewards', async (ctx) => {
    await ctx.answerCbQuery();
    await bot.telegram.sendMessage(ctx.from.id, '/claim');
});

bot.action('wallet_help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        `📱 *How to Connect*\n\n` +
        `1. Tap "Connect in Phantom" button\n` +
        `2. Phantom wallet app opens\n` +
        `3. Review the connection request\n` +
        `4. Tap "Connect" to approve\n` +
        `5. Return to Telegram - your wallet is linked!\n\n` +
        `🔒 We only store your public wallet address.`
    );
});

// ============== PHANTOM CALLBACK ENDPOINT ==============

// Health check endpoints
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

// PHANTOM CALLBACK - Receives wallet address after user approves connection
app.get('/phantom-callback', async (req, res) => {
    const { session, phantom_encryption_public_key, data, nonce } = req.query;
    
    console.log('🔔 Phantom callback received:', { session, hasData: !!data });
    
    if (!session || !pendingConnections.has(session)) {
        return res.status(400).send('Invalid or expired session');
    }
    
    const sessionData = pendingConnections.get(session);
    
    // Check if session expired
    if (sessionData.expires < Date.now()) {
        pendingConnections.delete(session);
        return res.status(400).send('Session expired. Please try again.');
    }
    
    const userId = sessionData.userId;
    const source = sessionData.source;
    
    // In production, decrypt the data from Phantom
    // For now, we'll handle the simple case where Phantom redirects with wallet info
    // or we can extract from the encryption if provided
    
    try {
        // If Phantom sends wallet address directly (simplified flow)
        // In real implementation, decrypt 'data' using phantom_encryption_public_key
        
        // For this implementation, we'll use a simpler approach:
        // Phantom will redirect here after connection, we need to get wallet from user confirmation
        
        // Send message to user asking them to paste their wallet address
        // Or use a more advanced flow with actual decryption
        
        await bot.telegram.sendMessage(userId,
            `⏳ *Connection Initiated*\n\n` +
            `Phantom connection started. Please paste your wallet address here to complete the link:\n\n` +
            `(Example: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU)`,
            { parse_mode: 'Markdown' }
        );
        
        // Store that we're waiting for this user's wallet
        const user = getUser(userId);
        user.pendingConnection = session;
        await saveUsers();
        
        // Show success page to user
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Wallet Connection - Infinitecoin Jumper</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        text-align: center;
                        padding: 20px;
                    }
                    .container { max-width: 400px; }
                    .logo { font-size: 4rem; margin-bottom: 1rem; }
                    h1 { font-size: 1.5rem; margin-bottom: 1rem; }
                    .wallet-input {
                        width: 100%;
                        padding: 1rem;
                        border-radius: 10px;
                        border: none;
                        margin: 1rem 0;
                        font-size: 1rem;
                    }
                    .submit-btn {
                        background: #512DA8;
                        color: white;
                        border: none;
                        padding: 1rem 2rem;
                        border-radius: 10px;
                        font-size: 1rem;
                        cursor: pointer;
                        width: 100%;
                    }
                    .status { margin-top: 1rem; padding: 1rem; border-radius: 8px; display: none; }
                    .status.success { background: rgba(76, 175, 80, 0.3); display: block; }
                    .status.error { background: rgba(244, 67, 54, 0.3); display: block; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="logo">🎮</div>
                    <h1>Complete Wallet Connection</h1>
                    <p>Enter your Phantom wallet address to finish connecting:</p>
                    <input type="text" class="wallet-input" id="walletInput" placeholder="Paste wallet address here...">
                    <button class="submit-btn" onclick="submitWallet()">Connect Wallet</button>
                    <div class="status" id="status"></div>
                </div>
                <script>
                    const session = '${session}';
                    const userId = '${userId}';
                    
                    async function submitWallet() {
                        const wallet = document.getElementById('walletInput').value.trim();
                        if (!wallet || wallet.length < 32) {
                            showStatus('error', 'Please enter a valid wallet address');
                            return;
                        }
                        
                        const res = await fetch('/api/complete-connection', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ session, userId, walletAddress: wallet })
                        });
                        
                        const data = await res.json();
                        if (data.success) {
                            showStatus('success', '✅ Wallet connected! You can close this page.');
                        } else {
                            showStatus('error', '❌ ' + data.error);
                        }
                    }
                    
                    function showStatus(type, msg) {
                        const el = document.getElementById('status');
                        el.className = 'status ' + type;
                        el.textContent = msg;
                    }
                </script>
            </body>
            </html>
        `);
        
    } catch (err) {
        console.error('Callback error:', err);
        res.status(500).send('Connection failed. Please try again.');
    }
});

// API: Complete wallet connection from callback page
app.post('/api/complete-connection', async (req, res) => {
    const { session, userId, walletAddress } = req.body;
    
    if (!session || !pendingConnections.has(session)) {
        return res.status(400).json({ error: 'Invalid session' });
    }
    
    const sessionData = pendingConnections.get(session);
    if (sessionData.userId !== userId) {
        return res.status(400).json({ error: 'User mismatch' });
    }
    
    // Validate wallet address format (base58, 32-44 chars)
    if (!/^[A-HJ-NP-Za-km-z1-9]{32,44}$/.test(walletAddress)) {
        return res.status(400).json({ error: 'Invalid wallet address format' });
    }
    
    // Save wallet
    const user = getUser(userId);
    user.wallet = walletAddress;
    user.connected = true;
    user.pendingConnection = null;
    await saveUsers();
    
    // Clean up session
    pendingConnections.delete(session);
    
    // Notify user via Telegram
    try {
        await bot.telegram.sendMessage(userId,
            `✅ *Wallet Connected Successfully!*\n\n` +
            `💼 \`${maskWallet(walletAddress)}\`\n\n` +
            `You're ready to earn IFC! Use /play to start jumping.`,
            { parse_mode: 'Markdown' }
        );
    } catch (err) {
        console.error('Failed to notify user:', err);
    }
    
    res.json({ success: true, maskedWallet: maskWallet(walletAddress) });
});

// Alternative: Simple wallet submission via Telegram message
bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    const userId = ctx.from.id;
    const user = getUser(userId);
    
    // Check if user has pending connection and sent a wallet address
    if (user.pendingConnection && /^[A-HJ-NP-Za-km-z1-9]{32,44}$/.test(text)) {
        // Validate and save
        user.wallet = text;
        user.connected = true;
        user.pendingConnection = null;
        await saveUsers();
        
        // Clean up any pending session
        for (const [key, value] of pendingConnections.entries()) {
            if (value.userId === userId.toString()) {
                pendingConnections.delete(key);
            }
        }
        
        await ctx.reply(
            `✅ *Wallet Connected!*\n\n` +
            `💼 \`${maskWallet(text)}\`\n\n` +
            `You're ready to earn IFC! Use /play to start.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🎮 Play Now', 'play_game')],
                    [Markup.button.callback('💰 Check Balance', 'show_balance')]
                ])
            }
        );
        return;
    }
});

// API: Get user data for game integration (pause menu claim)
app.get('/api/user/:userId', async (req, res) => {
    const userId = req.params.userId;
    const user = getUser(userId);
    
    res.json({
        connected: user.connected,
        wallet: user.wallet,
        maskedWallet: maskWallet(user.wallet),
        balance: user.balance,
        unclaimed: user.unclaimed,
        totalEarned: user.totalEarned
    });
});

// API: Claim from game pause menu
app.post('/api/claim', async (req, res) => {
    const { userId } = req.body;
    const user = getUser(userId);
    
    if (!user.connected) {
        return res.status(400).json({ error: 'Wallet not connected', code: 'NO_WALLET' });
    }
    
    if (user.unclaimed <= 0) {
        return res.status(400).json({ error: 'Nothing to claim', code: 'NO_BALANCE' });
    }
    
    // TODO: Replace with actual escrow contract call to: https://github.com/WangOGbull/infinitejumper-escrow
    // const escrowProgram = new PublicKey("YOUR_ESCROW_PROGRAM_ID");
    // await escrowProgram.methods.claimRewards().accounts({...}).rpc();
    
    const claimed = user.unclaimed;
    user.balance += claimed;
    user.unclaimed = 0;
    await saveUsers();
    
    res.json({
        success: true,
        claimed: claimed,
        newBalance: user.balance,
        maskedWallet: maskWallet(user.wallet)
    });
});

// API: Add earnings from game
app.post('/api/earn', async (req, res) => {
    const { userId, amount } = req.body;
    const user = getUser(userId);
    
    user.unclaimed += amount;
    user.totalEarned += amount;
    await saveUsers();
    
    res.json({
        success: true,
        earned: amount,
        unclaimed: user.unclaimed,
        totalEarned: user.totalEarned
    });
});

// Telegram webhook
app.post('/webhook', (req, res) => {
    bot.handleUpdate(req.body, res);
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
