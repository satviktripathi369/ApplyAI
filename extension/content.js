// ApplyAI Content Script
function injectFAB() {
    // Prevent multiple injections
    if (document.getElementById('applyai-fab')) return;

    const container = document.createElement('div');
    container.className = 'applyai-fab-container';
    container.id = 'applyai-fab-container';

    const tooltip = document.createElement('div');
    tooltip.className = 'applyai-tooltip';
    tooltip.textContent = 'Autofill with ApplyAI ✨';

    const fab = document.createElement('button');
    fab.className = 'applyai-fab';
    fab.id = 'applyai-fab';
    fab.innerHTML = '✨';

    fab.addEventListener('click', handleAutofill);

    container.appendChild(tooltip);
    container.appendChild(fab);
    document.body.appendChild(container);
}

function extractFields() {
    const fields = [];
    // Select common input types that need filling
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select');

    inputs.forEach((input, index) => {
        // Ensure the input has a unique identifier for mapping later
        if (!input.id) {
            input.id = `applyai-gen-id-${index}`;
        }

        let labelText = '';
        // Check for associated label via 'id'
        if (input.id) {
            const label = document.querySelector(`label[for="${input.id}"]`);
            if (label) labelText = label.innerText;
        }

        // If no explicit label, check if input is nested inside a label
        if (!labelText && input.closest('label')) {
            labelText = input.closest('label').innerText;
        }

        fields.push({
            id: input.id,
            type: input.type || input.tagName.toLowerCase(),
            name: input.name || '',
            placeholder: input.placeholder || '',
            label: labelText.trim()
        });
    });

    return fields;
}

function handleAutofill() {
    const fab = document.getElementById('applyai-fab');
    const tooltip = document.querySelector('.applyai-tooltip');
    
    // Check storage first
    chrome.storage.local.get(['applyAiProvider', 'applyAiResume'], (data) => {
        if (!data.applyAiResume) {
            alert('Please configure your ApplyAI Master Profile in the extension options first.');
            return;
        }

        // Start loading state
        fab.classList.add('loading');
        fab.innerHTML = '⏳';
        tooltip.textContent = 'Analyzing and generating...';

        const fields = extractFields();

        // Send to background script
        chrome.runtime.sendMessage({
            action: 'autofill',
            payload: {
                fields: fields,
                resume_text: data.applyAiResume,
                provider: data.applyAiProvider || 'openai'
            }
        }, (response) => {
            fab.classList.remove('loading');
            
            if (response && response.success) {
                fillFields(response.data.answers);
                fab.classList.add('success');
                fab.innerHTML = '✓';
                tooltip.textContent = 'Filled successfully!';
                
                setTimeout(() => {
                    fab.classList.remove('success');
                    fab.innerHTML = '✨';
                    tooltip.textContent = 'Autofill with ApplyAI ✨';
                }, 3000);
            } else {
                fab.innerHTML = '⚠️';
                tooltip.textContent = 'Error occurred';
                console.error("ApplyAI Error:", response?.error);
                alert("ApplyAI failed to generate answers. Check console for details.");
                
                setTimeout(() => {
                    fab.innerHTML = '✨';
                    tooltip.textContent = 'Autofill with ApplyAI ✨';
                }, 3000);
            }
        });
    });
}

function fillFields(answers) {
    for (const [id, value] of Object.entries(answers)) {
        if (!value) continue; // Skip empty answers

        const element = document.getElementById(id);
        if (element) {
            try {
                if (element.type === 'file') {
                    if (value.startsWith('data:')) {
                        // It's a base64 encoded file from our backend
                        const arr = value.split(',');
                        const mime = arr[0].match(/:(.*?);/)[1];
                        const bstr = atob(arr[1]);
                        let n = bstr.length;
                        const u8arr = new Uint8Array(n);
                        while (n--) {
                            u8arr[n] = bstr.charCodeAt(n);
                        }
                        const file = new File([u8arr], "Cover_Letter.docx", {type: mime});
                        const dataTransfer = new DataTransfer();
                        dataTransfer.items.add(file);
                        element.files = dataTransfer.files;

                        // Create a small preview download link so the user can check what was generated
                        const previewLink = document.createElement('a');
                        previewLink.href = URL.createObjectURL(file);
                        previewLink.download = "Cover_Letter.docx";
                        previewLink.textContent = "🔍 Preview generated cover letter";
                        previewLink.style.display = "block";
                        previewLink.style.fontSize = "13px";
                        previewLink.style.color = "#3b82f6";
                        previewLink.style.marginTop = "6px";
                        
                        // Avoid duplicating the link if they click autofill multiple times
                        if(element.nextSibling && element.nextSibling.textContent.includes("Preview generated")) {
                            element.parentNode.removeChild(element.nextSibling);
                        }
                        element.parentNode.insertBefore(previewLink, element.nextSibling);
                    }
                    // Dispatch change event for file
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                    continue;
                }
                
                if (element.type === 'checkbox' || element.type === 'radio') {
                    const strVal = value.toString().toLowerCase();
                    if (strVal === 'true' || strVal === 'yes' || strVal === element.value.toLowerCase()) {
                        element.checked = true;
                    }
                } else {
                    element.value = value;
                }
                
                // Dispatch events to trigger any frontend frameworks (React/Angular) state updates
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (e) {
                console.warn(`ApplyAI: Could not fill field ${id}:`, e);
            }
        }
    }
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectFAB);
} else {
    injectFAB();
}
