document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveBtn').addEventListener('click', saveOptions);

function saveOptions() {
    const provider = document.getElementById('provider').value;
    const resume = document.getElementById('resume').value;

    const statusEl = document.getElementById('statusMessage');
    const loader = document.querySelector('.loader');
    const btnText = document.querySelector('#saveBtn span');
    const saveButton = document.getElementById('saveBtn');

    statusEl.textContent = '';
    statusEl.className = 'status';
    saveButton.disabled = true;
    btnText.textContent = 'Saving profile';
    document.querySelector('.button-arrow').classList.add('hidden');
    loader.classList.remove('hidden');

    chrome.storage.local.set({
        applyAiProvider: provider,
        applyAiResume: resume
    }, () => {
        loader.classList.add('hidden');
        saveButton.disabled = false;
        btnText.textContent = 'Save profile';
        document.querySelector('.button-arrow').classList.remove('hidden');

        if (chrome.runtime.lastError) {
            statusEl.textContent = 'Could not save. Please try again.';
            statusEl.className = 'status error';
            return;
        }

        statusEl.textContent = 'Profile saved.';
        statusEl.className = 'status success';
    });
}

function restoreOptions() {
    chrome.storage.local.get(['applyAiProvider', 'applyAiResume'], (result) => {
        if (chrome.runtime.lastError) {
            const statusEl = document.getElementById('statusMessage');
            statusEl.textContent = 'Could not load your saved profile.';
            statusEl.className = 'status error';
            return;
        }

        if (result.applyAiProvider) {
            document.getElementById('provider').value = result.applyAiProvider;
        }
        if (result.applyAiResume) {
            document.getElementById('resume').value = result.applyAiResume;
        }
    });
}
