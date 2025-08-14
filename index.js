require('dotenv').config();
const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const P = require('pino');
const qrcode = require('qrcode-terminal');

// ======= Service & Info Data =======
const SERVICE_CATEGORIES = {
  "📚 Academic Support": {
    synonyms: ["tutor", "homework", "assignment", "study", "academic", "classmate"],
    description: "Learning assistance and educational resources",
    subcategories: ["Private Tutor", "Group Study", "Assignment Help", "Exam Prep"]
  },
  "💻 Digital Services": {
    synonyms: ["print", "design", "video", "tech", "digital", "computer"],
    description: "Technology and digital solutions",
    subcategories: ["Graphic Design", "Video Editing", "Printing", "Web Development"]
  },
  "🍳 Cooking Services": {
    synonyms: ["cook", "meal", "food", "chef", "kitchen"],
    description: "Meal preparation services",
    subcategories: ["Private Chef", "Catering", "Daily Meal Service", "Special Events"]
  },
  "🧺 Laundry Services": {
    synonyms: ["laundry", "wash", "clothes", "iron", "dryclean"],
    description: "Clothing care services",
    subcategories: ["Washing Only", "Washing & Ironing", "Dry Cleaning", "Pickup & Delivery"]
  },
  "🧹 Home Cleaning": {
    synonyms: ["clean", "cleaning", "housekeeping", "cleaner", "mop"],
    description: "Home and dorm cleaning",
    subcategories: ["One time Cleaning", "Weekly Cleaning", "Deep Cleaning", "Move in Cleaning"]
  },
  "💇 Hair Styling": {
    synonyms: ["hair", "salon", "barber", "hairstyle", "braid"],
    description: "Hair care and styling",
    subcategories: ["Haircut", "Braiding", "Weaving", "Hair Coloring"]
  },
  "🌱 Farming Services": {
    synonyms: ["farm", "garden", "agriculture", "produce"],
    description: "Agricultural and gardening services",
    subcategories: ["Planting", "Weeding", "Harvesting", "Farming"]
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

const CAMPUS_INFO = {
  "exam": "📝 *Exam Schedule:*\nNext semester exams begin on December 15th\nResults released January 20th",
  "calendar": "🗓️ *Academic Calendar:*\nhttps://unihub.edu/calendar\nTerm 1: Aug 15 - Nov 30\nTerm 2: Jan 10 - Apr 20",
  "event": "🎉 *Upcoming Events:*\nhttps://unihub.edu/events\n- Tech Fest: Oct 15-17\n- Career Fair: Oct 20",
  "resource": "📚 *Student Resources:*\nhttps://unihub.edu/resources",
  "cleaner": "🧹 *Cleaning Services:*\nProfessional home cleaning from ₦2000/session"
};

// ======= Greeting & Idle Settings =======
const greetingsList = [
  "hi", "hello", "hey", "good morning", "good afternoon", "good evening",
  "how far", "wassup", "sup", "what's up", "wetin dey", "good day",
  "morning", "afternoon", "evening", "my guy", "oga", "madam", "bros", "sis"
];
const userLastActive = {};
const IDLE_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// ======= NLP Functions =======
function detectIntent(userInput) {
  userInput = userInput.toLowerCase();
  
  // Detect reset commands
  if (["reset", "restart", "start over", "new session"].some(cmd => userInput.includes(cmd))) {
    return "reset";
  }
  
  // Detect help requests
  if (["help", "support", "guide", "what can you do"].some(cmd => userInput.includes(cmd))) {
    return "help";
  }
  
  // Detect service requests
  if (Object.values(SERVICE_CATEGORIES).some(category => 
    category.synonyms.some(syn => userInput.includes(syn))
  )) {
    return "service";
  }
  
  // Detect housing requests
  if (Object.values(HOUSING_CATEGORIES).some(category => 
    category.synonyms.some(syn => userInput.includes(syn))
  )) {
    return "housing";
  }
  
  // Detect information requests
  if (Object.keys(CAMPUS_INFO).some(infoKey => userInput.includes(infoKey)) ||
     ["info", "information", "news", "update", "schedule", "when", "where", "what"].some(key => userInput.includes(key))
  ) {
    return "info";
  }
  
  // Detect service subcategory requests
  if (["more details", "sub categories", "details about", "options", "types"].some(key => userInput.includes(key))) {
    return "subcategories";
  }
  
  return "unknown";
}

function extractEntities(userInput) {
  userInput = userInput.toLowerCase();
  const entities = {
    serviceType: null,
    housingType: null,
    location: null,
    infoType: null,
    subcategory: null
  };
  
  // Extract service type
entities.serviceType = Object.keys(SERVICE_CATEGORIES).find(category => 
  SERVICE_CATEGORIES[category].synonyms.some(syn => userInput.includes(syn))
);

// Extract housing type
entities.housingType = Object.keys(HOUSING_CATEGORIES).find(category => 
  HOUSING_CATEGORIES[category].synonyms.some(syn => userInput.includes(syn))
);

// Extract location
entities.location = LOCATIONS.find(loc => 
  userInput.includes(loc.replace("📍 ", "").toLowerCase().split(" ")[0])
);

// Extract info type
entities.infoType = Object.keys(CAMPUS_INFO).find(infoKey => 
  userInput.includes(infoKey)
);

  
  // Extract subcategory
for (const category of Object.values(SERVICE_CATEGORIES)) {
  const foundSub = category.subcategories.find(sub => 
    userInput.includes(sub.toLowerCase().split(" ")[0])
  );
  
  if (foundSub) {
    entities.subcategory = foundSub;
    break;
  }
}

  return entities;
}

// ======= Bot Implementation =======
async function startUniHubBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const { version } = await fetchLatestBaileysVersion();

  const whatsapp = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    browser: ["UniHub", "Chrome", "110.0"],
  });

  const userSessions = {};

  whatsapp.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) qrcode.generate(qr, { small: true });

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startUniHubBot();
      else console.log("🚪 Logged out from WhatsApp.");
    } else if (connection === 'open') {
      console.log("✅ UniHub Bot Connected!");
    }
  });

  whatsapp.ev.on('creds.update', saveCreds);

  whatsapp.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const userID = msg.key.remoteJid;
    const userInput = (
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      ""
    ).trim().toLowerCase();

    if (!userInput) return;
    await handleSmartMessage(userID, userInput);
  });

  async function handleSmartMessage(userID, userInput) {
    const now = Date.now();
    const lastActive = userLastActive[userID] || 0;
    const idleTooLong = (now - lastActive) > IDLE_TIMEOUT;
    userLastActive[userID] = now;

    const isGreeting = greetingsList.some(g => userInput.includes(g));

    // Initialize session if needed
    if (!userSessions[userID]) {
      userSessions[userID] = { 
        state: "welcome", 
        context: {},
        lastAction: now
      };
    }
    
    const session = userSessions[userID];
    session.lastAction = now;
    
    // Handle greetings or idle reset
    if (isGreeting || idleTooLong) {
      let matchedGreeting = greetingsList.find(g => userInput.includes(g)) || "Hello";
      matchedGreeting = matchedGreeting.charAt(0).toUpperCase() + matchedGreeting.slice(1);
      await whatsapp.sendMessage(userID, { text: `${matchedGreeting}! 👋` });
      session.state = "welcome";
      return sendMainMenu(userID);
    }

    // Detect user intent
    const intent = detectIntent(userInput);
    const entities = extractEntities(userInput);
    
    // Handle reset command
    if (intent === "reset") {
      userSessions[userID] = { state: "welcome", context: {} };
      await whatsapp.sendMessage(userID, { text: "🔄 Session reset! Starting fresh..." });
      return sendMainMenu(userID);
    }
    
    // Handle help command
    if (intent === "help") {
      return whatsapp.sendMessage(userID, {
        text: `🆘 *UniHub Help Center*\n\nI can help you with:\n- Service booking\n- Housing search\n- Campus information\n\nTry:\n• "Book cleaning service"\n• "Find hostels near me"\n• "When are exams?"\n\nType *menu* anytime for options!`
      });
    }
    
    // Handle based on current state
    switch (session.state) {
      case "welcome":
        await handleWelcomeState(userID, userInput, intent, entities, session);
        break;
      case "service":
        await handleServiceState(userID, userInput, intent, entities, session);
        break;
      case "housing":
        await handleHousingState(userID, userInput, intent, entities, session);
        break;
      case "info":
        await handleInfoState(userID, userInput, intent, entities, session);
        break;
      case "ask_details":
        await handleDetailsState(userID, userInput, session);
        break;
      case "ask_address":
        await handleAddressState(userID, userInput, session);
        break;
      default:
        await handleUnknownState(userID, userInput, session);
    }
  }

  async function handleWelcomeState(userID, userInput, intent, entities, session) {
    // Handle information requests immediately
    if (intent === "info" || entities.infoType) {
      const infoType = entities.infoType || Object.keys(CAMPUS_INFO).find(key => 
        userInput.includes(key))
      
      if (infoType && CAMPUS_INFO[infoType]) {
        await whatsapp.sendMessage(userID, { text: CAMPUS_INFO[infoType] });
      } else {
        await whatsapp.sendMessage(userID, {
          text: "ℹ️ *Campus Information*\nWhat would you like to know?\n- Exam schedules\n- Academic calendar\n- Upcoming events\n- Student resources"
        });
      }
      return sendMainMenu(userID);
    }
    
    // Transition to service state
    if (intent === "service" || entities.serviceType) {
      session.state = "service";
      session.context = {
        type: entities.serviceType || "General Service",
        location: entities.location || null
      };
      
      let response = `🔧 Setting up your ${session.context.type} request...`;
      if (session.context.location) {
        response += `\n📍 Location: ${session.context.location}`;
      } else {
        response += "\n🌍 Please tell me your location (e.g., Choba Campus)";
      }
      
      await whatsapp.sendMessage(userID, { text: response });
      return;
    }
    
    // Transition to housing state
    if (intent === "housing" || entities.housingType) {
      session.state = "housing";
      session.context = {
        type: entities.housingType || "General Housing",
        location: entities.location || null
      };
      
      let response = `🏠 Setting up your ${session.context.type} search...`;
      if (session.context.location) {
        response += `\n📍 Location: ${session.context.location}`;
      } else {
        response += "\n🌍 Please tell me your preferred location (e.g., Abuja Campus)";
      }
      
      await whatsapp.sendMessage(userID, { text: response });
      return;
    }
    
    // Handle subcategory requests
    if (intent === "subcategories") {
      const matchedCategory = Object.keys(SERVICE_CATEGORIES).find(cat =>
        userInput.includes(cat.toLowerCase().split(" ")[1]))
      
      if (matchedCategory) {
        return whatsapp.sendMessage(userID, {
          text: `📋 *${matchedCategory}*\n${SERVICE_CATEGORIES[matchedCategory].description}\n\nSubcategories:\n- ${SERVICE_CATEGORIES[matchedCategory].subcategories.join("\n- ")}`
        });
      }
    }
    
    // Fallback to main menu
    await whatsapp.sendMessage(userID, {
      text: "🤔 I didn't quite catch that. Let me show you what I can help with:"
    });
    return sendMainMenu(userID);
  }

  async function handleServiceState(userID, userInput, intent, entities, session) {
    // Update context with new entities
    if (entities.serviceType) session.context.type = entities.serviceType;
    if (entities.location) session.context.location = entities.location;
    if (entities.subcategory) session.context.subcategory = entities.subcategory;
    
    // Handle location missing
    if (!session.context.location) {
      await whatsapp.sendMessage(userID, {
        text: "🌍 Please tell me where you need this service (e.g., Choba Campus, Abuja Campus)"
      });
      return;
    }
    
    // Handle subcategory selection
    if (!session.context.subcategory && session.context.type) {
      const category = SERVICE_CATEGORIES[session.context.type];
      if (category && category.subcategories) {
        await whatsapp.sendMessage(userID, {
          text: `🔍 *${session.context.type} Options*\n\nPlease choose a subcategory:\n- ${category.subcategories.join("\n- ")}`,
          footer: "Type the name of the option you want"
        });
        return;
      }
    }
    
    // Move to details collection
    session.state = "ask_details";
    await whatsapp.sendMessage(userID, {
      text: `✏️ Tell me more about your ${session.context.subcategory || session.context.type} needs:\n• Specific requirements\n• Preferred time\n• Budget range\n• Any other details`
    });
  }

  async function handleHousingState(userID, userInput, intent, entities, session) {
    // Update context with new entities
    if (entities.housingType) session.context.type = entities.housingType;
    if (entities.location) session.context.location = entities.location;
    
    // Handle location missing
    if (!session.context.location) {
      await whatsapp.sendMessage(userID, {
        text: "🌍 Please tell me your preferred location (e.g., Abuja Campus, Choba Town)"
      });
      return;
    }
    
    // Move to details collection
    session.state = "ask_details";
    await whatsapp.sendMessage(userID, {
      text: `✏️ Tell me more about your ${session.context.type} needs:\n• Number of rooms\n• Price range\n• Move-in date\n• Any special requirements`
    });
  }

  async function handleDetailsState(userID, userInput, session) {
    session.context.details = userInput;
    session.state = "ask_address";
    await whatsapp.sendMessage(userID, {
      text: "🏠 Please share your exact address for service delivery:"
    });
  }

  async function handleAddressState(userID, userInput, session) {
    session.context.address = userInput;
    
    // Format confirmation message
    let confirmation = `✅ *Request Summary*\n\n`;
    
    if (session.context.type) {
      confirmation += `🔧 *Service:* ${session.context.type}\n`;
    }
    if (session.context.subcategory) {
      confirmation += `📋 *Subcategory:* ${session.context.subcategory}\n`;
    }
    if (session.context.location) {
      confirmation += `📍 *Location:* ${session.context.location}\n`;
    }
    if (session.context.details) {
      confirmation += `📝 *Details:* ${session.context.details}\n`;
    }
    confirmation += `🏠 *Address:* ${session.context.address}\n\n`;
    confirmation += "Is this correct?";
    
    await whatsapp.sendMessage(userID, {
      text: confirmation,
      buttons: [
        { buttonId: 'confirm_yes', buttonText: { displayText: '✅ Confirm' } },
        { buttonId: 'confirm_no', buttonText: { displayText: '❌ Edit' } }
      ]
    });
    
    session.state = "confirmation";
  }

  async function sendMainMenu(userID) {
    const session = userSessions[userID] || {};
    session.state = "welcome";
    session.context = {};
    
    await whatsapp.sendMessage(userID, {
      text: `🌟 *UniHub Main Menu* 🌟\n\nYour campus services assistant:\n\n` +
        `ℹ️ Campus Information/NEWS\n📚 Academic Support\n💻 Digital Services\n🍳 Cooking Services\n` +
        `🧺 Laundry Services\n🧹 Home Cleaning\n💇 Hair Styling\n🌱 Farming Services\n🏠 Housing Solutions`
    });
    
    await whatsapp.sendMessage(userID, {
      text: `🔍 *How can I help you today?*\nExamples:\n• "Book cleaning in Choba"\n• "Find hostels near Abuja Campus"\n• "When are exams?"\n\n` +
        `💡 *Quick Help:* Type 'help' for assistance or 'menu' anytime`,
      footer: "UniHub - Your Campus Concierge"
    });
  }

  async function handleInfoState(userID, userInput, intent, entities, session) {
    const infoType = entities.infoType || Object.keys(CAMPUS_INFO).find(key => 
      userInput.includes(key))
    
    if (infoType && CAMPUS_INFO[infoType]) {
      await whatsapp.sendMessage(userID, { text: CAMPUS_INFO[infoType] });
    } else {
      await whatsapp.sendMessage(userID, {
        text: "ℹ️ *Campus Information Center*\n\nAvailable topics:\n• Exam schedules\n• Academic calendar\n• Upcoming events\n• Student resources\n\nWhat would you like to know?"
      });
    }
    
    // Return to main menu
    return sendMainMenu(userID);
  }

  async function handleUnknownState(userID, userInput, session) {
    // Try to detect intent again
    const intent = detectIntent(userInput);
    const entities = extractEntities(userInput);
    
    if (intent !== "unknown") {
      // Reset to welcome state if we can detect something
      session.state = "welcome";
      return handleWelcomeState(userID, userInput, intent, entities, session);
    }
    
    // If still unknown, show help
    await whatsapp.sendMessage(userID, {
      text: "🤔 I'm not sure what you need. Here are some things I can help with:"
    });
    return sendMainMenu(userID);
  }
}

startUniHubBot();
setInterval(() => {}, 1 << 30);