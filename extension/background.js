// ApplyAI Background Script

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openDashboard') {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
        }
        return;
    }

    if (request.action === 'autofill') {
        const apiUrl = 'http://127.0.0.1:8000/api/autofill';

        fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request.payload)
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => {
                    throw new Error(err.detail || `HTTP error ${response.status}`);
                });
            }
            return response.json();
        })
        .then(data => sendResponse({ success: true, data }))
        .catch(error => {
            console.error('ApplyAI Backend Error:', error);
            sendResponse({ success: false, error: error.message });
        });

        return true; // Keep message channel open for async response
    }
});
