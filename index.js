require('dotenv').config();
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');

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
    return "\n\n💡 *Quick Help:* Type '0' to restart • 'menu' for options";
  }

  // ======= Navigation Functions =======
  async function sendMainMenu(userID) {
    userSessions[userID] = { step: "welcome", data: {} };
    
    // First message: Menu options
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

    // Second message: Action prompt
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

  async function handleInitialMessage(userID, input) {
    // Check campus information queries
    const infoMatch = Object.keys(CAMPUS_INFO).find(key => input.includes(key));
    if (infoMatch) {
      return whatsapp.sendMessage(userID, { 
        text: CAMPUS_INFO[infoMatch] + helpFooter()
      });
    }

    // Check service categories
    const serviceMatch = Object.keys(SERVICE_CATEGORIES).find(service => 
      SERVICE_CATEGORIES[service].synonyms.some(syn => input.includes(syn))
    );
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
    
    // Check housing categories
    const housingMatch = Object.keys(HOUSING_CATEGORIES).find(housing => 
      HOUSING_CATEGORIES[housing].synonyms.some(syn => input.includes(syn))
    );
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
    
    // If no direct match, show welcome message
    return sendWelcomeMessage(userID);
  }

  async function sendWelcomeMessage(userID) {
    // First message: Welcome text
    await whatsapp.sendMessage(userID, {
      text: `👋 *Welcome to UniHub Campus Assistant!*\n\nI'm your one-stop solution for campus services and information/NEWS.`
    });

    // Second message: Options with footer
    await whatsapp.sendMessage(userID, {
      text: `💡 *How can I help you today?*`,
      buttons: [
        { buttonId: 'info', buttonText: { displayText: 'ℹ️ Campus Info' } },
        { buttonId: 'services', buttonText: { displayText: '🔧 Browse Services' } },
        { buttonId: 'housing', buttonText: { displayText: '🏠 Find Housing' } },
      ],
      footer: "💡 Type '0' to restart • 'menu' for options"
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
    // Check campus information first
    const infoMatch = Object.keys(CAMPUS_INFO).find(key => input.includes(key));
    if (infoMatch) {
      return whatsapp.sendMessage(userID, { 
        text: CAMPUS_INFO[infoMatch] + helpFooter()
      });
    }

    // Check service categories
    const serviceMatch = Object.keys(SERVICE_CATEGORIES).find(service => 
      SERVICE_CATEGORIES[service].synonyms.some(syn => input.includes(syn))
    );
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
    
    // Check housing categories
    const housingMatch = Object.keys(HOUSING_CATEGORIES).find(housing => 
      HOUSING_CATEGORIES[housing].synonyms.some(syn => input.includes(syn))
    );
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
    
    // If no matches found
    await whatsapp.sendMessage(userID, { 
      text: `🤔 *I didn't quite catch that*\n\nCould you rephrase? For example:\n• "When do exams start?"\n• "I need cleaning services"\n• "Looking for a hostel"`
    });
    
    await sendMainMenu(userID);
  }

  async function handleCampusInfoRequest(userID, input) {
    const infoMatch = Object.keys(CAMPUS_INFO).find(key => input.includes(key));
    
    if (infoMatch) {
      return whatsapp.sendMessage(userID, { 
        text: CAMPUS_INFO[infoMatch] + helpFooter()
      });
    }
    
    // First message: Info options
    await whatsapp.sendMessage(userID, {
      text: `ℹ️ *Campus Information Center*\n\nAvailable topics:\n• Exam dates\n• Academic calendar\n• Upcoming events\n• Student resources`
    });
    
    // Second message: Prompt with footer
    await whatsapp.sendMessage(userID, {
      text: `🔍 *What information do you need?*`,
      footer: "💡 Type '0' to restart • 'menu' for options"
    });
  }

  async function sendServiceCategories(userID) {
    // First message: Service list
    await whatsapp.sendMessage(userID, {
      text: `🔧 *Available Services*\n\n${Object.keys(SERVICE_CATEGORIES).map(service => {
        const emoji = service.slice(0, 2);
        const name = service.slice(3);
        return `${emoji} ${name}: ${SERVICE_CATEGORIES[service].description}`;
      }).join('\n\n')}`
    });

    // Second message: Prompt with buttons and footer
    await whatsapp.sendMessage(userID, {
      text: `👇 *Select a service category:*`,
      buttons: Object.keys(SERVICE_CATEGORIES).map(service => ({
        buttonId: `service_${service.replace(/\s+/g, '_')}`,
        buttonText: { displayText: service.slice(3) }
      })),
      footer: "💡 Type '0' to restart • 'menu' for options"
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
      text: `⚠️ *Please select a valid service category*`
    });
    return sendServiceCategories(userID);
  }

  async function sendHousingCategories(userID) {
    // First message: Housing options
    await whatsapp.sendMessage(userID, {
      text: `🏠 *Housing Options*\n\n${Object.keys(HOUSING_CATEGORIES).map(type => {
        const emoji = type.slice(0, 2);
        const name = type.slice(2);
        return `${emoji} ${name}: ${HOUSING_CATEGORIES[type].description}`;
      }).join('\n\n')}`
    });

    // Second message: Prompt with buttons and footer
    await whatsapp.sendMessage(userID, {
      text: `👇 *Select housing type:*`,
      buttons: Object.keys(HOUSING_CATEGORIES).map(type => ({
        buttonId: `housing_${type.replace(/\s+/g, '_')}`,
        buttonText: { displayText: type.slice(2) }
      })),
      footer: "💡 Type '0' to restart • 'menu' for options"
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
      text: `⚠️ *Please select valid housing type*`
    });
    return sendHousingCategories(userID);
  }

  async function sendLocationSelection(userID, context) {
    // First message: Location list
    await whatsapp.sendMessage(userID, {
      text: `📍 *Available Locations*\n\n${LOCATIONS.join('\n')}`
    });

    // Second message: Prompt with buttons and footer
    await whatsapp.sendMessage(userID, {
      text: `🌍 *Select your ${context === "service" ? "campus" : "preferred"} location:*`,
      buttons: LOCATIONS.map(location => ({
        buttonId: `loc_${location.replace(/\s+/g, '_')}`,
        buttonText: { displayText: location.split(' ')[1] }
      })),
      footer: "💡 Type '0' to restart • 'menu' for options"
    });
  }

  async function handleLocationResponse(userID, input, session) {
    const locationMatch = LOCATIONS.find(location => 
      location.toLowerCase().includes(input) || 
      input.includes(location.toLowerCase().split(' ')[1])
    );

    if (locationMatch) {
      session.data.location = locationMatch;
      session.step = "confirmation";
      return sendConfirmation(userID, session.data);
    }

    // Handle invalid location
    await whatsapp.sendMessage(userID, {
      text: `⚠️ *Please select a valid location*`
    });
    return sendLocationSelection(userID, 
      session.data.serviceCategory ? "service" : "housing");
  }

  async function sendConfirmation(userID, data) {
    let requestDetails = "";
    
    if (data.serviceCategory) {
      const emoji = data.serviceCategory.slice(0, 2);
      const name = data.serviceCategory.slice(3);
      requestDetails = `🔧 *Service Request*\n\n${emoji} Service: ${name}\n📍 Location: ${data.location.split(' ')[1]}`;
    } else {
      const emoji = data.housingCategory.slice(0, 2);
      const name = data.housingCategory.slice(2);
      requestDetails = `🏠 *Housing Request*\n\n${emoji} Type: ${name}\n📍 Location: ${data.location.split(' ')[1]}`;
    }

    // First message: Request summary
    await whatsapp.sendMessage(userID, {
      text: `✅ *Request Summary*\n\n${requestDetails}\n\nMinimum Provider Rating: ★★★★☆ (4.0+)`
    });

    // Second message: Confirmation prompt with footer
    await whatsapp.sendMessage(userID, {
      text: `❓ *Is this correct?*`,
      buttons: [
        { buttonId: 'confirm_yes', buttonText: { displayText: '✅ Confirm' } },
        { buttonId: 'confirm_no', buttonText: { displayText: '❌ Cancel' } }
      ],
      footer: "💡 Type '0' to restart • 'menu' for options"
    });
  }

  async function handleConfirmation(userID, input, session) {
    if (input.includes('yes') || input === 'confirm_yes') {
      // First message: Confirmation
      await whatsapp.sendMessage(userID, { 
        text: `🎉 *Request Confirmed!*\n\nOur team will contact you within 15 minutes\nProvider rating requirement: ★★★★☆+`
      });
      
      // Second message: Thank you
      await whatsapp.sendMessage(userID, { 
        text: `🙏 *Thank you for using UniHub!*\n\nYour support helps us improve campus services`
      });
      
      // Third message: Return to main menu
      await sendMainMenu(userID);
      
      // Reset session
      userSessions[userID] = { step: "welcome", data: {} };
    } 
    else {
      // First message: Cancellation
      await whatsapp.sendMessage(userID, { 
        text: `❌ *Request Cancelled*`
      });
      
      // Second message: Return to main menu
      await sendMainMenu(userID);
      
      // Reset session
      userSessions[userID] = { step: "welcome", data: {} };
    }
  }
}

// Start the bot
startUniHubBot();
setInterval(() => {}, 1 << 30); // Keep process running