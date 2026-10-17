// ApplyAI Background Script

chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;

    try {
        await chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ['content.css']
        });
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });
    } catch (error) {
        console.error('ApplyAI could not be enabled on this page:', error);
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'autofill') {
        
        // We use a local development URL for the MVP.
        // In production, this would point to the deployed FastAPI server.
        const apiUrl = 'http://127.0.0.1:8000/api/autofill';

        fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request.payload)
        })
        .then(response => {
            if (!response.ok) {
                return response.json()
                    .catch(() => ({}))
                    .then(body => {
                        const message = typeof body.detail === 'string'
                            ? body.detail
                            : `ApplyAI backend returned HTTP ${response.status}.`;
                        throw new Error(message);
                    });
            }
            return response.json();
        })
        .then(data => {
            sendResponse({ success: true, data: data });
        })
        .catch(error => {
            console.error('ApplyAI Backend Error:', error);
            sendResponse({ success: false, error: error.message });
        });

        // Return true to indicate we will send a response asynchronously
        return true; 
    }
});
