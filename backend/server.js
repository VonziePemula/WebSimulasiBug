const express = require("express");
const cors = require("cors");
const path = require("path");
const P = require("pino");
const QRCode = require("qrcode");
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

// Safety: rate limiter per target jid
const rateLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "frontend")));

let sock = null;
let lastQR = null;

// 🔗 Fungsi koneksi bot
async function connectBot() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, "auth"));
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    auth: state
  });

  // Kalau belum login → generate pairing code
  try {
    if (!sock?.authState?.creds?.registered) {
      const code = await sock.requestPairingCode("62xxxxxxxxxx"); // Ganti dengan nomor kamu
      console.log("🔑 Pairing Code:", code);
      console.log("➡️ Masukin kode ini di WhatsApp > Perangkat Tertaut > Tautkan Perangkat > Masukkan Kode");
    }
  } catch (e) {
    console.warn("Pairing code mungkin belum tersedia otomatis:", e?.message ?? e);
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      lastQR = qr;
      console.log("⚡ QR code generated. Buka http://localhost:3000/qr untuk scan.");
    }
    if (connection === "open") {
      console.log("✅ WhatsApp connected (bot ready).");
    } else if (connection === "close") {
      const reason = (lastDisconnect?.error?.output?.statusCode) ?? lastDisconnect?.error?.message;
      console.log("Connection closed:", reason);
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        console.log("🔄 Attempt reconnecting...");
        setTimeout(connectBot, 3000);
      } else {
        console.log("❌ Logged out — hapus folder auth untuk pairing ulang.");
      }
    }
  });

  // Listener pesan
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg) return;
    if (msg.key && msg.key.remoteJid && msg.message) {
      const from = msg.key.remoteJid;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
      console.log(`[IN] ${from}: ${text}`);

      // Contoh respon otomatis
      if (text.toLowerCase() === "ping") {
        await sock.sendMessage(from, { text: "pong!" });
      }
    }
  });
}

// Endpoint kirim bug
async function safeSendWrapper(req, res) {
  if (!sock) return res.status(500).json({ success: false, error: "Bot not connected yet" });

  const { jid, bug } = req.body;
  if (!jid || !bug) return res.status(400).json({ success: false, error: "Missing jid or bug" });

  const consent = req.body.consent === true;
  if (!consent) {
    return res.status(400).json({ success: false, error: "Recipient consent required (safety)" });
  }

  try {
    await rateLimiter.consume(jid);
    let result;

    if (bug === "audioX") {
      result = await bugs.safeAudio(sock, jid, "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3");
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
      return res.status(429).json({ success: false, error: "Rate limit exceeded. Try later." });
    }
  }
}

app.post("/api/send-bug", safeSendWrapper);

// Endpoint status bot
app.get("/api/status", (req, res) => {
  return res.json({ connected: !!sock });
});

// Endpoint QR code untuk browser
app.get("/qr", async (req, res) => {
  if (!lastQR) return res.send("❌ QR belum tersedia. Tunggu bot generate QR.");
  try {
    const qrImage = await QRCode.toDataURL(lastQR);
    res.send(`<html><body><h2>Scan QR WhatsApp</h2><img src="${qrImage}" /></body></html>`);
  } catch (err) {
    res.status(500).send("Gagal generate QR: " + err.message);
  }
});

connectBot().catch(err => console.error("Failed to connect bot:", err));

app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
