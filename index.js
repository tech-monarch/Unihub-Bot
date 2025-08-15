// unihub-bot.js
require('dotenv').config();
const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const P = require('pino');
const qrcode = require('qrcode-terminal');

const Fuse = require('fuse.js');
const stringSim = require('string-similarity');

// ======= Service & Info Data (unchanged) =======
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

// ======= Greeting & Idle Settings (unchanged) =======
const greetingsList = [
  "hi", "hello", "hey", "good morning", "good afternoon", "good evening",
  "how far", "wassup", "sup", "what's up", "wetin dey", "good day",
  "morning", "afternoon", "evening", "my guy", "oga", "madam", "bros", "sis"
];
const userLastActive = {};
const IDLE_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// ======= Sessions store (in-memory; replace with DB for persistence) =======
const userSessions = {}; // keyed by userID

// ======= Improved NLP / Entity Extraction / Clarify Helpers =======

// small helper to normalize
function normalizeText(s) {
  return (s || '').toString().trim().toLowerCase();
}
function tokens(text) {
  return normalizeText(text).split(/\s+/).filter(Boolean);
}
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function wordBoundaryRegex(word) {
  return new RegExp('\\b' + escapeRegExp(normalizeText(word)) + '\\b', 'i');
}

// remove the common pin-emoji from locations
function stripPinEmoji(s) {
  return (s || '').replace(/📍/g, '').trim();
}

// build lookup & synonym map
function buildLookup(svc, house, locs) {
  const synonymMap = {};
  const categoryKeys = Object.keys(svc);
  const housingKeys = Object.keys(house);
  // map services
  categoryKeys.forEach(cat => {
    // map normalized label (without emoji)
    const labelNoEmoji = cat.replace(/[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim().toLowerCase();
    synonymMap[labelNoEmoji] = cat;
    (svc[cat].synonyms || []).forEach(s => synonymMap[normalizeText(s)] = cat);
    (svc[cat].subcategories || []).forEach(sub => synonymMap[normalizeText(sub)] = cat);
  });
  // map housing
  housingKeys.forEach(cat => {
    const labelNoEmoji = cat.replace(/[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim().toLowerCase();
    synonymMap[labelNoEmoji] = cat;
    (house[cat].synonyms || []).forEach(s => synonymMap[normalizeText(s)] = cat);
  });

  const cleanLocations = locs.map(l => stripPinEmoji(l));
  return { synonymMap, categoryKeys, housingKeys, cleanLocations };
}

const { synonymMap, categoryKeys, housingKeys, cleanLocations } =
  buildLookup(SERVICE_CATEGORIES, HOUSING_CATEGORIES, LOCATIONS);

// build Fuse index for fuzzy lookup
const fuseIndex = new Fuse(
  [
    ...Object.keys(SERVICE_CATEGORIES).map(k => ({ type: 'service', key: k, label: k, synonyms: (SERVICE_CATEGORIES[k].synonyms || []).join(' | '), sub: (SERVICE_CATEGORIES[k].subcategories || []).join(' | ') })),
    ...Object.keys(HOUSING_CATEGORIES).map(k => ({ type: 'housing', key: k, label: k, synonyms: (HOUSING_CATEGORIES[k].synonyms || []).join(' | ') })),
    ...Object.keys(CAMPUS_INFO).map(k => ({ type: 'info', key: k, label: k }))
  ],
  {
    keys: ['label', 'synonyms', 'sub'],
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 2
  }
);

// return top fuzzy matches (with scores 0..1)
function matchTop(query, limit = 5) {
  if (!query || !query.trim()) return [];
  const qn = normalizeText(query);
  // exact synonym
  if (synonymMap[qn]) {
    const canonical = synonymMap[qn];
    const type = Object.keys(SERVICE_CATEGORIES).includes(canonical) ? 'service' : (Object.keys(HOUSING_CATEGORIES).includes(canonical) ? 'housing' : 'unknown');
    return [{ item: { key: canonical, label: canonical, type }, score: 1 }];
  }
  const fuseRes = fuseIndex.search(qn).slice(0, limit);
  return fuseRes.map(r => {
    const label = (r.item.label || '');
    const sim = stringSim.compareTwoStrings(qn, normalizeText(label)); // 0..1
    return { item: r.item, score: Math.max(sim, 1 - r.score) };
  });
}

// improved entity extractor
function extractEntitiesImproved(userInput) {
  const raw = userInput || '';
  const text = normalizeText(raw);
  const result = {
    intentCandidates: [], // { type, key, label, score }
    serviceType: null,
    housingType: null,
    location: null,
    infoType: null,
    subcategory: null
  };

  // 1) fuzzy candidates
  const top = matchTop(text, 6);
  result.intentCandidates = top.map(t => ({ type: t.item.type, key: t.item.key, label: t.item.label, score: t.score }));

  // 2) token synonym direct mapping
  for (const tok of tokens(text)) {
    if (synonymMap[tok]) {
      const canonical = synonymMap[tok];
      if (Object.keys(SERVICE_CATEGORIES).includes(canonical)) result.serviceType = canonical;
      else if (Object.keys(HOUSING_CATEGORIES).includes(canonical)) result.housingType = canonical;
    }
  }

  // 3) location exact / fuzzy
  for (const loc of cleanLocations) {
    if (wordBoundaryRegex(loc).test(text)) {
      result.location = loc;
      break;
    }
  }
  if (!result.location && text) {
    const bestLoc = stringSim.findBestMatch(text, cleanLocations);
    if (bestLoc && bestLoc.bestMatch && bestLoc.bestMatch.rating > 0.3) result.location = bestLoc.bestMatch.target;
  }

  // 4) campus info
  for (const key of Object.keys(CAMPUS_INFO)) {
    if (wordBoundaryRegex(key).test(text)) {
      result.infoType = key;
      break;
    }
  }

  // 5) subcategory detection
  for (const [catKey, catObj] of Object.entries(SERVICE_CATEGORIES)) {
    for (const sub of (catObj.subcategories || [])) {
      if (wordBoundaryRegex(sub).test(text) || text.includes(normalizeText(sub))) {
        result.subcategory = sub;
        result.serviceType = catKey;
        break;
      }
    }
    if (result.subcategory) break;
  }

  // 6) fallback to top candidate
  if (!result.serviceType && !result.housingType && result.intentCandidates.length) {
    const best = result.intentCandidates[0];
    if (best.score > 0.45) {
      if (best.type === 'service') result.serviceType = best.key;
      if (best.type === 'housing') result.housingType = best.key;
      if (best.type === 'info') result.infoType = best.key;
    }
  }

  return result;
}

// intent detection with confidence / clarify
function detectIntentImproved(userInput) {
  const ent = extractEntitiesImproved(userInput);
  const t = normalizeText(userInput);

  // quick explicit commands
  if (/\b(reset|restart|start over|new session)\b/.test(t)) return { intent: 'reset', confidence: 1 };
  if (/\b(help|support|guide|what can you do|assist)\b/.test(t)) return { intent: 'help', confidence: 1 };
  if (/\b(menu|main menu)\b/.test(t)) return { intent: 'menu', confidence: 1 };
  if (/\b(yes|confirm|✅|confirm)\b/.test(t) && userSessions && userSessions.__lastClarify) return { intent: 'confirm', confidence: 1 };
  if (/\b(no|edit|change|❌|cancel)\b/.test(t) && userSessions && userSessions.__lastClarify) return { intent: 'decline', confidence: 1 };

  if (ent.infoType) return { intent: 'info', confidence: 0.95, infoType: ent.infoType };
  if (ent.serviceType) return { intent: 'service', confidence: 0.9, serviceType: ent.serviceType };
  if (ent.housingType) return { intent: 'housing', confidence: 0.9, housingType: ent.housingType };
  if (ent.location && /\b(find|book|search|need|want|looking)\b/.test(t)) return { intent: 'service', confidence: 0.7, location: ent.location };

  if (ent.intentCandidates && ent.intentCandidates.length) {
    const top = ent.intentCandidates.slice(0, 3);
    return { intent: 'clarify', confidence: 0.45, candidates: top };
  }

  return { intent: 'unknown', confidence: 0.0 };
}

// build clarify message for user
function buildClarifyMessage(candidates) {
  const opts = candidates.map((c, i) => {
    const label = c.label || c.item?.label || c.key;
    const type = c.type || c.item?.type || 'option';
    return { id: String(i + 1), label, type, score: c.score || 0 };
  });
  const text = [
    "I wasn't sure which one you meant — please pick an option by number or type the option name:",
    ...opts.map(o => `${o.id}. ${o.label} (${o.type})`)
  ].join('\n');
  return { text, options: opts };
}

// ======= Bot Implementation (Baileys + flow) =======

async function startUniHubBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const { version } = await fetchLatestBaileysVersion();

  const whatsapp = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    browser: ["UniHub", "Chrome", "110.0"],
  });

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
    // handle different incoming message shapes
    let userInput = "";
    if (msg.message.conversation) userInput = msg.message.conversation;
    else if (msg.message.extendedTextMessage?.text) userInput = msg.message.extendedTextMessage.text;
    else if (msg.message.buttonsResponseMessage?.selectedButtonId) userInput = msg.message.buttonsResponseMessage.selectedButtonId;
    else if (msg.message.listResponseMessage?.singleSelectReply?.selectedRowId) userInput = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
    userInput = (userInput || "").toString().trim();

    if (!userInput) return;
    await handleSmartMessage(whatsapp, userID, userInput, msg);
  });

  // main message handler
  async function handleSmartMessage(whatsapp, userID, userInput, rawMsg) {
    const now = Date.now();
    const lastActive = userLastActive[userID] || 0;
    const idleTooLong = (now - lastActive) > IDLE_TIMEOUT;
    userLastActive[userID] = now;

    const isGreeting = greetingsList.some(g => normalizeText(userInput).includes(normalizeText(g)));

    // initialize session if needed
    if (!userSessions[userID]) {
      userSessions[userID] = { state: "welcome", context: {}, lastAction: now, lastClarify: null };
    }
    const session = userSessions[userID];
    session.lastAction = now;

    // greetings / idle reset
    if (isGreeting || idleTooLong) {
      let matchedGreeting = greetingsList.find(g => normalizeText(userInput).includes(normalizeText(g))) || "Hello";
      matchedGreeting = matchedGreeting.charAt(0).toUpperCase() + matchedGreeting.slice(1);
      await whatsapp.sendMessage(userID, { text: `${matchedGreeting}! 👋` });
      session.state = "welcome";
      session.context = {};
      session.lastClarify = null;
      return sendMainMenu(whatsapp, userID);
    }

    // if we're in a clarify state, process numeric picks or typed options first
    if (session.state === 'clarify' && session.lastClarify) {
      const handled = await handleClarifyResponse(whatsapp, userID, userInput, session);
      if (handled) return;
      // if not handled, fall through to intent detection
    }

    // detect intent using improved function
    const intentRes = detectIntentImproved(userInput);
    const entities = extractEntitiesImproved(userInput);

    // explicit resets / help
    if (intentRes.intent === "reset") {
      userSessions[userID] = { state: "welcome", context: {}, lastAction: now, lastClarify: null };
      await whatsapp.sendMessage(userID, { text: "🔄 Session reset! Starting fresh..." });
      return sendMainMenu(whatsapp, userID);
    }
    if (intentRes.intent === "help") {
      return whatsapp.sendMessage(userID, {
        text: `🆘 *UniHub Help Center*\n\nI can help you with:\n- Service booking\n- Housing search\n- Campus information\n\nTry:\n• "Book cleaning service"\n• "Find hostels near me"\n• "When are exams?"\n\nType *menu* anytime for options!`
      });
    }
    if (intentRes.intent === "menu") {
      session.state = 'welcome';
      session.context = {};
      session.lastClarify = null;
      return sendMainMenu(whatsapp, userID);
    }

    // route by current state
    switch (session.state) {
      case "welcome":
        await handleWelcomeState(whatsapp, userID, userInput, intentRes, entities, session);
        break;
      case "service":
        await handleServiceState(whatsapp, userID, userInput, intentRes, entities, session);
        break;
      case "housing":
        await handleHousingState(whatsapp, userID, userInput, intentRes, entities, session);
        break;
      case "ask_details":
        await handleDetailsState(whatsapp, userID, userInput, session);
        break;
      case "ask_address":
        await handleAddressState(whatsapp, userID, userInput, session);
        break;
      case "confirmation":
        await handleConfirmationState(whatsapp, userID, userInput, rawMsg, session);
        break;
      default:
        await handleUnknownState(whatsapp, userID, userInput, session);
    }
  }

  // Clarify response handler: returns true if handled
  async function handleClarifyResponse(whatsapp, userID, userInput, session) {
    const last = session.lastClarify;
    if (!last || !last.options) return false;
    const pick = normalizeText(userInput);

    // numeric pick
    const numeric = pick.match(/^(\d+)$/);
    if (numeric) {
      const idx = parseInt(numeric[1], 10) - 1;
      if (last.options[idx]) {
        const choice = last.options[idx];
        session.lastClarify = null;
        session.state = 'welcome'; // will be changed below by handlers
        // route
        if (choice.type === 'service') {
          session.state = 'service';
          session.context = { type: choice.label };
          return handleServiceState(whatsapp, userID, '', null, null, session);
        } else if (choice.type === 'housing') {
          session.state = 'housing';
          session.context = { type: choice.label };
          return handleHousingState(whatsapp, userID, '', null, null, session);
        } else if (choice.type === 'info') {
          await whatsapp.sendMessage(userID, { text: CAMPUS_INFO[choice.label] || `Here is info about ${choice.label}` });
          return sendMainMenu(whatsapp, userID);
        }
      } else {
        await whatsapp.sendMessage(userID, { text: "Invalid option number. Please pick a number from the list." });
        return true;
      }
    }

    // typed name — exact first, then fuzzy
    const exact = last.options.find(o => normalizeText(o.label) === pick);
    if (exact) {
      session.lastClarify = null;
      session.state = 'welcome';
      if (exact.type === 'service') {
        session.state = 'service';
        session.context = { type: exact.label };
        return handleServiceState(whatsapp, userID, '', null, null, session);
      } else if (exact.type === 'housing') {
        session.state = 'housing';
        session.context = { type: exact.label };
        return handleHousingState(whatsapp, userID, '', null, null, session);
      } else if (exact.type === 'info') {
        await whatsapp.sendMessage(userID, { text: CAMPUS_INFO[exact.label] || `Here is info about ${exact.label}` });
        return sendMainMenu(whatsapp, userID);
      }
    }

    // fuzzy match against option labels
    const names = last.options.map(o => o.label);
    const best = stringSim.findBestMatch(pick, names);
    if (best.bestMatch.rating > 0.4) {
      const idx = names.indexOf(best.bestMatch.target);
      const choice = last.options[idx];
      session.lastClarify = null;
      session.state = 'welcome';
      if (choice.type === 'service') {
        session.state = 'service';
        session.context = { type: choice.label };
        return handleServiceState(whatsapp, userID, '', null, null, session);
      } else if (choice.type === 'housing') {
        session.state = 'housing';
        session.context = { type: choice.label };
        return handleHousingState(whatsapp, userID, '', null, null, session);
      } else if (choice.type === 'info') {
        await whatsapp.sendMessage(userID, { text: CAMPUS_INFO[choice.label] || `Here is info about ${choice.label}` });
        return sendMainMenu(whatsapp, userID);
      }
    }

    // not recognized
    await whatsapp.sendMessage(userID, { text: "I didn't recognize that option. Please reply with the number shown (e.g., 1)." });
    return true;
  }

  // welcome state handler
  async function handleWelcomeState(whatsapp, userID, userInput, intentRes, entities, session) {
    // immediate info
    if (intentRes.intent === "info" || entities.infoType) {
      const infoType = entities.infoType || intentRes.infoType || Object.keys(CAMPUS_INFO).find(key => normalizeText(userInput).includes(key));
      if (infoType && CAMPUS_INFO[infoType]) {
        await whatsapp.sendMessage(userID, { text: CAMPUS_INFO[infoType] });
      } else {
        await whatsapp.sendMessage(userID, {
          text: "ℹ️ *Campus Information*\nWhat would you like to know?\n- Exam schedules\n- Academic calendar\n- Upcoming events\n- Student resources"
        });
      }
      return sendMainMenu(whatsapp, userID);
    }

    // service transitions
    if (intentRes.intent === "service" || entities.serviceType) {
      // if low confidence but there are multiple candidates -> clarify
      if (intentRes.intent === 'clarify' && intentRes.candidates) {
        const clar = buildClarifyMessage(intentRes.candidates);
        session.lastClarify = clar.options;
        session.state = 'clarify';
        await whatsapp.sendMessage(userID, { text: clar.text });
        return;
      }

      session.state = "service";
      session.context = {
        type: entities.serviceType || intentRes.serviceType || "General Service",
        location: entities.location || intentRes.location || null
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

    // housing transitions
    if (intentRes.intent === "housing" || entities.housingType) {
      if (intentRes.intent === 'clarify' && intentRes.candidates) {
        const clar = buildClarifyMessage(intentRes.candidates);
        session.lastClarify = clar.options;
        session.state = 'clarify';
        await whatsapp.sendMessage(userID, { text: clar.text });
        return;
      }

      session.state = "housing";
      session.context = {
        type: entities.housingType || intentRes.housingType || "General Housing",
        location: entities.location || intentRes.location || null
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

    // subcategories request
    if (intentRes.intent === "clarify" && intentRes.candidates) {
      const clar = buildClarifyMessage(intentRes.candidates);
      session.lastClarify = clar.options;
      session.state = 'clarify';
      await whatsapp.sendMessage(userID, { text: clar.text });
      return;
    }

    // fallback main menu
    await whatsapp.sendMessage(userID, {
      text: "🤔 I didn't quite catch that. Let me show you what I can help with:"
    });
    return sendMainMenu(whatsapp, userID);
  }

  // service state handler
  async function handleServiceState(whatsapp, userID, userInput, intentRes, entities, session) {
    // update context from entities
    if (entities.serviceType) session.context.type = entities.serviceType;
    if (entities.location) session.context.location = entities.location;
    if (entities.subcategory) session.context.subcategory = entities.subcategory;

    // ask for location if missing
    if (!session.context.location) {
      await whatsapp.sendMessage(userID, {
        text: "🌍 Please tell me where you need this service (e.g., Choba Campus, Abuja Campus)"
      });
      return;
    }

    // if we don't have subcategory, show options
    if (!session.context.subcategory && session.context.type) {
      const category = SERVICE_CATEGORIES[session.context.type];
      if (category && category.subcategories) {
        const msg = `🔍 *${session.context.type} Options*\n\nPlease choose a subcategory:\n- ${category.subcategories.join("\n- ")}`;
        await whatsapp.sendMessage(userID, { text: msg, footer: "Type the name of the option you want" });
        // store lastClarify so the next message can type subcategory or pick fuzzy
        session.lastClarify = category.subcategories.map((s, i) => ({ id: String(i+1), label: s, type: 'service', score: 1 }));
        session.state = 'clarify';
        return;
      }
    }

    // proceed to details collection
    session.state = "ask_details";
    await whatsapp.sendMessage(userID, {
      text: `✏️ Tell me more about your ${session.context.subcategory || session.context.type} needs:\n• Specific requirements\n• Preferred time\n• Budget range\n• Any other details`
    });
  }

  // housing state handler
  async function handleHousingState(whatsapp, userID, userInput, intentRes, entities, session) {
    if (entities.housingType) session.context.type = entities.housingType;
    if (entities.location) session.context.location = entities.location;

    if (!session.context.location) {
      await whatsapp.sendMessage(userID, {
        text: "🌍 Please tell me your preferred location (e.g., Abuja Campus, Choba Town)"
      });
      return;
    }

    session.state = "ask_details";
    await whatsapp.sendMessage(userID, {
      text: `✏️ Tell me more about your ${session.context.type} needs:\n• Number of rooms\n• Price range\n• Move-in date\n• Any special requirements`
    });
  }

  // collect details
  async function handleDetailsState(whatsapp, userID, userInput, session) {
    session.context.details = userInput;
    session.state = "ask_address";
    await whatsapp.sendMessage(userID, {
      text: "🏠 Please share your exact address for service delivery:"
    });
  }

  // collect address -> confirmation
  async function handleAddressState(whatsapp, userID, userInput, session) {
    session.context.address = userInput;

    // build confirmation text
    let confirmation = `✅ *Request Summary*\n\n`;
    if (session.context.type) confirmation += `🔧 *Service:* ${session.context.type}\n`;
    if (session.context.subcategory) confirmation += `📋 *Subcategory:* ${session.context.subcategory}\n`;
    if (session.context.location) confirmation += `📍 *Location:* ${session.context.location}\n`;
    if (session.context.details) confirmation += `📝 *Details:* ${session.context.details}\n`;
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

  // handle confirmation (button or typed)
  async function handleConfirmationState(whatsapp, userID, userInput, rawMsg, session) {
    // check if message was a ButtonsResponse or typed
    const msg = rawMsg?.message || {};
    const buttonId = msg.buttonsResponseMessage?.selectedButtonId || null;
    const listId = msg.listResponseMessage?.singleSelectReply?.selectedRowId || null;
    const text = normalizeText(userInput);

    const accepted = buttonId === 'confirm_yes' || text.match(/\b(yes|confirm|okay|ok|✅)\b/);
    const declined = buttonId === 'confirm_no' || text.match(/\b(no|edit|change|❌|cancel)\b/);

    if (accepted) {
      // simulate saving the request (hook here to DB)
      const reqId = `REQ-${Date.now().toString().slice(-6)}`;
      await whatsapp.sendMessage(userID, { text: `🎉 Request submitted successfully! Your request ID is *${reqId}*. We'll contact you shortly.` });

      // reset session
      session.state = 'welcome';
      session.context = {};
      session.lastClarify = null;
      return sendMainMenu(whatsapp, userID);
    }

    if (declined) {
      // let user edit details (simple: go back to details collection)
      session.state = 'ask_details';
      await whatsapp.sendMessage(userID, { text: "Okay — what would you like to change? Tell me the updated details." });
      return;
    }

    // otherwise ask the user to respond with confirm/edit
    await whatsapp.sendMessage(userID, { text: "Please press ✅ Confirm to submit or ❌ Edit to make changes." });
  }

  // unknown state fallback
  async function handleUnknownState(whatsapp, userID, userInput, session) {
    const intent = detectIntentImproved(userInput);
    const entities = extractEntitiesImproved(userInput);
    if (intent.intent !== "unknown") {
      session.state = "welcome";
      return handleWelcomeState(whatsapp, userID, userInput, intent, entities, session);
    }

    await whatsapp.sendMessage(userID, {
      text: "🤔 I'm not sure what you need. Here are some things I can help with:"
    });
    return sendMainMenu(whatsapp, userID);
  }

  // send main menu helper
  async function sendMainMenu(whatsapp, userID) {
    const session = userSessions[userID] || {};
    session.state = "welcome";
    session.context = {};
    session.lastClarify = null;
    userSessions[userID] = session;

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
}

startUniHubBot();
setInterval(() => {}, 1 << 30);
