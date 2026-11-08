document.addEventListener('DOMContentLoaded', () => {
  const interceptToggle = document.getElementById('interceptToggle');
  const grabberToggle = document.getElementById('grabberToggle');

  chrome.storage.local.get(['dpfEnabled', 'grabberEnabled'], (res) => {
    if (res.dpfEnabled !== undefined) interceptToggle.checked = res.dpfEnabled;
    if (res.grabberEnabled !== undefined) grabberToggle.checked = res.grabberEnabled;
  });

  interceptToggle.addEventListener('change', () => {
    chrome.storage.local.set({ dpfEnabled: interceptToggle.checked });
  });

  grabberToggle.addEventListener('change', () => {
    chrome.storage.local.set({ grabberEnabled: grabberToggle.checked });
  });
});
