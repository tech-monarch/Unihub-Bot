require('dotenv').config()
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const P = require('pino')

// ======= Data =======
const serviceSynonyms = {
  "Academic Support": ["tutoring", "homework", "assignment", "study help"],
  "Digital Services": ["printing", "design", "video editing"],
  "Home Services": ["cleaning", "laundry", "cooking", "hair"],
  "Farming Services": ["farming", "gardening"]
}
const housingCategories = ["Hostel", "Lodge", "Apartment", "Squat"]
const campusLocations = ["Abuja Campus", "Delta Campus", "Choba Campus", "Alakiah", "Choba", "Ozuoba", "Aluu"]

const intentMap = {
  info: ["information", "info", "events", "academic", "support"],
  services: ["service", "order", "hire", "clean", "laundry", "hair", "farming"],
  housing: ["house", "apartment", "hostel", "lodge", "rent"]
}

// ======= Helpers =======
function detectIntent(text) {
  text = text.toLowerCase()
  for (const [intent, keywords] of Object.entries(intentMap)) {
    if (keywords.some(word => text.includes(word))) return intent
  }
  return null
}
function detectService(text) {
  text = text.toLowerCase()
  for (const category in serviceSynonyms) {
    if ([category.toLowerCase(), ...(serviceSynonyms[category] || [])].some(word => text.includes(word))) {
      return category
    }
  }
  return null
}
function detectHousingCategory(text) {
  return housingCategories.find(cat => text.toLowerCase().includes(cat.toLowerCase())) || null
}
function detectLocation(text) {
  return campusLocations.find(loc => text.toLowerCase().includes(loc.toLowerCase())) || null
}

// ======= Bot =======
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./session')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' })
  })

  let userSessions = {}

  sock.ev.on('connection.update', ({ connection }) => {
    if (connection === 'open') console.log("✅ UniHub Bot Connected!")
  })
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('messages.upsert', async m => {
    const msg = m.messages[0]
    if (!msg.message || msg.key.fromMe) return

    const sender = msg.key.remoteJid
    const textRaw = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim()
    if (!textRaw) return

    if (!userSessions[sender]) userSessions[sender] = { step: "menu", data: {} }
    const session = userSessions[sender]

    // === Smart Detection ===
    const intent = detectIntent(textRaw)
    const service = detectService(textRaw)
    const housing = detectHousingCategory(textRaw)
    const location = detectLocation(textRaw)

    // Fill detected info into session
    if (intent) session.data.intent = intent
    if (service) session.data.service = service
    if (housing) session.data.housing = housing
    if (location) session.data.location = location

    // === If everything is detected, skip menus ===
    if ((service || housing) && location) {
      await sock.sendMessage(sender, {
        text: `I understood your request as:\n\nIntent: ${session.data.intent || "unknown"}\nService/Housing: ${service || housing}\nLocation: ${location}\n\nConfirm?`,
        buttons: [
          { buttonId: "yes", buttonText: { displayText: "✅ Yes" }, type: 1 },
          { buttonId: "no", buttonText: { displayText: "❌ No" }, type: 1 }
        ]
      })
      session.step = "confirm"
      return
    }

    // === Ask only for missing info ===
    if (!session.data.intent) {
      session.step = "menu"
      await sock.sendMessage(sender, {
        text: "What do you want to do?",
        buttons: [
          { buttonId: "info", buttonText: { displayText: "ℹ️ Get Info" }, type: 1 },
          { buttonId: "services", buttonText: { displayText: "🛠 Order Service" }, type: 1 },
          { buttonId: "housing", buttonText: { displayText: "🏠 Get Housing" }, type: 1 }
        ]
      })
      return
    }

    if (session.data.intent === "services" && !session.data.service) {
      session.step = "selectService"
      await sock.sendMessage(sender, {
        text: "Which service do you need?",
        buttons: Object.keys(serviceSynonyms).map(s => ({ buttonId: s, buttonText: { displayText: s }, type: 1 }))
      })
      return
    }

    if (session.data.intent === "housing" && !session.data.housing) {
      session.step = "selectHousing"
      await sock.sendMessage(sender, {
        text: "Which housing category?",
        buttons: housingCategories.map(s => ({ buttonId: s, buttonText: { displayText: s }, type: 1 }))
      })
      return
    }

    if (!session.data.location) {
      session.step = "selectLocation"
      await sock.sendMessage(sender, {
        text: "Which campus/location?",
        buttons: campusLocations.map(s => ({ buttonId: s, buttonText: { displayText: s }, type: 1 }))
      })
      return
    }

    // === Confirmation ===
    if (session.step === "confirm") {
      if (["yes", "y"].includes(textRaw.toLowerCase())) {
        await sock.sendMessage(sender, { text: "✅ Request confirmed! Someone will reach out soon." })
        userSessions[sender] = { step: "menu", data: {} }
      } else {
        await sock.sendMessage(sender, { text: "❌ Cancelled. Returning to main menu." })
        userSessions[sender] = { step: "menu", data: {} }
      }
    }
  })
}

setInterval(() => {}, 1 << 30)
startBot()
