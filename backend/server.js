// backend/server.js
const express = require("express");
const cors = require("cors");
const path = require("path");
const P = require("pino");
const { RateLimiterMemory } = require("rate-limiter-flexible");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const bugs = require("./bugs");

const app = express();
const PORT = process.env.PORT || 3000;

// safety: rate limiter per target jid (prevent abuse)
const rateLimiter = new RateLimiterMemory({
  points: 5, // 5 actions
  duration: 60 // per 60 seconds
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "frontend")));

let sock = null;

async function connectBot() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, "auth"));
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    auth: state
  });

  // If not registered -> request pairing code (safe flow)
  try {
    // When sock.authState isn't registered yet, Baileys will require pairing.
    // We attempt to request pairing code for the owner number if desired.
    // NOTE: requestPairingCode is async and may or may not be available depending on Baileys version.
    if (!sock?.authState?.creds?.registered) {
      // For safety, do NOT auto supply a phone number here.
      console.log("Bot not yet registered. Use 'requestPairingCode' via terminal or UI.");
      // If you want to programmatically get pairing code, call:
      // const code = await sock.requestPairingCode("62..."); console.log(code);
    }
  } catch (e) {
    console.warn("Pairing code may not be available automatically:", e?.message ?? e);
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log("QR / pairing token generated. Scan or pair with your device.");
    }
    if (connection === "open") {
      console.log("✅ WhatsApp connected (bot ready).");
    } else if (connection === "close") {
      const reason = (lastDisconnect?.error?.output?.statusCode) ?? lastDisconnect?.error?.message;
      console.log("Connection closed:", reason);
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        console.log("Attempt reconnecting...");
        setTimeout(connectBot, 3000);
      } else {
        console.log("Logged out — delete auth folder to re-pair manually.");
      }
    }
  });

  // messages listener (simple)
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg) return;
    if (msg.key && msg.key.remoteJid && msg.message) {
      const from = msg.key.remoteJid;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
      console.log(`[IN] ${from}: ${text}`);
    }
  });
}

// safe wrapper for sending bug (checks rate limit)
async function safeSendWrapper(req, res) {
  if (!sock) return res.status(500).json({ success: false, error: "Bot not connected yet" });

  const { jid, bug } = req.body;
  if (!jid || !bug) return res.status(400).json({ success: false, error: "Missing jid or bug" });

  // require explicit consent flag for real targets (prevent misuse)
  // frontend must include consent: true to proceed
  const consent = req.body.consent === true;
  if (!consent) {
    return res.status(400).json({ success: false, error: "Recipient consent required (safety)" });
  }

  try {
    // consume 1 point per call for that jid
    await rateLimiter.consume(jid);

    // dispatch safe implementations
    let result;
    if (bug === "audioX") {
      // safe audio demo url (small sample)
      result = await bugs.safeAudio(sock, jid, "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3");
    } else if (bug === "loopSpam") {
      result = await bugs.safeLoopSpam(sock, jid, 3, 1200);
    } else if (bug === "megaCrash") {
      // map to safe text burst (no exploit)
      result = await bugs.safeTextBurst(sock, jid, 3);
    } else {
      result = await bugs.fallbackText(sock, jid, `Safe run: ${bug}`);
    }

    return res.json({ success: true, data: result });
  } catch (rlRejected) {
    if (rlRejected instanceof Error) {
      // rate limiter internal error
      return res.status(500).json({ success: false, error: rlRejected.message });
    } else {
      // rate limit exceeded
      return res.status(429).json({ success: false, error: "Rate limit exceeded. Try later." });
    }
  }
}

app.post("/api/send-bug", safeSendWrapper);

// endpoint to check bot status
app.get("/api/status", (req, res) => {
  return res.json({ connected: !!sock });
});

connectBot().catch(err => console.error("Failed to connect bot:", err));

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
