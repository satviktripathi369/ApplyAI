document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveBtn').addEventListener('click', saveOptions);

function saveOptions() {
    const provider = document.getElementById('provider').value;
    const apiKey = document.getElementById('apiKey').value;
    const resume = document.getElementById('resume').value;

    const statusEl = document.getElementById('statusMessage');
    const loader = document.querySelector('.loader');
    const btnText = document.querySelector('#saveBtn span');

    // UI feedback
    btnText.style.display = 'none';
    loader.classList.remove('hidden');

    chrome.storage.local.set({
        applyAiProvider: provider,
        applyAiApiKey: apiKey,
        applyAiResume: resume
    }, () => {
        // Mock a slight delay for better UX feel
        setTimeout(() => {
            loader.classList.add('hidden');
            btnText.style.display = 'block';
            
            statusEl.textContent = 'Configuration saved securely! ✨';
            statusEl.className = 'status success';
            
            setTimeout(() => {
                statusEl.style.opacity = '0';
            }, 3000);
        }, 600);
    });
}

function restoreOptions() {
    chrome.storage.local.get(['applyAiProvider', 'applyAiApiKey', 'applyAiResume'], (result) => {
        if (result.applyAiProvider) {
            document.getElementById('provider').value = result.applyAiProvider;
        }
        if (result.applyAiApiKey) {
            document.getElementById('apiKey').value = result.applyAiApiKey;
        }
        if (result.applyAiResume) {
            document.getElementById('resume').value = result.applyAiResume;
        }
    });
}
