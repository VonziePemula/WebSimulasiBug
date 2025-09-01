const express = require("express");
const cors = require("cors");
const path = require("path");
const P = require("pino");
const readline = require("readline");
const { RateLimiterMemory } = require("rate-limiter-flexible");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const bugs = require("./bugs");

const app = express();

const rateLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "frontend")));

let sock = null;

// helper untuk input terminal
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve =>
    rl.question(query, ans => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

async function connectBot() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, "auth"));
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    printQRInTerminal: true, // fallback QR kalau pairing code gagal
    auth: state,
    browser: ["VonzieBot", "Chrome", "1.0.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

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

  // pairing code otomatis
  try {
    if (!sock?.authState?.creds?.registered && sock.requestPairingCode) {
      let phoneNumber = process.env.OWNER_NUMBER;

      if (!phoneNumber) {
        phoneNumber = await askQuestion("Masukkan nomor WhatsApp (contoh 628xxxx): ");
      }

      if (phoneNumber) {
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`🔑 Pairing Code untuk ${phoneNumber}: ${code}`);
        console.log("👉 Buka WhatsApp > Linked Devices > Pair with code, lalu masukin kode di atas.");
      } else {
        console.log("❗ Nomor tidak valid. Restart dan coba lagi.");
      }
    }
  } catch (e) {
    console.warn("⚠️ Pairing code gagal dibuat:", e?.message ?? e);
  }

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

app.post("/api/send-bug", safeSendWrapper);

app.get("/api/status", (req, res) => {
  return res.json({ connected: !!sock });
});

connectBot().catch((err) => console.error("Gagal connect bot:", err));

app.listen(PORT, () => console.log(`🚀 Server jalan di https://web-simulasi-bug.vercel.app`));
