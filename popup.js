const showOverlay = document.getElementById("showOverlay");
const showExplanation = document.getElementById("showExplanation");
const analyze = document.getElementById("analyze");

chrome.runtime.sendMessage({ type: "LOL_ASSISTANT_GET_SETTINGS" }, (response) => {
  const settings = response?.settings || {};
  showOverlay.checked = Boolean(settings.showOverlay);
  showExplanation.checked = Boolean(settings.showExplanation);
});

showOverlay.addEventListener("change", saveSettings);
showExplanation.addEventListener("change", saveSettings);

function saveSettings() {
  chrome.runtime.sendMessage({
    type: "LOL_ASSISTANT_SET_SETTINGS",
    settings: {
      showOverlay: showOverlay.checked,
      showExplanation: showExplanation.checked
    }
  });
}

analyze.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "LOL_ASSISTANT_ANALYZE_ACTIVE_TAB" });
  window.close();
});
