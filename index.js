require('dotenv').config();
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');
const qrcode = require('qrcode-terminal');

// ======= Comprehensive Service Data =======
const SERVICE_CATEGORIES = {
  "📚 Academic Support": {
    synonyms: ["tutor", "homework", "assignment", "study", "academic"],
    description: "Learning assistance and educational resources"
  },
  "💻 Digital Services": {
    synonyms: ["print", "design", "video", "tech", "digital"],
    description: "Technology and digital solutions"
  },
  "🍳 Cooking Services": {
    synonyms: ["cook", "meal", "food", "chef"],
    description: "Meal preparation services"
  },
  "🧺 Laundry Services": {
    synonyms: ["laundry", "wash", "clothes", "iron"],
    description: "Clothing care services"
  },
  "🧹 Home Cleaning": {
    synonyms: ["clean", "cleaning", "housekeeping", "cleaner"],
    description: "Home and dorm cleaning"
  },
  "💇 Hair Styling": {
    synonyms: ["hair", "salon", "barber", "hairstyle", "braid"],
    description: "Hair care and styling"
  },
  "🌱 Farming Services": {
    synonyms: ["farm", "garden", "agriculture", "produce"],
    description: "Agricultural and gardening services"
  }
};

const HOUSING_CATEGORIES = {
  "🏠 Hostel": { 
    synonyms: ["hostel", "dormitory"],
    description: "Shared living spaces with basic amenities" 
  },
  "🏘 Lodge": { 
    synonyms: ["lodge", "guesthouse"],
    description: "Private rooms with shared facilities" 
  },
  "🏢 Apartment": { 
    synonyms: ["apartment", "flat"],
    description: "Self-contained private units" 
  },
  "🏚️ Squat": { 
    synonyms: ["squat", "shortstay"],
    description: "Affordable short-term options" 
  }
};

const LOCATIONS = [
  "📍 Abuja Campus",
  "📍 Delta Campus",
  "📍 Choba Campus",
  "📍 Alakiah",
  "📍 Choba Town",
  "📍 Ozuoba",
  "📍 Aluu"
];

// Campus information database
const CAMPUS_INFO = {
  "exam": "📝 *Exam Schedule:*\nNext semester exams begin on December 15th\nResults released January 20th",
  "exams": "📝 *Exam Schedule:*\nNext semester exams begin on December 15th\nResults released January 20th",
  "calendar": "🗓️ *Academic Calendar:*\nhttps://unihub.edu/calendar\n\nTrimester Dates:\n- Term 1: Aug 15 - Nov 30\n- Term 2: Jan 10 - Apr 20",
  "event": "🎉 *Upcoming Events:*\nhttps://unihub.edu/events\n\nThis Week:\n- Tech Fest: Oct 15-17\n- Career Fair: Oct 20",
  "resource": "📚 *Student Resources:*\nhttps://unihub.edu/resources\n\nAvailable:\n- Library Access\n- Research Databases\n- Tutoring Centers",
  "cleaner": "🧹 *Cleaning Services:*\nWe offer professional home cleaning services starting at ₦2000/session\n\nBook through: Home Cleaning category"
};

// ======= Bot Implementation =======
async function startUniHubBot() {
  // Initialize WhatsApp connection
  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const { version } = await fetchLatestBaileysVersion();

  const whatsapp = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' })
  });

  const userSessions = {};

  // Connection events
  whatsapp.ev.on('connection.update', ({ connection, qr }) => {
    if (qr) {
      qrcode.generate(qr, { small: true }); // Display QR manually
    }
    if (connection === 'open') console.log("✅ UniHub Bot Connected!");
  });

  whatsapp.ev.on('creds.update', saveCreds);

  // Message handling
  whatsapp.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message.message || message.key.fromMe) return;

    const userID = message.key.remoteJid;
    const userInput = (
      message.message.conversation || 
      message.message.extendedTextMessage?.text || 
      ""
    ).trim().toLowerCase();

    if (!userInput) return;

    // Universal commands handler
    if (userInput === 'help' || userInput === '0' || userInput === 'menu') {
      userSessions[userID] = { step: "welcome", data: {} };
      return sendMainMenu(userID);
    }

    // Initialize new user session
    if (!userSessions[userID]) {
      userSessions[userID] = { step: "welcome", data: {} };
      return handleInitialMessage(userID, userInput);
    }

    const session = userSessions[userID];
    
    // Handle conversation flow
    switch (session.step) {
      case "welcome":
        await handleWelcomeResponse(userID, userInput, session);
        break;
      case "service_category":
        await handleServiceCategory(userID, userInput, session);
        break;
      case "housing_category":
        await handleHousingCategory(userID, userInput, session);
        break;
      case "location_selection":
        await handleLocationResponse(userID, userInput, session);
        break;
      case "confirmation":
        await handleConfirmation(userID, userInput, session);
        break;
      default:
        await handleFreeFormQuery(userID, userInput);
    }
  });

  // ======= Helper Functions =======
  function helpFooter() {
    return "\n\n💡 *Quick Help:* Type '0' to restart • 'menu' for options";
  }

  // ======= Navigation Functions =======
  async function sendMainMenu(userID) {
    userSessions[userID] = { step: "welcome", data: {} };
    
    await whatsapp.sendMessage(userID, {
      text: `🌟 *UniHub Main Menu* 🌟\n
Your campus services assistant:\n
ℹ️ Campus Information/NEWS
📚 Academic Support
💻 Digital Services
🍳 Cooking Services
🧺 Laundry Services
🧹 Home Cleaning
💇 Hair Styling
🌱 Farming Services
🏠 Housing Solutions`
    });

    await whatsapp.sendMessage(userID, {
      text: `🔍 *How can I assist you today?*\nChoose an option or describe your need:`,
      buttons: [
        { buttonId: 'info', buttonText: { displayText: 'ℹ️ Campus Info' } },
        { buttonId: 'services', buttonText: { displayText: '🔧 Services' } },
        { buttonId: 'housing', buttonText: { displayText: '🏠 Housing' } },
      ],
      footer: "💡 Type '0' to restart • 'menu' for options"
    });
  }

  // ... (Rest of your original functions stay exactly the same)
}

// Start the bot
startUniHubBot();
setInterval(() => {}, 1 << 30); // Keep process running
