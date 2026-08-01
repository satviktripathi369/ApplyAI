// ApplyAI Background Script

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
                throw new Error(`HTTP error! status: ${response.status}`);
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
