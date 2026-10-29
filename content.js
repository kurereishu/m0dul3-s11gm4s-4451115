if (!window.__lolQuizAssistantLoaded) {
window.__lolQuizAssistantLoaded = true;

let lastHoveredElement = null;
let lastOverlayTimer = null;
let areaSelection = null;
const structuredTargets = new WeakMap();
const openTargets = new WeakMap();
let activeMoodleFill = null;
let analysisGeneration = 0;
let stepSession = null;
let stepTask = null;
const pageListeners = new AbortController();
let extensionDisconnected = false;
const dragChoiceSelector = ".draghome:not(.dragplaceholder), [draggable='true']";
const dragSlotSelector = ".ddwtos .drop, .ddwtos .dropzone, [data-drop-slot]";
let settings = {
  showOverlay: false,
  showExplanation: false
};

sendRuntimeMessage({ type: "LOL_ASSISTANT_GET_SETTINGS" }, (response) => {
  if (response?.settings) settings = response.settings;
});

try {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    if (changes.showOverlay) {
      settings.showOverlay = Boolean(changes.showOverlay.newValue);
      if (!settings.showOverlay) removeOverlay();
    }
    if (changes.showExplanation) {
      settings.showExplanation = Boolean(changes.showExplanation.newValue);
      if (!settings.showExplanation) {
        document.querySelector("#lol-assistant-overlay .lol-assistant-explanation")?.remove();
      }
    }
  });
} catch (error) {
  handleRuntimeFailure(error);
}

document.addEventListener(
  "mouseover",
  (event) => {
    if (event.target instanceof Element) {
      lastHoveredElement = event.target;
    }
  },
  { capture: true, signal: pageListeners.signal }
);

document.addEventListener(
  "focusin",
  (event) => {
    if (event.target instanceof Element) {
      lastHoveredElement = event.target;
    }
  },
  { capture: true, signal: pageListeners.signal }
);

document.addEventListener(
  "keydown",
  (event) => {
    if (event.altKey && event.code === "KeyN") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) runNextAnswer();
      return;
    }
    if (event.altKey && event.code === "KeyL") {
      event.preventDefault();
      runAnalysis();
    }

    if (event.altKey && event.code === "KeyS") {
      event.preventDefault();
      startAreaSelection();
    }
  },
  { capture: true, signal: pageListeners.signal }
);

function onRuntimeMessage(message) {
  if (message?.type !== "LOL_ASSISTANT_ANALYZE") return;
  runAnalysis();
}

try {
  if (!extensionDisconnected) chrome.runtime.onMessage.addListener(onRuntimeMessage);
} catch (error) {
  handleRuntimeFailure(error);
}

function sendRuntimeMessage(message, callback) {
  if (extensionDisconnected) return;
  try {
    if (!chrome.runtime?.id) {
      handleRuntimeFailure(new Error("Extension context invalidated."));
      return;
    }
    chrome.runtime.sendMessage(message, (response) => {
      // Read lastError even for an obsolete request so Chrome considers it handled.
      let error;
      try {
        error = chrome.runtime.lastError;
        if (!chrome.runtime.id) error = new Error("Extension context invalidated.");
      } catch (runtimeError) {
        error = runtimeError;
      }
      if (error) {
        handleRuntimeFailure(error);
        return;
      }
      if (!extensionDisconnected) callback(response);
    });
  } catch (error) {
    handleRuntimeFailure(error);
  }
}

function handleRuntimeFailure(error) {
  stepTask = null;
  stepSession = null;
  const message = String(error?.message || error || "Error de comunicacion");
  const invalidated = /extension context invalidated|context.*invalid|extension.*removed|extension.*disabled/i.test(message);
  if (invalidated) {
    extensionDisconnected = true;
    analysisGeneration += 1;
    activeMoodleFill?.abort();
    stopAreaSelection();
    pageListeners.abort();
    try { chrome.runtime.onMessage.removeListener(onRuntimeMessage); } catch { /* Context already gone. */ }
    window.__lolQuizAssistantLoaded = false;
    showOverlay({ answer: "Extension recargada. Recarga esta pagina (F5) para continuar.",
      confidence: 0, requiresManual: true, explanation: "La pagina conserva una instancia anterior de la extension." });
    return;
  }
  showOverlay({ answer: "Error de comunicacion", confidence: 0, explanation: message });
}

function runAnalysis() {
  analyzePayload(collectQuestionPayload(), "Pon el mouse sobre la pregunta o una opcion y vuelve a presionar Alt + L.");
}

function runNextAnswer() {
  if (stepTask || activeMoodleFill || extensionDisconnected) return;
  const root = findQuestionBlock(lastHoveredElement || document.activeElement);
  const payload = collectStructuredPayload(root);
  if (!payload) {
    const open = collectOpenPayload(root);
    if (open) {
      analyzePayload(open, "No pude detectar una pregunta de escritura.", true);
      return;
    }
    showOverlay({ answer: "Pon el mouse sobre una pregunta con varios espacios y pulsa Alt + N.", confidence: 0, requiresManual: true });
    return;
  }
  const generation = ++analysisGeneration;
  const task = {};
  stepTask = task;
  const advance = async (session) => {
    try {
      if (generation !== analysisGeneration) return;
      const current = collectStructuredPayload(root);
      const state = current && structuredTargets.get(current);
      if (state && session.manualIndex != null) {
        const index = session.manualIndex;
        const saved = session.answers[index];
        const actual = structuredTargetValue(state.targets[index], current.type);
        const desired = current.type === "select_slots" ? saved.value : saved.number || saved.text;
        if (actual === desired) {
          session.expected[index] = actual;
          session.next = index + 1;
          session.manualIndex = null;
        }
      }
      if (!state || current.question !== session.question || state.targets.length !== session.targets.length ||
          state.targets.some((target, index) => target !== session.targets[index] ||
            structuredTargetValue(target, current.type) !== session.expected[index])) {
        stepSession = null;
        showOverlay({ answer: "La pregunta cambio. Pulsa Alt + N para analizarla de nuevo.", confidence: 0, requiresManual: true });
        return;
      }
      if (session.next >= current.slots.length) {
        return;
      }
      const index = session.next;
      const saved = session.answers[index];
      const slot = current.slots[index];
      const option = slot.options.find((candidate) => {
        if (candidate.text !== saved.text) return false;
        if (current.type === "select_slots") return candidate.value === saved.value;
        const choice = state.choices.find((item) => item.id === candidate.value);
        return saved.number ? moodleClassNumber(choice.element, "choice") === saved.number &&
          moodleClassNumber(choice.element, "group") === saved.group : choice.element === saved.element;
      });
      if (!option) {
        stepSession = null;
        showOverlay({ answer: "Las opciones cambiaron. Pulsa Alt + N para analizar de nuevo.", confidence: 0, requiresManual: true });
        return;
      }
      const single = { ...current, slots: [slot] };
      structuredTargets.set(single, { targets: [state.targets[index]], choices: state.choices, initialValues: [state.initialValues[index]] });
      const answer = { ...session.result, answer: saved.text,
        assignments: [{ slotId: slot.id, value: option.value, text: option.text }] };
      const application = await applyStructuredAnswer(answer, single);
      if (generation !== analysisGeneration) return;
      if (!(application?.confidence > 0)) {
        stepSession = null;
        showOverlay(application);
        return;
      }
      // A manual fallback stays on this step until its answer is placed.
      if (!application.requiresManual) session.next++;
      session.manualIndex = application.requiresManual ? index : null;
      session.expected = session.targets.map((target) => structuredTargetValue(target, current.type));
      showOverlay({ ...application, requiresManual: true,
        answer: `Paso ${index + 1}/${current.slots.length}: ${saved.text}` });
    } catch {
      stepSession = null;
      showOverlay({ answer: "No se pudo completar este paso. Pulsa Alt + N para reintentar.", confidence: 0, requiresManual: true });
    } finally {
      if (stepTask === task) stepTask = null;
    }
  };
  if (stepSession?.root === root) {
    advance(stepSession);
    return;
  }
  stepSession = null;
  sendRuntimeMessage({ type: "LOL_ASSISTANT_QUESTION", payload }, (response) => {
    if (generation !== analysisGeneration) return;
    const result = response?.result;
    const state = structuredTargets.get(payload);
    const assignments = result?.assignments;
    const seen = new Set();
    const used = new Set();
    const answers = payload.slots.map((slot) => {
      const matches = Array.isArray(assignments) ? assignments.filter((item) => item?.slotId === slot.id) : [];
      const assignment = matches.length === 1 ? matches[0] : null;
      const option = slot.options.find((item) => item.value === assignment?.value && item.text === assignment?.text);
      if (!option || seen.has(slot.id) || (payload.type === "drag_slots" && !option.reusable && used.has(option.value))) return null;
      seen.add(slot.id);
      used.add(option.value);
      const choice = state.choices.find((item) => item.id === option.value);
      return { ...option, element: choice?.element,
        number: choice ? moodleClassNumber(choice.element, "choice") : null,
        group: choice ? moodleClassNumber(choice.element, "group") : null };
    });
    if (!(result?.confidence > 0) || assignments?.length !== answers.length || answers.some((answer) => !answer)) {
      stepTask = null;
      showOverlay({ answer: "No se pudo preparar el modo paso a paso. Vuelve a pulsar Alt + N.", confidence: 0, requiresManual: true });
      return;
    }
    stepSession = { root, question: payload.question, targets: state.targets, expected: state.initialValues,
      answers, result, next: 0 };
    advance(stepSession);
  });
}

function collectQuestionPayload() {
  const target = lastHoveredElement || document.activeElement;
  const block = findQuestionBlock(target);
  const structured = collectStructuredPayload(block);
  if (structured) return structured;
  const open = collectOpenPayload(block);
  if (open) return open;
  if (block && isMoodleQuestionRoot(block)) return collectMoodlePayload(block);

  const text = readVisibleText(block || target);
  const options = extractOptions(block);
  const question = extractQuestion(text, options);

  return {
    question,
    options,
    rawText: text,
    url: location.href,
    sourceRect: block ? rectToPlainObject(block.getBoundingClientRect()) : null
  };
}

function collectAreaPayload(rect) {
  const root = findAreaQuestionRoot(rect) || document.body;
  const structured = collectStructuredPayload(root, root === document.body ? rect : null);
  if (structured) return structured;
  const open = collectOpenPayload(root, root === document.body ? rect : null);
  if (open) return open;
  if (root !== document.body && isMoodleQuestionRoot(root)) {
    return collectMoodlePayload(root);
  }

  const rootRect = root === document.body ? rect : rectToPlainObject(root.getBoundingClientRect());
  const textElements = [...root.querySelectorAll("legend, label, p, h1, h2, h3, h4, div, span, button, [role='radio'], [role='option']")];
  const lines = [];

  for (const element of textElements) {
    if (element.id === "lol-assistant-overlay") continue;
    if (element.closest("#lol-assistant-overlay")) continue;
    if (!isVisibleElement(element)) continue;
    if (root === document.body && !isElementCenteredInRect(element, rect)) continue;
    if (hasVisibleTextChild(element)) continue;

    const text = cleanText(element.innerText || element.textContent || "");
    if (!isLikelyQuestionLine(text) && !isLikelyAnswerOptionText(text)) continue;
    if (lines.includes(text)) continue;

    lines.push(text);
  }

  const options = root === document.body ? extractOptionsFromRect(rect) : extractOptions(root);
  const rawText = lines.join("\n");
  return {
    question: extractQuestion(rawText, options),
    options: [...new Set(options)].slice(0, 12),
    rawText,
    url: location.href,
    sourceRect: rootRect
  };
}

function collectMoodlePayload(root) {
  const question = extractMoodleQuestion(root);
  const options = extractMoodleOptions(root);
  const rawText = [question, ...options].filter(Boolean).join("\n");

  return {
    question: question || extractQuestion(rawText, options),
    options,
    rawText,
    url: location.href,
    sourceRect: rectToPlainObject(root.getBoundingClientRect())
  };
}

function findQuestionBlock(target) {
  if (!(target instanceof Element)) return null;
  const moodleRoot = target.closest(".que, [id^='question-']");
  if (moodleRoot) return moodleRoot;

  const selectors = [
    "fieldset",
    "[role='radiogroup']",
    "[data-question]",
    "[id^='question-']",
    ".que",
    ".qtext",
    ".formulation",
    ".question",
    ".quiz-question",
    ".form-question",
    "article",
    "section",
    "form"
  ];

  for (const selector of selectors) {
    const match = target.closest(selector);
    if (match && readVisibleText(match).length > 0) return match;
  }

  let current = target;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const text = readVisibleText(current);
    if (looksLikeQuestionBlock(text)) return current;
    current = current.parentElement;
  }

  return target;
}

function extractOptions(block) {
  if (!(block instanceof Element)) return [];

  const controls = [...block.querySelectorAll("label, button, [role='option'], [role='radio'], option")];
  const options = controls
    .filter(isVisibleElement)
    .map((element) => cleanText(element.innerText || element.textContent || ""))
    .filter(isLikelyAnswerOptionText);

  return [...new Set(options)].slice(0, 12);
}

function extractMoodleQuestion(root) {
  const qtext = root.querySelector(".qtext");
  const qtextText = readCleanQuestionText(qtext);
  if (qtextText) return qtextText;

  const formulation = root.querySelector(".formulation") || root;
  const clone = formulation.cloneNode(true);
  clone.querySelectorAll("input, button, select, textarea, .answer, .ablock, .prompt, .accesshide, .sr-only, [aria-hidden='true']").forEach((element) => element.remove());

  const lines = readVisibleText(clone)
    .split("\n")
    .map(cleanText)
    .filter((line) => line && !isIgnorableQuestionLine(line));

  return lines.find(looksLikeChemicalReaction) || lines[0] || "";
}

function extractMoodleOptions(root) {
  const answerRoot = root.querySelector(".answer, .ablock") || root;
  const controls = [...answerRoot.querySelectorAll("label, [data-region='answer-label'], .answer div, .r0, .r1")];
  const options = [];

  for (const element of controls) {
    if (!isVisibleElement(element)) continue;

    const text = cleanMoodleOptionText(element);
    if (!isLikelyAnswerOptionText(text)) continue;
    if (options.some((option) => normalize(option) === normalize(text))) continue;

    options.push(text);
  }

  return options.slice(0, 12);
}

function extractOptionsFromRect(rect) {
  const controls = [...document.body.querySelectorAll("label, button, [role='radio'], [role='option'], input[type='radio'], input[type='checkbox']")];
  const options = [];

  for (const element of controls) {
    if (!isVisibleElement(element)) continue;
    if (!isElementCenteredInRect(element, rect)) continue;

    const text = cleanText(optionTextForElement(element));
    if (!isLikelyAnswerOptionText(text)) continue;
    if (options.includes(text)) continue;

    options.push(text);
  }

  return options.slice(0, 12);
}

function extractQuestion(text, options) {
  if (!text) return "";

  const lines = text
    .split("\n")
    .map(cleanText)
    .filter((line) => line && !isIgnorableQuestionLine(line));

  const questionLine = lines.find((line) => line.includes("?") || line.includes("¿"));
  if (questionLine) return questionLine;

  const withoutOptions = lines.filter((line) => !optionContainsLine(options, line));
  return withoutOptions[0] || lines[0] || "";
}

function looksLikeQuestionBlock(text) {
  return text.length > 8 && text.length < 1000 && (/[?¿]|\b(quien|quién|cual|cuál|que|qué|donde|dónde)\b/i.test(text) || looksLikeChemicalReaction(text));
}

function showOverlay(result) {
  if (!settings.showOverlay) {
    removeOverlay();
    return;
  }

  removeOverlay();
  window.clearTimeout(lastOverlayTimer);

  const overlay = document.createElement("div");
  overlay.id = "lol-assistant-overlay";
  const explanation = settings.showExplanation ? `<div class="lol-assistant-explanation">${escapeHtml(result?.explanation || "")}</div>` : "";
  overlay.innerHTML = `
    <div class="lol-assistant-answer">${escapeHtml(result?.answer || "Sin respuesta")}</div>
    ${explanation}
  `;

  document.documentElement.appendChild(overlay);
  lastOverlayTimer = window.setTimeout(removeOverlay, result?.requiresManual ? 60000 : 9000);
}

function removeOverlay() {
  document.getElementById("lol-assistant-overlay")?.remove();
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function readVisibleText(element) {
  if (!(element instanceof Element)) return "";

  const rawText = element.innerText || element.textContent || "";
  return String(rawText)
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean)
    .join("\n");
}

function readCleanQuestionText(element) {
  if (!(element instanceof Element)) return "";

  const text = readVisibleText(element)
    .split("\n")
    .map(cleanText)
    .filter((line) => line && !isIgnorableQuestionLine(line))
    .join(" ");

  return cleanText(text);
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function startAreaSelection() {
  stopAreaSelection();

  const controller = new AbortController();
  const state = {
    controller,
    startX: 0,
    startY: 0,
    active: false,
    previousUserSelect: document.documentElement.style.userSelect
  };
  areaSelection = state;
  document.documentElement.style.userSelect = "none";

  document.addEventListener("mousedown", (event) => {
    state.active = true;
    state.startX = event.clientX;
    state.startY = event.clientY;
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true, signal: controller.signal });

  document.addEventListener("mouseup", (event) => {
    if (!state.active) return;
    state.active = false;

    const rect = makeRect(state.startX, state.startY, event.clientX, event.clientY);
    stopAreaSelection();
    event.preventDefault();
    event.stopPropagation();

    if (rect.width < 12 || rect.height < 12) {
      showOverlay({
        answer: "Area demasiado pequena",
        confidence: 0,
        explanation: "Vuelve a presionar Alt + S y arrastra sobre una pregunta completa."
      });
      return;
    }

    analyzePayload(collectAreaPayload(rect));
  }, { capture: true, signal: controller.signal });

  document.addEventListener("mousemove", (event) => {
    if (!state.active) return;
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true, signal: controller.signal });

  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    stopAreaSelection();
  }, { capture: true, signal: controller.signal });

  removeOverlay();
}

function stopAreaSelection() {
  if (areaSelection?.controller) {
    areaSelection.controller.abort();
    document.documentElement.style.userSelect = areaSelection.previousUserSelect || "";
  }
  areaSelection = null;
}

function analyzePayload(payload, emptyExplanation = "Intenta cubrir la pregunta y sus opciones dentro del rectangulo.", singleStep = false) {
  stepSession = null;
  stepTask = null;
  const generation = ++analysisGeneration;
  activeMoodleFill?.abort();
  payload.options = sanitizeOptions(payload.options);

  if (!payload.question) {
    showOverlay({
      answer: "No pude detectar una pregunta",
      confidence: 0,
      explanation: emptyExplanation
    });
    return;
  }

  sendRuntimeMessage({ type: "LOL_ASSISTANT_QUESTION", payload }, (response) => {
    if (generation !== analysisGeneration) return;

    const application = applyAnswer(response?.result, payload);
    if (application?.then) {
      application.then((result) => { if (generation === analysisGeneration) showOverlay(result); })
        .catch(() => {
          if (generation === analysisGeneration) showOverlay({ ...response?.result, requiresManual: true });
        });
    } else {
      const result = application || response?.result;
      showOverlay(singleStep && result?.confidence > 0 ? { ...result, requiresManual: true,
        answer: `Paso 1/1: ${result.answer}` } : result);
    }
  });
}

function applyAnswer(result, payload) {
  if (payload.slots?.length) return applyStructuredAnswer(result, payload);
  if (!result || !(result.confidence > 0)) return;
  if (payload.options?.length) {
    selectMatchedOption(result, payload);
    return;
  }

  return fillOpenAnswer(result, payload);
}

function writableFields(root) {
  if (!(root instanceof Element)) return [];
  return [...root.querySelectorAll("input:not([type]), input[type='text'], input[type='search'], textarea, [contenteditable='true']")]
    .filter((field) => isVisibleElement(field) && !field.matches(":disabled, [readonly], [aria-disabled='true']") &&
      !field.closest("#lol-assistant-overlay, [data-lol-assistant-snapshot], .qtype_ddwtos-readonly"));
}

function collectOpenPayload(root, selectionRect = null) {
  const fields = writableFields(root).filter((field) => !selectionRect || isElementCenteredInRect(field, selectionRect));
  if (fields.length !== 1 || root.querySelector("input[type='radio'], input[type='checkbox'], select")) return null;
  const field = fields[0];
  const questionRoot = root.querySelector(".qtext") || root;
  const clone = questionRoot.cloneNode(true);
  clone.querySelectorAll("input, textarea, select, button, [contenteditable='true'], .accesshide, .sr-only, [aria-hidden='true'], #lol-assistant-overlay, [data-lol-assistant-snapshot]")
    .forEach((element) => element.remove());
  const question = readCleanQuestionText(clone);
  if (!question) return null;
  const payload = { type: "open_text", question, options: [], rawText: question, url: location.href,
    sourceRect: selectionRect || rectToPlainObject(root.getBoundingClientRect()) };
  openTargets.set(payload, { field, initialValue: inputValue(field), root });
  return payload;
}

function collectStructuredPayload(root, selectionRect = null) {
  if (!(root instanceof Element)) return null;
  const inScope = (element) => isVisibleElement(element) &&
    (!selectionRect || isElementCenteredInRect(element, selectionRect));
  const selects = [...root.querySelectorAll("select")].filter(inScope);
  const drops = [...root.querySelectorAll(dragSlotSelector)].filter((element) => inScope(moodleVisibleDrop(element)));
  const type = selects.length ? "select_slots" : drops.length ? "drag_slots" : null;
  if (!type) return null;
  const targets = type === "select_slots" ? selects : drops;
  const choices = [...root.querySelectorAll(dragChoiceSelector)]
    .filter(isVisibleElement)
    .filter((element, index, all) => !all.some((other, otherIndex) => otherIndex !== index && other.contains(element)))
    .filter((element, index, all) => {
      const choice = moodleClassNumber(element, "choice");
      const group = moodleClassNumber(element, "group");
      return !element.closest(".ddwtos") || !choice || !group ||
        all.findIndex((other) => moodleClassNumber(other, "choice") === choice &&
          moodleClassNumber(other, "group") === group) === index;
    })
    .map((element, index) => ({
      id: `choice-${index + 1}`,
      text: cleanText(element.textContent),
      group: element.className.match?.(/\bgroup\d+\b/)?.[0] || "",
      reusable: element.classList.contains("infinite") || element.dataset.reusable === "true",
      element
    })).filter((choice) => choice.text);
  const clone = root.cloneNode(true);
  const originalElements = [...root.querySelectorAll("*")];
  const cloneElements = [...clone.querySelectorAll("*")];
  const selector = type === "select_slots" ? "select" : dragSlotSelector;
  const originals = [...root.querySelectorAll(selector)];
  const clonedTargets = [...clone.querySelectorAll(selector)];
  const slots = targets.map((element, index) => {
    const id = `slot-${index + 1}`;
    clonedTargets[originals.indexOf(element)]?.replaceWith(document.createTextNode(` [${id}] `));
    const context = element.closest("tr, label, p, li") || element.parentElement;
    const contextClone = context?.cloneNode(true);
    contextClone?.querySelectorAll("select, input, button").forEach((child) => child.remove());
    const group = element.className.match?.(/\bgroup\d+\b/)?.[0] || "";
    return {
      id,
      label: cleanText(contextClone?.textContent || element.getAttribute("aria-label") || `Espacio ${index + 1}`),
      options: type === "select_slots"
        ? [...element.options].filter((option) => !element.disabled && !option.disabled &&
            !option.parentElement?.disabled && option.value !== "" && cleanText(option.textContent) &&
            !/^(choose|select|selecciona|seleccione|elegir|elige)(\b|\.\.\.)/i.test(cleanText(option.textContent)))
          .map((option) => ({ value: option.value, text: cleanText(option.textContent) }))
        : choices.filter((choice) => !group || choice.group === group)
          .map(({ id, text, reusable }) => ({ value: id, text, reusable }))
    };
  });
  if (selectionRect) {
    originalElements.forEach((element, index) => {
      if (!intersects(selectionRect, element.getBoundingClientRect())) cloneElements[index].remove();
    });
  }
  clone.querySelectorAll(`${dragChoiceSelector}, .draghome, input, button, .accesshide, .sr-only, #lol-assistant-overlay`).forEach((element) => element.remove());
  const question = cleanText((clone.querySelector(".formulation") || clone).textContent);
  const payload = {
    type, question, options: [], slots, rawText: question, url: location.href,
    sourceRect: selectionRect || rectToPlainObject(root.getBoundingClientRect())
  };
  structuredTargets.set(payload, { targets, choices,
    initialValues: targets.map((element) => structuredTargetValue(element, type)) });
  return payload;
}

function applyStructuredAnswer(result, payload) {
  const state = structuredTargets.get(payload);
  const assignments = result?.assignments;
  const failure = { ...result, answer: "No se pudo completar la pregunta", confidence: 0,
    explanation: "Faltan respuestas validas para todos los espacios. Revisa Gemini y vuelve a intentarlo." };
  if (!state || !(result?.confidence > 0) || !Array.isArray(assignments) || assignments.length !== payload.slots.length) return failure;
  const seen = new Set();
  const usedChoices = new Set();
  const plan = [];
  for (const assignment of assignments) {
    const index = payload.slots.findIndex((slot) => slot.id === assignment.slotId);
    if (index < 0 || seen.has(index)) return failure;
    seen.add(index);
    const slot = payload.slots[index];
    const option = slot.options.find((item) => item.value === assignment.value && item.text === assignment.text);
    const target = state.targets[index];
    if (!option || !target.isConnected || !isVisibleElement(moodleVisibleDrop(target))) return failure;
    const currentValue = structuredTargetValue(target, payload.type);
    if (currentValue !== state.initialValues[index]) return failure;
    if (payload.type === "select_slots") {
      const liveOption = [...target.options].find((item) => item.value === option.value && cleanText(item.textContent) === option.text);
      if (target.disabled || !liveOption || liveOption.disabled || liveOption.parentElement?.disabled) return failure;
    } else {
      if (!option.reusable && usedChoices.has(option.value)) return failure;
      usedChoices.add(option.value);
    }
    plan.push({ target, option, id: slot.id });
  }
  plan.sort((a, b) => payload.slots.findIndex((slot) => slot.id === a.id) - payload.slots.findIndex((slot) => slot.id === b.id));
  if (payload.type === "select_slots") {
    for (const { target, option } of plan) {
      target.value = option.value;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (plan.some(({ target, option }) => !target.isConnected || target.value !== option.value)) return failure;
    return result;
  }
  const moodlePlan = prepareMoodlePlan(plan, state);
  if (moodlePlan) return fillMoodlePlan(moodlePlan, result, plan);
  let requiresManual = false;
  for (const { target, option, id } of plan) {
    const choice = state.choices.find((item) => item.id === option.value);
    const alreadyPlaced = cleanText(target.textContent) === option.text;
    // Other Moodle layouts retain manual guidance if the keyboard adapter cannot be used.
    const nativeDrag = choice?.element.isConnected && choice.element.getAttribute("draggable") === "true" && !target.closest(".ddwtos");
    if (!alreadyPlaced && nativeDrag) {
      try {
        const transfer = new DataTransfer();
        transfer.setData("text/plain", option.text);
        transfer.setData("text/choice-id", option.value);
        for (const [element, eventType] of [[choice.element, "dragstart"], [target, "dragenter"], [target, "dragover"], [target, "drop"], [choice.element, "dragend"]]) {
          element.dispatchEvent(new DragEvent(eventType, { bubbles: true, cancelable: true, dataTransfer: transfer }));
        }
      } catch { /* Unsupported drag API: retain the visible placement guidance. */ }
    }
    if (cleanText(target.textContent) !== option.text) {
      requiresManual = true;
      target.title = `${id}: ${option.text}`;
    }
  }
  return { ...result, requiresManual,
    answer: plan.map(({ option }, index) => `Espacio ${index + 1}: ${option.text}`).join("\n"),
    explanation: requiresManual ? "Arrastra las opciones a los espacios indicados, en orden de lectura." : result.explanation };
}

function moodleClassNumber(element, prefix) {
  return [...element.classList].map((name) => name.match(new RegExp(`^${prefix}([0-9]+)$`)))
    .find(Boolean)?.[1] || null;
}

function moodlePlaceInput(drop) {
  const root = drop.closest(".que.ddwtos");
  const place = moodleClassNumber(drop, "place");
  const group = moodleClassNumber(drop, "group");
  if (!root || !place || !group) return null;
  const inputs = root.querySelectorAll(`input.placeinput.place${place}.group${group}`);
  return inputs.length === 1 ? inputs[0] : null;
}

function moodleVisibleDrop(drop) {
  if (isVisibleElement(drop) || !drop.closest(".ddwtos")) return drop;
  const place = moodleClassNumber(drop, "place");
  const group = moodleClassNumber(drop, "group");
  return drop.closest(".ddwtos").querySelector(`.draghome.placed.inplace${place}.group${group}`) || drop;
}

function structuredTargetValue(element, type) {
  if (type === "select_slots") return element.value;
  return moodlePlaceInput(element)?.value ?? cleanText(element.textContent);
}

function prepareMoodlePlan(plan, state) {
  const root = plan[0]?.target.closest(".que.ddwtos");
  if (!root || root.classList.contains("qtype_ddwtos-readonly") || root.querySelector(".beingdragged")) return null;
  const entries = [];
  for (const item of plan) {
    const choice = state.choices.find((candidate) => candidate.id === item.option.value);
    const number = choice && moodleClassNumber(choice.element, "choice");
    const group = moodleClassNumber(item.target, "group");
    const place = moodleClassNumber(item.target, "place");
    const input = moodlePlaceInput(item.target);
    if (!item.target.matches("span.drop") || item.target.closest(".que.ddwtos") !== root ||
        !number || !group || !place || !input || input.disabled || !choice.element.isConnected ||
        moodleClassNumber(choice.element, "group") !== group || cleanText(choice.element.textContent) !== item.option.text) return null;
    entries.push({ ...item, input, number, group, place });
  }
  // Do not take a non-reusable word from an unselected space.
  for (const entry of entries) {
    const occupied = [...root.querySelectorAll(`input.placeinput.group${entry.group}`)]
      .find((input) => input.value === entry.number && !entries.some((item) => item.input === input));
    if (occupied && !entry.option.reusable) return null;
  }
  return { root, entries };
}

async function fillMoodlePlan({ root, entries }, result, plan) {
  activeMoodleFill?.abort();
  const controller = new AbortController();
  activeMoodleFill = controller;
  const signal = controller.signal;
  const stopOnUserAction = (event) => { if (event.isTrusted) controller.abort(); };
  for (const type of ["pointerdown", "keydown", "submit"]) {
    document.addEventListener(type, stopOnUserAction, { capture: true, signal });
  }
  const keyboard = async (entry, key, keyCode) => {
    if (signal.aborted || !entry.target.isConnected || !entry.input.isConnected ||
        root.classList.contains("qtype_ddwtos-readonly")) return false;
    const previous = entry.input.value;
    entry.target.dispatchEvent(new KeyboardEvent("keydown", {
      key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true
    }));
    const deadline = Date.now() + 2500;
    do {
      await new Promise((resolve) => window.setTimeout(resolve, 25));
      if (signal.aborted || !root.isConnected) return false;
      if (!root.querySelector(".beingdragged")) return entry.input.value !== previous;
    } while (Date.now() < deadline);
    return false;
  };
  const placedCorrectly = (entry) => entry.input.value === entry.number &&
    [...root.querySelectorAll(`.draghome.placed.inplace${entry.place}.group${entry.group}.choice${entry.number}`)]
      .some((element) => isVisibleElement(element) && cleanText(element.textContent) === entry.option.text);
  const restoreView = freezeMoodleView(root);
  let completed = true;
  try {
    // Release wrong placements first so swaps and previously used choices remain available.
    for (const entry of entries) {
      if (entry.input.value !== "0" && entry.input.value !== entry.number) {
        if (!await keyboard(entry, "Escape", 27) || entry.input.value !== "0") { completed = false; break; }
      }
    }
    if (completed) for (const entry of entries) {
      const limit = root.querySelectorAll(`.draghome.group${entry.group}`).length + 1;
      for (let step = 0; !placedCorrectly(entry) && step < limit; step++) {
        if (!await keyboard(entry, "ArrowRight", 39)) { completed = false; break; }
      }
      if (!placedCorrectly(entry)) completed = false;
      if (!completed || signal.aborted) break;
    }
    completed = completed && !signal.aborted && entries.every(placedCorrectly);
  } finally {
    controller.abort();
    // Finish an in-flight animation before revealing the final (or interrupted) state.
    const deadline = Date.now() + 2500;
    while (root.isConnected && root.querySelector(".beingdragged") && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 25));
    }
    restoreView();
    if (activeMoodleFill === controller) activeMoodleFill = null;
  }
  return { ...result, requiresManual: !completed,
    answer: plan.map(({ option }, index) => `Espacio ${index + 1}: ${option.text}`).join("\n"),
    explanation: completed ? "Espacios completados en Moodle." : "No se completaron todos los espacios. Arrastra las opciones que faltan segun esta guia." };
}

function freezeMoodleView(root) {
  // Keep a static view outside the live question so Moodle never treats it as an answer.
  const snapshot = root.cloneNode(true);
  const originals = [root, ...root.querySelectorAll("*")];
  const copies = [snapshot, ...snapshot.querySelectorAll("*")];
  originals.forEach((element, index) => {
    const copy = copies[index];
    const computed = window.getComputedStyle(element);
    copy.removeAttribute("style");
    for (const property of computed) copy.style.setProperty(property, computed.getPropertyValue(property));
    for (const attribute of ["id", "name", "class", "for", "autofocus", "draggable", "data-drop-slot"]) copy.removeAttribute(attribute);
    for (const attribute of [...copy.attributes]) {
      if (attribute.name.startsWith("on")) copy.removeAttribute(attribute.name);
    }
    if ("disabled" in copy) copy.disabled = true;
  });
  snapshot.querySelectorAll("script, style, iframe, object, embed").forEach((element) => element.remove());
  snapshot.dataset.lolAssistantSnapshot = "true";
  snapshot.setAttribute("aria-hidden", "true");
  snapshot.inert = true;
  const position = () => {
    const rect = root.getBoundingClientRect();
    for (const [property, value] of Object.entries({
      position: "fixed", top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`,
      height: `${rect.height}px`, margin: "0", "box-sizing": "border-box", transform: "none",
      "z-index": "2147483645", "pointer-events": "none"
    })) snapshot.style.setProperty(property, value, "important");
  };
  const previousOpacity = root.style.getPropertyValue("opacity");
  const previousPriority = root.style.getPropertyPriority("opacity");
  position();
  document.body.appendChild(snapshot);
  root.style.setProperty("opacity", "0", "important");
  window.addEventListener("scroll", position, true);
  window.addEventListener("resize", position);
  return () => {
    window.removeEventListener("scroll", position, true);
    window.removeEventListener("resize", position);
    snapshot.remove();
    if (previousOpacity) root.style.setProperty("opacity", previousOpacity, previousPriority);
    else root.style.removeProperty("opacity");
  };
}

function selectMatchedOption(result, payload) {
  const answerText = result?.matchedOption || result?.answer;
  if (!answerText) return;

  const normalizedAnswer = normalize(answerText);
  const normalizedAnswerWithoutPrefix = normalize(stripOptionPrefix(answerText));
  const candidates = [...document.querySelectorAll("label, input[type='radio'], input[type='checkbox'], button, [role='radio'], [role='option'], .answer div, .r0, .r1")]
    .filter((element) => isCandidateInsidePayload(element, payload));

  const match = candidates.find((element) => {
    const option = optionTextForElement(element);
    const normalizedOption = normalize(option);
    const normalizedOptionWithoutPrefix = normalize(stripOptionPrefix(option));
    return normalizedOption.includes(normalizedAnswer) ||
      normalizedOption.includes(normalizedAnswerWithoutPrefix) ||
      normalizedOptionWithoutPrefix.includes(normalizedAnswer) ||
      normalizedOptionWithoutPrefix.includes(normalizedAnswerWithoutPrefix);
  });
  const looseMatch = match || candidates.find((element) => normalize(stripOptionPrefix(optionTextForElement(element))).includes(normalizedAnswer));
  if (!looseMatch) return;

  const control = controlForOption(looseMatch);
  if (control instanceof HTMLInputElement) {
    if (!control.checked) control.click();
    control.checked = true;
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  looseMatch.click();
}

function fillOpenAnswer(result, payload) {
  const answerText = cleanText(result?.answer || "");
  if (!answerText || /^no proporcionada$/i.test(answerText)) return;

  const captured = openTargets.get(payload);
  if (captured) {
    const { field, initialValue, root } = captured;
    if (!field.isConnected || !root.contains(field) || !writableFields(root).includes(field) || inputValue(field) !== initialValue) {
      return { answer: "El campo cambio. Vuelve a analizar la pregunta para completarlo.", confidence: 0 };
    }
    setInputValue(field, answerText);
    if (inputValue(field) !== answerText) return { answer: "No se pudo escribir la respuesta en el campo.", confidence: 0 };
    return result;
  }

  const fields = [...document.querySelectorAll("input:not([type]), input[type='text'], input[type='search'], textarea, [contenteditable='true']")]
    .filter((element) => isCandidateInsidePayload(element, payload))
    .filter(isVisibleElement)
    .filter((element) => !element.matches(":disabled, [readonly], [aria-disabled='true']"));

  const field = fields.find((element) => cleanText(inputValue(element)).length === 0) || fields[0];
  if (!field) return;

  setInputValue(field, answerText);
}

function makeRect(startX, startY, endX, endY) {
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const right = Math.max(startX, endX);
  const bottom = Math.max(startY, endY);

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

function intersects(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function isOptionElement(element) {
  return element.matches("label, button, [role='radio'], [role='option'], option");
}

function isCandidateInsidePayload(element, payload) {
  if (!payload?.sourceRect) return true;
  return isElementCenteredInRect(element, payload.sourceRect);
}

function inputValue(element) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return element.value;
  return element.textContent || "";
}

function setInputValue(element, value) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.focus();
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  element.focus();
  element.textContent = value;
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
}

function optionTextForElement(element) {
  if (element instanceof HTMLInputElement) {
    const label = element.closest("label") || document.querySelector(`label[for="${cssEscape(element.id)}"]`);
    return label?.innerText || element.value || "";
  }

  return element.innerText || element.textContent || "";
}

function controlForOption(element) {
  if (element instanceof HTMLInputElement) return element;

  const nestedControl = element.querySelector?.("input[type='radio'], input[type='checkbox']");
  if (nestedControl instanceof HTMLInputElement) return nestedControl;

  const parentWithControl = element.closest?.(".r0, .r1, .answer div, li, div");
  const parentControl = parentWithControl?.querySelector?.("input[type='radio'], input[type='checkbox']");
  if (parentControl instanceof HTMLInputElement) return parentControl;

  if (element instanceof HTMLLabelElement && element.htmlFor) {
    const linkedControl = document.getElementById(element.htmlFor);
    if (linkedControl instanceof HTMLInputElement) return linkedControl;
  }

  return element;
}

function rectToPlainObject(rect) {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  };
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

function isVisibleElement(element) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
}

function isElementCenteredInRect(element, rect) {
  const elementRect = element.getBoundingClientRect();
  if (!intersects(rect, elementRect)) return false;

  const centerX = elementRect.left + elementRect.width / 2;
  const centerY = elementRect.top + elementRect.height / 2;
  return centerX >= rect.left && centerX <= rect.right && centerY >= rect.top && centerY <= rect.bottom;
}

function isLikelyAnswerOptionText(text) {
  if (!text || text.length > 90) return false;
  if (text === "×" || text.toLowerCase() === "x") return false;
  if (/^(clear my choice|select one|flag question|not yet answered|marked out of|question \d+)$/i.test(text.trim())) return false;
  if (/^(español|english|中文|繁體中文|deutsch|日本語|français|العربية|português|italiano|русский|한국어)$/i.test(text)) return false;
  return true;
}

function isLikelyQuestionLine(text) {
  if (!text || text.length > 500) return false;
  if (isIgnorableQuestionLine(text)) return false;
  return text.includes("?") || text.includes("¿") || looksLikeChemicalReaction(text) || /\b(write|what|which|who|when|where|why|how|calculate|solve|formula|answer|escribe|cual|cuál|quien|quién|que|qué)\b/i.test(text);
}

function isIgnorableQuestionLine(text) {
  const normalized = normalize(text);
  if (!normalized) return true;
  if (/^(question text|answer|answer:|respuesta|respuesta:|anterior|siguiente|next|back|previous|← anterior|anterior ←|select one|clear my choice|flag question|not yet answered|marked out of)$/i.test(text.trim())) return true;
  if (/^question \d+$/i.test(text.trim())) return true;
  return false;
}

function hasVisibleTextChild(element) {
  return [...element.children].some((child) => {
    if (!isVisibleElement(child)) return false;
    const text = cleanText(child.innerText || child.textContent || "");
    return text && text.length <= 500;
  });
}

function sanitizeOptions(options) {
  return [...new Set((options || []).map(cleanText).filter(isLikelyAnswerOptionText))].slice(0, 12);
}

function stripOptionPrefix(value) {
  return String(value || "").replace(/^[A-Z](?:[\s.)-]+|$)/i, "").trim();
}

function isMoodleQuestionRoot(element) {
  return element.matches?.("[id^='question-'], .que") || Boolean(element.querySelector?.(".qtext, .answer, .formulation"));
}

function cleanMoodleOptionText(element) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll("input, button, .accesshide, .sr-only, [aria-hidden='true']").forEach((child) => child.remove());
  return cleanText(clone.innerText || clone.textContent || "");
}

function findAreaQuestionRoot(rect) {
  const candidates = [...document.querySelectorAll("[id^='question-'], .que, .formulation, fieldset, [role='radiogroup']")]
    .filter(isVisibleElement)
    .map((element) => ({
      element,
      score: intersectionArea(rect, element.getBoundingClientRect())
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = candidates[0]?.element;
  if (!best) return null;
  return best.closest?.("[id^='question-'], .que") || best;
}

function intersectionArea(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function optionContainsLine(options, line) {
  const normalizedLine = normalize(line);
  return sanitizeOptions(options).some((option) => {
    const normalizedOption = normalize(option);
    return normalizedOption === normalizedLine || normalizedOption.includes(normalizedLine) || normalize(stripOptionPrefix(option)) === normalizedLine;
  });
}

function looksLikeChemicalReaction(text) {
  return /(?:→|->|=|\+).*(?:→|->|=|\+)/.test(text) && /[A-Z][a-z]?\d*/.test(text);
}

}
