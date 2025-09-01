const express = require("express");
const cors = require("cors");
const path = require("path");
const pino = require("pino");
const readline = require("readline");
const { RateLimiterMemory } = require("rate-limiter-flexible");
const fetch = require("node-fetch");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys");

const bugs = require("./bugs");
const chalk = require("chalk");

const app = express();
const PORT = process.env.PORT || 3000;
const usePairingCode = true;

const rateLimiter = new RateLimiterMemory({ points: 5, duration: 60 });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "frontend")));

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

let sock = null;

// === WhatsApp client connection baru ===
async function clientStart() {
  const { state, saveCreds } = await useMultiFileAuthState("session");

  const baileyVersion = await (await fetch('https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/src/Defaults/baileys-version.json')).json();

  sock = makeWASocket({
    printQRInTerminal: !usePairingCode,
    syncFullHistory: true,
    markOnlineOnConnect: true,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10000,
    generateHighQualityLinkPreview: true,
    patchMessageBeforeSending: (message) => {
      if (message.buttonsMessage || message.templateMessage || message.listMessage) {
        message = {
          viewOnceMessage: {
            message: {
              messageContextInfo: {
                deviceListMetadataVersion: 2,
                deviceListMetadata: {},
              },
              ...message,
            },
          },
        };
      }
      return message;
    },
    version: baileyVersion.version,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    logger: pino({ level: "fatal" }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino().child({ level: 'silent', stream: 'store' })),
    },
  });

  sock.ev.on("creds.update", saveCreds);

  if (!sock.authState.creds.registered && usePairingCode) {
    const phoneNumber = await question('Please enter your WhatsApp number (start with 62):\n');
    const code = await sock.requestPairingCode(phoneNumber.trim());
    console.log(chalk.blue.bold(`Your pairing code: ${code}`));
  }

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "connecting") return console.log(chalk.yellow("Connecting..."));
    if (connection === "open") return console.log(chalk.green("✅ WhatsApp Bot connected"));

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.message;
      console.log(chalk.red("Connection closed:", reason));

      if (reason !== DisconnectReason.loggedOut) {
        console.log(chalk.yellow("Reconnecting..."));
        setTimeout(clientStart, 3000);
      } else {
        console.log(chalk.red("Logged out. Delete session folder for re-pairing."));
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg) return;
    const from = msg.key.remoteJid;
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
    console.log(`[IN] ${from}: ${text}`);

    if (text.toLowerCase() === "ping") {
      await sock.sendMessage(from, { text: "pong ✅" });
    }
  });

  return sock;
}

// === Safe send wrapper ===
async function safeSendWrapper(req, res) {
  if (!sock) return res.status(500).json({ success: false, error: "Bot belum connect" });

  const { jid, bug, consent } = req.body;
  if (!jid || !bug) return res.status(400).json({ success: false, error: "Missing jid atau bug" });
  if (consent !== true) return res.status(400).json({ success: false, error: "Consent diperlukan" });

  try {
    await rateLimiter.consume(jid);

    let result;
    if (bug === "audioX") result = await bugs.safeAudio(sock, jid, "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3");
    else if (bug === "loopSpam") result = await bugs.safeLoopSpam(sock, jid, 3, 1200);
    else if (bug === "megaCrash") result = await bugs.safeTextBurst(sock, jid, 3);
    else result = await bugs.fallbackText(sock, jid, `Safe run: ${bug}`);

    return res.json({ success: true, data: result });
  } catch (rlRejected) {
    if (rlRejected instanceof Error) return res.status(500).json({ success: false, error: rlRejected.message });
    return res.status(429).json({ success: false, error: "Rate limit tercapai. Tunggu sebentar." });
  }
}

// === Routes ===
app.post("/api/send-bug", safeSendWrapper);
app.get("/api/status", (req, res) => res.json({ connected: !!sock }));

// Start bot & server
clientStart().catch(err => console.error("Gagal connect bot:", err));
app.listen(PORT, () => console.log(`🚀 Server jalan di http://localhost:${PORT}`));
