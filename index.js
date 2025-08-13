require('dotenv').config();
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');

// ======= Comprehensive Service Data =======
const SERVICE_CATEGORIES = {
  "Academic Support": {
    synonyms: ["tutor", "homework", "assignment", "study", "academic"],
    description: "Learning assistance and educational resources"
  },
  "Digital Services": {
    synonyms: ["print", "design", "video", "tech", "digital"],
    description: "Technology and digital solutions"
  },
  "Cooking Services": {
    synonyms: ["cook", "meal", "food", "chef"],
    description: "Meal preparation services"
  },
  "Laundry Services": {
    synonyms: ["laundry", "wash", "clothes", "iron"],
    description: "Clothing care services"
  },
  "Home Cleaning": {
    synonyms: ["clean", "cleaning", "housekeeping", "cleaner"],
    description: "Home and dorm cleaning"
  },
  "Hair Styling": {
    synonyms: ["hair", "salon", "barber", "hairstyle", "braid"],
    description: "Hair care and styling"
  },
  "Farming Services": {
    synonyms: ["farm", "garden", "agriculture", "produce"],
    description: "Agricultural and gardening services"
  }
};

const HOUSING_CATEGORIES = {
  "Hostel": { 
    synonyms: ["hostel", "dormitory"],
    description: "Shared living spaces with basic amenities" 
  },
  "Lodge": { 
    synonyms: ["lodge", "guesthouse"],
    description: "Private rooms with shared facilities" 
  },
  "Apartment": { 
    synonyms: ["apartment", "flat"],
    description: "Self-contained private units" 
  },
  "Squat": { 
    synonyms: ["squat", "shortstay"],
    description: "Affordable short-term options" 
  }
};

const LOCATIONS = [
  "Abuja Campus",
  "Delta Campus",
  "Choba Campus",
  "Alakiah",
  "Choba",
  "Ozuoba",
  "Aluu"
];

// Campus information database
const CAMPUS_INFO = {
  "exam": "📝 Next semester exams begin on December 15th",
  "exams": "📝 Next semester exams begin on December 15th",
  "exam date": "📝 Next semester exams begin on December 15th",
  "calendar": "🗓️ Academic calendar: https://unihub.edu/calendar",
  "event": "🎉 Upcoming events: https://unihub.edu/events",
  "resource": "📚 Student resources: https://unihub.edu/resources",
  "cleaner": "🧹 You can book cleaning services through our Home Cleaning category"
};

// ======= Bot Implementation =======
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
    return "\n\n💡 *Help:* Type '0' to restart • 'menu' for options";
  }

  // ======= Navigation Functions =======
  async function sendMainMenu(userID) {
    userSessions[userID] = { step: "welcome", data: {} };
    
    await whatsapp.sendMessage(userID, {
      text: `📋 *UniHub Main Menu* ${helpFooter()}\n
1. Academic Support (tutoring, assignments)
2. Campus Information/NEWS
3. Digital Services (printing, design)
4. Cooking Services
5. Laundry Services
6. Home Cleaning
7. Hair Styling
8. Farming Services
9. Lodging/Hostel Solutions`,
      buttons: [
        { buttonId: 'services', buttonText: { displayText: '🔧 Services' } },
        { buttonId: 'housing', buttonText: { displayText: '🏠 Housing' } },
        { buttonId: 'info', buttonText: { displayText: 'ℹ️ Campus Info' } }
      ]
    });
  }

  async function handleInitialMessage(userID, input) {
    // First, check if this is a direct service/housing request
    const serviceMatch = Object.keys(SERVICE_CATEGORIES).find(service => 
      SERVICE_CATEGORIES[service].synonyms.some(syn => input.includes(syn))
    );
    
    const housingMatch = Object.keys(HOUSING_CATEGORIES).find(housing => 
      HOUSING_CATEGORIES[housing].synonyms.some(syn => input.includes(syn))
    );
    
    // Check campus information queries
    const infoMatch = Object.keys(CAMPUS_INFO).find(key => input.includes(key));
    
    if (serviceMatch) {
      userSessions[userID] = {
        step: "location_selection",
        data: { 
          intent: "service",
          serviceCategory: serviceMatch 
        }
      };
      return sendLocationSelection(userID, "service");
    }
    
    if (housingMatch) {
      userSessions[userID] = {
        step: "location_selection",
        data: { 
          intent: "housing",
          housingCategory: housingMatch 
        }
      };
      return sendLocationSelection(userID, "housing");
    }
    
    if (infoMatch) {
      return whatsapp.sendMessage(userID, { 
        text: `${CAMPUS_INFO[infoMatch]}${helpFooter()}`
      });
    }
    
    // If no direct match, show welcome message
    return sendWelcomeMessage(userID);
  }

  async function sendWelcomeMessage(userID) {
    await whatsapp.sendMessage(userID, {
      text: `👋 Welcome to UniHub Campus Assistant!\n
I can help you with:\n- Academic and digital services\n- Home services (cooking, cleaning, laundry, hair)\n- Farming solutions\n- Housing arrangements\n- Campus information\n\nHow can I assist you?\n\n${helpFooter()}`,
      buttons: [
        { buttonId: 'services', buttonText: { displayText: '🔧 Services' } },
        { buttonId: 'housing', buttonText: { displayText: '🏠 Housing' } },
        { buttonId: 'info', buttonText: { displayText: 'ℹ️ Campus Info' } }
      ]
    });
  }

  async function handleWelcomeResponse(userID, input, session) {
    if (input.includes('service') || input.match(/(1|3|4|5|6|7)/)) {
      session.step = "service_category";
      return sendServiceCategories(userID);
    }
    
    if (input.includes('housing') || input.includes('8')) {
      session.step = "housing_category";
      return sendHousingCategories(userID);
    }
    
    if (input.includes('info') || input.includes('9')) {
      return handleCampusInfoRequest(userID, input);
    }
    
    // Handle free-form queries
    return handleFreeFormQuery(userID, input);
  }

  async function handleFreeFormQuery(userID, input) {
    // Check service categories
    const serviceMatch = Object.keys(SERVICE_CATEGORIES).find(service => 
      SERVICE_CATEGORIES[service].synonyms.some(syn => input.includes(syn))
    );
    
    // Check housing categories
    const housingMatch = Object.keys(HOUSING_CATEGORIES).find(housing => 
      HOUSING_CATEGORIES[housing].synonyms.some(syn => input.includes(syn))
    );
    
    // Check campus information
    const infoMatch = Object.keys(CAMPUS_INFO).find(key => input.includes(key));
    
    if (serviceMatch) {
      userSessions[userID] = {
        step: "location_selection",
        data: { 
          intent: "service",
          serviceCategory: serviceMatch 
        }
      };
      return sendLocationSelection(userID, "service");
    }
    
    if (housingMatch) {
      userSessions[userID] = {
        step: "location_selection",
        data: { 
          intent: "housing",
          housingCategory: housingMatch 
        }
      };
      return sendLocationSelection(userID, "housing");
    }
    
    if (infoMatch) {
      return whatsapp.sendMessage(userID, { 
        text: `${CAMPUS_INFO[infoMatch]}${helpFooter()}`
      });
    }
    
    // If no matches found
    return whatsapp.sendMessage(userID, { 
      text: `🔍 I didn't quite catch that. Could you rephrase?\n\nTry something like:\n- "When do exams start?"\n- "I need cleaning services"\n- "Looking for a hostel"\n${helpFooter()}`
    });
  }

  async function handleCampusInfoRequest(userID, input) {
    const infoMatch = Object.keys(CAMPUS_INFO).find(key => input.includes(key));
    
    if (infoMatch) {
      return whatsapp.sendMessage(userID, { 
        text: `${CAMPUS_INFO[infoMatch]}${helpFooter()}`
      });
    }
    
    return whatsapp.sendMessage(userID, { 
      text: `ℹ️ What campus information do you need? Try:\n\n• Exam dates\n• Academic calendar\n• Upcoming events\n• Student resources\n${helpFooter()}`
    });
  }

  async function sendServiceCategories(userID) {
    await whatsapp.sendMessage(userID, {
      text: `🔧 Select a service category:`,
      buttons: [
        ...Object.keys(SERVICE_CATEGORIES).map(service => ({
          buttonId: `service_${service.replace(/\s+/g, '_')}`,
          buttonText: { displayText: service }
        })),
        { buttonId: 'menu', buttonText: { displayText: '📋 Menu' } }
      ],
      text: `${helpFooter()}`,
    });
  }

  async function handleServiceCategory(userID, input, session) {
    const serviceMatch = Object.keys(SERVICE_CATEGORIES).find(service => 
      service.toLowerCase().includes(input) || 
      SERVICE_CATEGORIES[service].synonyms.some(syn => input.includes(syn))
    );

    if (serviceMatch) {
      session.data.serviceCategory = serviceMatch;
      session.step = "location_selection";
      return sendLocationSelection(userID, "service");
    }

    // Handle invalid selection
    await whatsapp.sendMessage(userID, {
      text: `⚠️ Please select a valid service category${helpFooter()}`
    });
    return sendServiceCategories(userID);
  }

  async function sendHousingCategories(userID) {
    await whatsapp.sendMessage(userID, {
      text: `🏠 Select housing type:${helpFooter()}`,
      buttons: [
        ...Object.keys(HOUSING_CATEGORIES).map(type => ({
          buttonId: `housing_${type.replace(/\s+/g, '_')}`,
          buttonText: { displayText: type }
        })),
        { buttonId: 'menu', buttonText: { displayText: '📋 Menu' } }
      ]
    });
  }

  async function handleHousingCategory(userID, input, session) {
    const housingMatch = Object.keys(HOUSING_CATEGORIES).find(type => 
      type.toLowerCase().includes(input) || 
      HOUSING_CATEGORIES[type].synonyms.some(syn => input.includes(syn))
    );

    if (housingMatch) {
      session.data.housingCategory = housingMatch;
      session.step = "location_selection";
      return sendLocationSelection(userID, "housing");
    }

    // Handle invalid selection
    await whatsapp.sendMessage(userID, {
      text: `⚠️ Please select valid housing type${helpFooter()}`
    });
    return sendHousingCategories(userID);
  }

  async function sendLocationSelection(userID, context) {
    await whatsapp.sendMessage(userID, {
      text: `📍 Select your ${context === "service" ? "campus" : "preferred"} location:${helpFooter()}`,
      buttons: [
        ...LOCATIONS.map(location => ({
          buttonId: `loc_${location.replace(/\s+/g, '_')}`,
          buttonText: { displayText: location }
        })),
        { buttonId: 'back', buttonText: { displayText: '🔙 Back' } },
        { buttonId: 'menu', buttonText: { displayText: '📋 Menu' } }
      ]
    });
  }

  async function handleLocationResponse(userID, input, session) {
    const locationMatch = LOCATIONS.find(location => 
      location.toLowerCase().includes(input) || 
      input.includes(location.toLowerCase().split(' ')[0])
    );

    if (locationMatch) {
      session.data.location = locationMatch;
      session.step = "confirmation";
      return sendConfirmation(userID, session.data);
    }

    // Handle invalid location
    await whatsapp.sendMessage(userID, {
      text: `⚠️ Please select a valid location${helpFooter()}`
    });
    return sendLocationSelection(userID, 
      session.data.serviceCategory ? "service" : "housing");
  }

  async function sendConfirmation(userID, data) {
    let requestDetails = "";
    
    if (data.serviceCategory) {
      requestDetails = `🔧 *Service Request*\n• Service: ${data.serviceCategory}\n• Location: ${data.location}`;
    } else {
      requestDetails = `🏠 *Housing Request*\n• Type: ${data.housingCategory}\n• Location: ${data.location}`;
    }

    await whatsapp.sendMessage(userID, {
      text: `✅ *Please Confirm*\n${requestDetails}\n\nMinimum Provider Rating: ★★★★☆ (4.0+)\n\nIs this correct?${helpFooter()}`,
      buttons: [
        { buttonId: 'confirm_yes', buttonText: { displayText: '✓ Confirm' } },
        { buttonId: 'confirm_no', buttonText: { displayText: '✗ Cancel' } }
      ]
    });
  }

  async function handleConfirmation(userID, input, session) {
    if (input.includes('yes') || input === 'confirm_yes') {
      await whatsapp.sendMessage(userID, { 
        text: `✅ *Request Confirmed!*\nOur team will contact you shortly.\n\nThank you for using UniHub!`
      });
      // Reset session and return to main menu
      userSessions[userID] = { step: "welcome", data: {} };
      return sendMainMenu(userID);
    } 
    else {
      await whatsapp.sendMessage(userID, { 
        text: "❌ Request cancelled. Let me know if you need anything else."
      });
      // Reset session and return to main menu
      userSessions[userID] = { step: "welcome", data: {} };
      return sendMainMenu(userID);
    }
  }
}

// Start the bot
startUniHubBot();
setInterval(() => {}, 1 << 30); // Keep process running