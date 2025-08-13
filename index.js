require('dotenv').config();
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');

// ======= Comprehensive Service Data =======
const SERVICE_CATEGORIES = {
  "📚 Academic Support": {
    synonyms: ["tutoring", "homework", "assignment", "academic"],
    description: "Learning assistance and educational resources"
  },
  "💻 Digital Services": {
    synonyms: ["printing", "design", "video", "digital", "tech", "flier", "poster"],
    description: "Technology and digital solutions"
  },
  "🏠 Home Services": {
    synonyms: ["home", "household"],
    description: "General home assistance",
    subcategories: {
      "🍳 Cooking Services": ["cooking", "meal", "food", "cook"],
      "🧺 Laundry Services": ["laundry", "wash", "clothes"],
      "🧹 Home Cleaning": ["cleaning", "clean", "housekeeping"],
      "💇 Hair Styling": ["hair", "salon", "barber", "hairstyle"],
    "🌱 Farming Services":["farming", "garden", "agriculture", "farm"],
    }
  }
};

const HOUSING_CATEGORIES = {
  "- Hostel": { 
    synonyms: ["hostel", "dormitory"],
    description: "Shared living spaces with basic amenities" 
  },
  "- Lodge": { 
    synonyms: ["lodge", "guesthouse"],
    description: "Private rooms with shared facilities" 
  },
  "- Apartment": { 
    synonyms: ["apartment", "flat"],
    description: "Self-contained private units" 
  },
  "- Squat": { 
    synonyms: ["squat", "shortstay"],
    description: "Affordable short-term options" 
  }
};

const ALL_LOCATIONS = [
  "📍 Abuja Campus",
  "📍 Delta Campus",
  "📍 Choba Campus",
  "📍 Alakiah",
  "📍 Choba",
  "📍 Ozuoba",
  "📍 Aluu"
];

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
      return sendWelcomeMessage(userID);
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
      case "home_service_subcategory":
        await handleHomeServiceSubcategory(userID, userInput, session);
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
        await sendMainMenu(userID);
    }
  });

  // ======= Helper Functions =======
  function helpFooter() {
    return "\n\n💡 *Quick Help:* Type '0' anytime to restart • 'menu' for main options";
  }

  // ======= Navigation Functions =======
  async function sendMainMenu(userID) {
    userSessions[userID] = { step: "welcome", data: {} };
    
    await whatsapp.sendMessage(userID, {
      text: `📋 *UniHub Main Menu* ${helpFooter()}\n\n
1. 📚 *Academic Support* - Tutoring, assignments
2. 💻 *Digital Services* - Printing, design
3. 🏠 *Home Services* - Cooking, cleaning, laundry, hair
4. 🏠 *Housing Solutions* - Hostels, apartments
5. ℹ️ *Campus Information* - Events, resources`,
      buttons: [
        { buttonId: 'services', buttonText: { displayText: '📚 Services' } },
        { buttonId: 'housing', buttonText: { displayText: '🏠 Housing' } },
        { buttonId: 'help', buttonText: { displayText: '❓ Help' } }
      ]
    });
  }

  async function sendWelcomeMessage(userID) {
    await whatsapp.sendMessage(userID, {
      text: `🌟 *Welcome to UniHub Campus Assistant!* 🌟\n\n

I'm here to help you with:\n
• Academic and digital services 📚\n
• Home services (cooking, cleaning, laundry, hair) 🏠\n
• Housing arrangements 🏠\n
• Campus information ℹ️\n
${helpFooter().replace("💡", "👇")}`,
      buttons: [
        { buttonId: 'services', buttonText: { displayText: '📚 Browse Services' } },
        { buttonId: 'housing', buttonText: { displayText: '🏠 Find Housing' } },
        { buttonId: 'info', buttonText: { displayText: 'ℹ️ Campus Info' } }
      ]
    });
  }

  async function handleWelcomeResponse(userID, input, session) {
    if (input.includes('service') || input.includes('1') || input === 'services') {
      session.step = "service_category";
      return sendServiceCategories(userID);
    }
    
    if (input.includes('housing') || input.includes('5') || input === 'housing') {
      session.step = "housing_category";
      return sendHousingCategories(userID);
    }
    
    if (input.includes('info') || input.includes('6')) {
      return whatsapp.sendMessage(userID, { 
        text: `ℹ️ *Campus Information Center* ${helpFooter()}\n
• Academic calendar\n• Upcoming events\n• Student resources\n\nWhich information do you need?` 
      });
    }
    
    // Default to services menu for unclear responses
    session.step = "service_category";
    await whatsapp.sendMessage(userID, { 
      text: `🔍 Let's find the service you need: ${helpFooter()}`
    });
    return sendServiceCategories(userID);
  }

  async function sendServiceCategories(userID) {
    let categoriesText = "📋 *Service Categories*\n\n";
    for (const [category, details] of Object.entries(SERVICE_CATEGORIES)) {
      const emoji = category.slice(0, 2);
      const name = category.slice(3);
      categoriesText += `${emoji} *${name}*: ${details.description}\n`;
      
      // Add home service subcategories
      if (category.includes("Home Services")) {
        categoriesText += `   └ ${Object.keys(details.subcategories).map(
          sub => sub.slice(2)
        ).join(', ')}\n`;
      }
    }
    
    await whatsapp.sendMessage(userID, {
      text: `${categoriesText}\n🔍 Select a category: ${helpFooter()}`,
      buttons: [
        ...Object.keys(SERVICE_CATEGORIES).map(cat => ({
          buttonId: `cat_${cat.replace(/\W/g, '')}`,
          buttonText: { displayText: `${cat.slice(0,2)} ${cat.slice(3).split(' ')[0]}` }
        })),
        { buttonId: 'menu', buttonText: { displayText: '📋 Main Menu' } }
      ]
    });
  }

  async function handleServiceCategory(userID, input, session) {
    // Find matching category
    const categoryMatch = Object.keys(SERVICE_CATEGORIES).find(cat => 
      cat.toLowerCase().includes(input) || 
      SERVICE_CATEGORIES[cat].synonyms.some(syn => input.includes(syn))
    );

    if (categoryMatch) {
      // Special handling for home services with subcategories
      if (categoryMatch.includes("Home Services")) {
        session.data.serviceCategory = categoryMatch;
        session.step = "home_service_subcategory";
        return sendHomeServiceSubcategories(userID);
      }
      
      session.data.serviceCategory = categoryMatch;
      session.step = "location_selection";
      return sendLocationSelection(userID, "service");
    }

    // Handle invalid selection
    await whatsapp.sendMessage(userID, {
      text: `⚠️ Please select a valid category: ${helpFooter()}`
    });
    return sendServiceCategories(userID);
  }

  async function sendHomeServiceSubcategories(userID) {
    const subcategories = SERVICE_CATEGORIES["🏠 Home Services"].subcategories;
    
    await whatsapp.sendMessage(userID, {
      text: `🏠 *Home Service Options* ${helpFooter()}\n\n` +
        Object.keys(subcategories).map((sub, i) => 
          `${i+1}. ${sub.slice(2)}`).join('\n'),
      buttons: [
        ...Object.keys(subcategories).map(sub => ({
          buttonId: `sub_${sub.replace(/\W/g, '')}`,
          buttonText: { displayText: sub.slice(2).split(' ')[0] }
        })),
        { buttonId: 'back', buttonText: { displayText: '↩️ Categories' } },
        { buttonId: 'menu', buttonText: { displayText: '📋 Main Menu' } }
      ]
    });
  }

  async function handleHomeServiceSubcategory(userID, input, session) {
    const subcategories = SERVICE_CATEGORIES["🏠 Home Services"].subcategories;
    const subMatch = Object.keys(subcategories).find(sub => 
      subcategories[sub].some(syn => input.includes(syn))
    );

    if (subMatch) {
      session.data.serviceSubcategory = subMatch;
      session.step = "location_selection";
      return sendLocationSelection(userID, "service");
    }

    // Handle invalid selection
    await whatsapp.sendMessage(userID, {
      text: `⚠️ Please select a valid home service: ${helpFooter()}`
    });
    return sendHomeServiceSubcategories(userID);
  }

  async function sendHousingCategories(userID) {
    let housingText = "🏠 *Housing Options*\n\n";
    for (const [category, details] of Object.entries(HOUSING_CATEGORIES)) {
      const emoji = category.slice(0, 2);
      const name = category.slice(2);
      housingText += `${emoji} *${name}*: ${details.description}\n`;
    }
    
    await whatsapp.sendMessage(userID, {
      text: `${housingText}\n🔍 Select housing type: ${helpFooter()}`,
      buttons: [
        ...Object.keys(HOUSING_CATEGORIES).map(opt => ({
          buttonId: `housing_${opt.replace(/\W/g, '')}`,
          buttonText: { displayText: opt.slice(2) }
        })),
        { buttonId: 'menu', buttonText: { displayText: '📋 Main Menu' } }
      ]
    });
  }

  async function handleHousingCategory(userID, input, session) {
    const housingMatch = Object.keys(HOUSING_CATEGORIES).find(opt => 
      HOUSING_CATEGORIES[opt].synonyms.some(syn => input.includes(syn))
    );

    if (housingMatch) {
      session.data.housingCategory = housingMatch;
      session.step = "location_selection";
      return sendLocationSelection(userID, "housing");
    }

    // Handle invalid selection
    await whatsapp.sendMessage(userID, {
      text: `⚠️ Please select valid housing: ${helpFooter()}`
    });
    return sendHousingCategories(userID);
  }

  async function sendLocationSelection(userID, context) {
    await whatsapp.sendMessage(userID, {
      text: `📍 Select your ${context === "service" ? "campus" : "housing"} location: ${helpFooter()}`,
      buttons: [
        ...ALL_LOCATIONS.map(loc => ({
          buttonId: `loc_${loc.split(' ')[1]}`,
          buttonText: { displayText: loc.split(' ')[1] }
        })),
        { buttonId: 'back', buttonText: { displayText: '↩️ Back' } },
        { buttonId: 'menu', buttonText: { displayText: '📋 Main Menu' } }
      ]
    });
  }

  async function handleLocationResponse(userID, input, session) {
    const locationMatch = ALL_LOCATIONS.find(loc => 
      input.includes(loc.toLowerCase().split(' ')[1]) ||
      loc.toLowerCase().includes(input)
    );

    if (locationMatch) {
      session.data.location = locationMatch;
      session.step = "confirmation";
      return sendConfirmation(userID, session.data);
    }

    // Handle invalid location
    await whatsapp.sendMessage(userID, {
      text: `🚫 Location not recognized. Please choose from the list: ${helpFooter()}`
    });
    return sendLocationSelection(userID, 
      session.data.serviceCategory ? "service" : "housing");
  }

  async function sendConfirmation(userID, data) {
    let requestDetails = "";
    
    if (data.serviceCategory) {
      const serviceName = data.serviceSubcategory ? 
        data.serviceSubcategory.slice(2) : 
        data.serviceCategory.slice(3);
        
      requestDetails = `📦 *Service Request*\n• Service: ${serviceName}\n• Location: ${data.location}`;
    } else {
      requestDetails = `🏠 *Housing Request*\n• Type: ${data.housingCategory.slice(2)}\n• Location: ${data.location}`;
    }

    await whatsapp.sendMessage(userID, {
      text: `✅ *Please Confirm Your Request* ${helpFooter()}\n\n${requestDetails}\n\nIs this correct?`,
      buttons: [
        { buttonId: 'confirm_yes', buttonText: { displayText: '✓ Confirm' } },
        { buttonId: 'confirm_edit', buttonText: { displayText: '✎ Edit' } },
        { buttonId: 'confirm_cancel', buttonText: { displayText: '✗ Cancel' } }
      ]
    });
  }

  async function handleConfirmation(userID, input, session) {
    if (input.includes('yes') || input === 'confirm_yes') {
      await whatsapp.sendMessage(userID, { 
        text: `🎉 *Request Confirmed!*\nOur verified providers will contact you shortly.\n\nRating Requirement: ★★★★☆ (4.0+)${helpFooter()}`
      });
      userSessions[userID] = { step: "welcome", data: {} };
      return sendMainMenu(userID);
    } 
    else if (input.includes('edit') || input === 'confirm_edit') {
      // Return to appropriate starting point
      if (session.data.serviceSubcategory) {
        session.step = "home_service_subcategory";
        await whatsapp.sendMessage(userID, { text: "↩️ Returning to home services..." });
        return sendHomeServiceSubcategories(userID);
      } 
      else if (session.data.serviceCategory) {
        session.step = "service_category";
        await whatsapp.sendMessage(userID, { text: "↩️ Returning to services..." });
        return sendServiceCategories(userID);
      }
      else {
        session.step = "housing_category";
        await whatsapp.sendMessage(userID, { text: "↩️ Returning to housing..." });
        return sendHousingCategories(userID);
      }
    }
    else {
      await whatsapp.sendMessage(userID, { 
        text: "❌ Request cancelled. Let me know if you need anything else."
      });
      return sendMainMenu(userID);
    }
  }
}

// Start the bot
startUniHubBot();
setInterval(() => {}, 1 << 30); // Keep process running