require('dotenv').config();
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');

// ======= Service Data =======
const SERVICE_OPTIONS = {
  "Academic Support": ["tutoring", "homework help", "assignment"],
  "Digital Services": ["printing", "design", "video editing"],
  "Home Services": ["cleaning", "laundry", "cooking", "hair styling"],
  "Farming Services": ["farming", "gardening"]
};

const HOUSING_OPTIONS = ["Hostel", "Lodge", "Apartment", "Squat"];
const CAMPUS_LOCATIONS = ["Abuja Campus", "Delta Campus", "Choba Campus", "Alakiah", "Choba", "Ozuoba", "Aluu"];

// ======= Main Function =======
async function startUniHubBot() {
  // Initialize WhatsApp connection
  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const { version } = await fetchLatestBaileysVersion();

  const whatsapp = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: true
  });

  const userSessions = {};

  // Connection events
  whatsapp.ev.on('connection.update', ({ connection }) => {
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

    // Initialize new user session
    if (!userSessions[userID]) {
      userSessions[userID] = { step: "welcome", data: {} };
      return sendWelcomeMessage(userID);
    }

    const session = userSessions[userID];
    
    // Handle help requests at any point
    if (userInput.includes('help') || userInput === '0') {
      session.step = "welcome";
      return sendWelcomeMessage(userID);
    }

    // Handle conversation flow
    switch (session.step) {
      case "welcome":
        await handleWelcomeResponse(userID, userInput);
        break;
      case "service_selection":
        case "housing_selection":
        await handleCategoryResponse(userID, userInput, session);
        break;
      case "location_selection":
        await handleLocationResponse(userID, userInput, session);
        break;
      case "confirmation":
        await handleConfirmation(userID, userInput, session);
        break;
      default:
        await sendErrorMessage(userID);
    }
  });

  // ======= Messaging Functions =======
  async function sendWelcomeMessage(userID) {
    await whatsapp.sendMessage(userID, {
      text: `🌟 *Welcome to UniHub!* 🌟\n
Your campus companion for:\n
📚 *Academic Services* (${Object.keys(SERVICE_OPTIONS).length} categories)
🏠 *Housing Options* (${HOUSING_OPTIONS.length} types)
📍 *Campus Coverage* (${CAMPUS_LOCATIONS.length} locations)\n
How can I assist you today? Reply with:\n
1. *Services* - To order campus services
2. *Housing* - To find accommodation
3. *Help* - To see this menu again`,
      buttons: [
        { buttonId: 'services', buttonText: { displayText: '📚 Order Services' } },
        { buttonId: 'housing', buttonText: { displayText: '🏠 Find Housing' } },
        { buttonId: 'help', buttonText: { displayText: '❓ Get Help' } }
      ]
    });
  }

  async function handleWelcomeResponse(userID, input) {
    const session = userSessions[userID];
    
    if (input.includes('service') || input === '1') {
      session.step = "service_selection";
      session.data.intent = "services";
      return requestServiceSelection(userID);
    }
    
    if (input.includes('housing') || input.includes('hostel') || input === '2') {
      session.step = "housing_selection";
      session.data.intent = "housing";
      return requestHousingSelection(userID);
    }
    
    // Default to welcome message for unclear responses
    await whatsapp.sendMessage(userID, { 
      text: "I didn't quite catch that. Let's try again!"
    });
    return sendWelcomeMessage(userID);
  }

  async function requestServiceSelection(userID) {
    await whatsapp.sendMessage(userID, {
      text: "📋 Please choose a service category:",
      buttons: Object.keys(SERVICE_OPTIONS).map(service => ({
        buttonId: service,
        buttonText: { displayText: service }
      }))
    });
  }

  async function requestHousingSelection(userID) {
    await whatsapp.sendMessage(userID, {
      text: "🏘️ What type of housing are you looking for?",
      buttons: HOUSING_OPTIONS.map(type => ({
        buttonId: type,
        buttonText: { displayText: type }
      }))
    });
  }

  async function handleCategoryResponse(userID, input, session) {
    // Service selection handling
    if (session.step === "service_selection") {
      const selectedService = Object.keys(SERVICE_OPTIONS).find(
        service => service.toLowerCase().includes(input) || 
        SERVICE_OPTIONS[service].some(syn => input.includes(syn))
      );

      if (selectedService) {
        session.data.service = selectedService;
        session.step = "location_selection";
        return requestLocation(userID);
      }
    }
    
    // Housing selection handling
    if (session.step === "housing_selection") {
      const selectedHousing = HOUSING_OPTIONS.find(
        option => input.includes(option.toLowerCase())
      );

      if (selectedHousing) {
        session.data.housing = selectedHousing;
        session.step = "location_selection";
        return requestLocation(userID);
      }
    }

    // Handle invalid selection
    await whatsapp.sendMessage(userID, {
      text: "⚠️ Invalid selection. Please choose from the options below:"
    });
    
    if (session.step === "service_selection") return requestServiceSelection(userID);
    if (session.step === "housing_selection") return requestHousingSelection(userID);
  }

  async function requestLocation(userID) {
    await whatsapp.sendMessage(userID, {
      text: "📍 Please select your campus location:",
      buttons: CAMPUS_LOCATIONS.map(location => ({
        buttonId: location,
        buttonText: { displayText: location }
      }))
    });
  }

  async function handleLocationResponse(userID, input, session) {
    const selectedLocation = CAMPUS_LOCATIONS.find(
      location => input.includes(location.toLowerCase())
    );

    if (selectedLocation) {
      session.data.location = selectedLocation;
      session.step = "confirmation";
      return sendConfirmationRequest(userID, session.data);
    }

    // Handle invalid location
    await whatsapp.sendMessage(userID, {
      text: "🚫 Location not recognized. Please choose from the options below:"
    });
    return requestLocation(userID);
  }

  async function sendConfirmationRequest(userID, data) {
    let serviceInfo = "";
    if (data.intent === "services") {
      serviceInfo = `Service: ${data.service}`;
    } else {
      serviceInfo = `Housing: ${data.housing}`;
    }

    await whatsapp.sendMessage(userID, {
      text: `✅ Please confirm your request:\n\n${serviceInfo}\nLocation: ${data.location}\n\nIs this correct?`,
      buttons: [
        { buttonId: 'confirm_yes', buttonText: { displayText: '👍 Yes, Confirm' } },
        { buttonId: 'confirm_no', buttonText: { displayText: '👎 No, Restart' } }
      ]
    });
  }

  async function handleConfirmation(userID, input, session) {
    if (input.includes('yes') || input.includes('confirm')) {
      await whatsapp.sendMessage(userID, { 
        text: "🎉 Request confirmed! Our team will contact you shortly.\n\nType *help* anytime to start over."
      });
      // Reset session
      userSessions[userID] = { step: "welcome", data: {} };
    } else {
      await whatsapp.sendMessage(userID, { 
        text: "🔄 Let's start over. What would you like to do?"
      });
      // Reset session
      userSessions[userID] = { step: "welcome", data: {} };
      return sendWelcomeMessage(userID);
    }
  }

  async function sendErrorMessage(userID) {
    await whatsapp.sendMessage(userID, {
      text: "❌ Something went wrong. Please try again or type *help* for assistance."
    });
    return sendWelcomeMessage(userID);
  }
}

// Start the bot
startUniHubBot();
setInterval(() => {}, 1 << 30); // Keep process running