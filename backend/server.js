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

// rate limiter per target jid (anti spam / abuse)
const rateLimiter = new RateLimiterMemory({
  points: 5, // max 5 aksi
  duration: 60 // per 60 detik
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
    auth: state,
    browser: ["VonzieBot", "Chrome", "1.0.0"]
  });

  // creds
  sock.ev.on("creds.update", saveCreds);

  // connection listener
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("⚡ QR Code muncul, scan di WhatsApp untuk login.");
    }

    if (connection === "open") {
      console.log("✅ WhatsApp Bot berhasil terhubung!");
    } else if (connection === "close") {
      const reason =
        lastDisconnect?.error?.output?.statusCode ||
        lastDisconnect?.error?.message ||
        "Unknown";

      console.log("❌ Koneksi terputus:", reason);

      if (reason !== DisconnectReason.loggedOut) {
        console.log("🔄 Mencoba reconnect...");
        setTimeout(connectBot, 3000);
      } else {
        console.log("⚠️ Logged out. Hapus folder auth untuk pairing ulang.");
      }
    }
  });

  // kalau belum register, generate pairing code
  try {
    if (!sock?.authState?.creds?.registered && sock.requestPairingCode) {
      const phoneNumber = process.env.OWNER_NUMBER || null; // isi manual / via env
      if (phoneNumber) {
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`🔑 Pairing Code untuk ${phoneNumber}: ${code}`);
      } else {
        console.log("❗ Bot belum terdaftar. Jalankan dengan nomor owner (env OWNER_NUMBER).");
      }
    }
  } catch (e) {
    console.warn("Pairing code gagal dibuat:", e?.message ?? e);
  }

  // pesan masuk
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg) return;

    const from = msg.key.remoteJid;
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      "";

    console.log(`[IN] ${from}: ${text}`);

    if (text.toLowerCase() === "ping") {
      await sock.sendMessage(from, { text: "pong ✅" });
    }
  });
}

// wrapper kirim bug
async function safeSendWrapper(req, res) {
  if (!sock) return res.status(500).json({ success: false, error: "Bot belum connect" });

  const { jid, bug, consent } = req.body;
  if (!jid || !bug) return res.status(400).json({ success: false, error: "Missing jid atau bug" });

  if (consent !== true) {
    return res.status(400).json({ success: false, error: "Consent diperlukan (safety)" });
  }

  try {
    await rateLimiter.consume(jid);

    let result;
    if (bug === "audioX") {
      result = await bugs.safeAudio(
        sock,
        jid,
        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
      );
    } else if (bug === "loopSpam") {
      result = await bugs.safeLoopSpam(sock, jid, 3, 1200);
    } else if (bug === "megaCrash") {
      result = await bugs.safeTextBurst(sock, jid, 3);
    } else {
      result = await bugs.fallbackText(sock, jid, `Safe run: ${bug}`);
    }

    return res.json({ success: true, data: result });
  } catch (rlRejected) {
    if (rlRejected instanceof Error) {
      return res.status(500).json({ success: false, error: rlRejected.message });
    } else {
      return res.status(429).json({ success: false, error: "Rate limit tercapai. Tunggu sebentar." });
    }
  }
}

// API
app.post("/api/send-bug", safeSendWrapper);

app.get("/api/status", (req, res) => {
  return res.json({ connected: !!sock });
});

// start bot
connectBot().catch((err) => console.error("Gagal connect bot:", err));

app.listen(PORT, () => console.log(`🚀 Server jalan di http://localhost:${PORT}`));
