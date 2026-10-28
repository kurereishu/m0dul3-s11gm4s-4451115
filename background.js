const KNOWLEDGE_BASE = [
  {
    answer: "Kayn",
    keywords: ["guadana", "guadaña", "scythe", "hoz", "rhaast"],
    explanation: "El campeon de League of Legends asociado con una guadana es Kayn."
  },
  {
    answer: "Ashe",
    keywords: ["flechas de hielo", "arquera de hielo", "freljord", "arco helado"],
    explanation: "Ashe es la arquera de hielo de Freljord."
  },
  {
    answer: "Zed",
    keywords: ["maestro de las sombras", "orden de la sombra", "sombras"],
    explanation: "Zed es conocido como el maestro de las sombras."
  },
  {
    answer: "Thresh",
    keywords: ["carcelero", "linterna", "cadena", "islas de la sombra"],
    explanation: "Thresh es el carcelero espectral de las Islas de la Sombra."
  },
  {
    answer: "Aatrox",
    keywords: ["darkin", "espada darkin", "world ender", "aniquilador"],
    explanation: "Aatrox es un Darkin que porta una espada viviente."
  },
  {
    answer: "Jinx",
    keywords: ["pow-pow", "fishbones", "cohete", "zaun", "caos"],
    explanation: "Jinx usa Pow-Pow y Fishbones, y viene de Zaun."
  },
  {
    answer: "Lux",
    keywords: ["luz", "demacia", "varita", "final spark", "chispa final"],
    explanation: "Lux es una maga de luz de Demacia."
  },
  {
    answer: "Yasuo",
    keywords: ["viento", "samurai", "espada", "ionia", "tornado"],
    explanation: "Yasuo es el espadachin ionio asociado con el viento."
  }
];

const pendingRequests = new Map();

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "answer-hovered-question") return;

  await analyzeActiveTab();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "LOL_ASSISTANT_QUESTION") {
    answerQuestion(message.payload).then((result) => {
      sendResponse({ type: "LOL_ASSISTANT_RESULT", result });
    });
    return true;
  }

  if (message?.type === "LOL_ASSISTANT_GET_SETTINGS") {
    getSettings().then((settings) => {
      sendResponse({ type: "LOL_ASSISTANT_SETTINGS", settings });
    });
    return true;
  }

  if (message?.type === "LOL_ASSISTANT_SET_SETTINGS") {
    setSettings(message.settings || {}).then((settings) => {
      sendResponse({ type: "LOL_ASSISTANT_SETTINGS", settings });
    });
    return true;
  }

  if (message?.type === "LOL_ASSISTANT_ANALYZE_ACTIVE_TAB") {
    analyzeActiveTab().then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});

async function answerQuestion(payload) {
  const signature = requestSignature(payload);
  if (pendingRequests.has(signature)) {
    return pendingRequests.get(signature);
  }

  const pending = answerQuestionOnce(payload).finally(() => {
    setTimeout(() => pendingRequests.delete(signature), 1000);
  });
  pendingRequests.set(signature, pending);
  return pending;
}

async function answerQuestionOnce(payload) {
  const gemini = await askGeminiServer(payload);
  if (gemini.result) return gemini.result;
  if (payload?.slots?.length) {
    return { answer: "No se pudo completar la pregunta", confidence: 0,
      explanation: `Este formato necesita Gemini. ${gemini.error || "Sin respuestas para los espacios."}` };
  }

  const fallback = findAnswer(payload);
  if (gemini.error) {
    return {
      ...fallback,
      explanation: `Gemini no respondio (${gemini.error}). ${fallback.explanation}`
    };
  }

  return fallback;
}

async function askGeminiServer(payload) {
  try {
    const response = await fetch("http://localhost:8787/answer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question: payload?.question || "",
        options: Array.isArray(payload?.options) ? payload.options : [],
        type: payload?.type,
        slots: payload?.slots
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { result: null, error: `HTTP ${response.status}: ${shorten(errorText)}` };
    }

    const result = await response.json();
    if (!result?.answer) {
      return { result: null, error: "respuesta sin answer" };
    }

    return {
      result: {
        answer: result.answer,
        assignments: result.assignments,
        confidence: typeof result.confidence === "number" ? result.confidence : 0.85,
        explanation: result.explanation || "Respuesta generada con Gemini desde el servidor local.",
        matchedOption: pickMatchingOption(payload?.options || [], result.answer) || result.matchedOption || result.answer,
        source: "gemini"
      },
      error: null
    };
  } catch (error) {
    console.warn("Gemini local server no disponible; usando base local.", error);
    return { result: null, error: error.message || "servidor local no disponible" };
  }
}

function findAnswer(payload) {
  const question = payload?.question || "";
  const options = Array.isArray(payload?.options) ? payload.options : [];
  const haystack = normalize([question, ...options].join(" "));

  let best = null;
  for (const entry of KNOWLEDGE_BASE) {
    const keywordHits = entry.keywords.filter((keyword) => haystack.includes(normalize(keyword))).length;
    const optionHit = options.some((option) => normalize(option).includes(normalize(entry.answer)));
    const answerInQuestion = normalize(question).includes(normalize(entry.answer));
    const score = keywordHits * 2 + (optionHit ? 3 : 0) + (answerInQuestion ? 1 : 0);

    if (!best || score > best.score) {
      best = { entry, score, optionHit };
    }
  }

  if (!best || best.score <= 0) {
    return {
      answer: "No encontre una respuesta local",
      confidence: 0,
      explanation: "Agrega mas pistas a answers en background.js o prueba con otra pregunta."
    };
  }

  return {
    answer: best.entry.answer,
    confidence: Math.min(0.99, 0.45 + best.score * 0.12),
    explanation: best.entry.explanation,
    matchedOption: pickMatchingOption(options, best.entry.answer)
  };
}

async function analyzeActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  chrome.tabs.sendMessage(tab.id, { type: "LOL_ASSISTANT_ANALYZE" }, async () => {
    if (!chrome.runtime.lastError) return;

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["overlay.css"]
      });
      chrome.tabs.sendMessage(tab.id, { type: "LOL_ASSISTANT_ANALYZE" });
    } catch (error) {
      console.warn("No se pudo inyectar LoL Quiz Assistant:", error);
    }
  });
}

function pickMatchingOption(options, answer) {
  const normalizedAnswer = normalize(answer);
  const normalizedAnswerWithoutPrefix = normalize(stripOptionPrefix(answer));
  return options.find((option) => {
    const normalizedOption = normalize(option);
    const normalizedOptionWithoutPrefix = normalize(stripOptionPrefix(option));
    return normalizedOption.includes(normalizedAnswer) ||
      normalizedAnswer.includes(normalizedOption) ||
      normalizedOptionWithoutPrefix.includes(normalizedAnswer) ||
      normalizedOption.includes(normalizedAnswerWithoutPrefix) ||
      normalizedOptionWithoutPrefix.includes(normalizedAnswerWithoutPrefix);
  }) || null;
}

function normalize(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shorten(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 160);
}

function stripOptionPrefix(value) {
  return String(value || "").replace(/^[A-Z](?:[\s.)-]+|$)/i, "").trim();
}

function requestSignature(payload) {
  return JSON.stringify({
    question: normalize(payload?.question || ""),
    options: (payload?.options || []).map(normalize),
    type: payload?.type,
    slots: payload?.slots
  });
}

async function getSettings() {
  const stored = await chrome.storage.local.get({
    showOverlay: false,
    showExplanation: false
  });

  return {
    showOverlay: Boolean(stored.showOverlay),
    showExplanation: Boolean(stored.showExplanation)
  };
}

async function setSettings(settings) {
  const next = {
    showOverlay: Boolean(settings.showOverlay),
    showExplanation: Boolean(settings.showExplanation)
  };
  await chrome.storage.local.set(next);
  return next;
}
