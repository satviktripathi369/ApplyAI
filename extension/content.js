// ============================================
// ApplyAI v2 — Content Script
// ============================================

let currentAnswers = {}; // stores { fieldId: { value, confidence } }

// ---- FAB INJECTION ----
function injectFAB() {
    if (document.getElementById('applyai-fab-container')) return;

    const container = document.createElement('div');
    container.className = 'applyai-fab-container';
    container.id = 'applyai-fab-container';

    // Tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'applyai-tooltip';
    tooltip.textContent = 'Autofill with ApplyAI ✨';
    container.appendChild(tooltip);

    // JD Bar (hidden by default)
    const jdBar = buildJDBar();
    jdBar.style.display = 'none';
    container.appendChild(jdBar);

    // FAB
    const fab = document.createElement('button');
    fab.className = 'applyai-fab';
    fab.id = 'applyai-fab';
    fab.innerHTML = '✨';

    // Field count badge
    const badge = document.createElement('span');
    badge.className = 'applyai-badge';
    badge.id = 'applyai-badge';
    fab.appendChild(badge);

    fab.addEventListener('click', () => {
        const jdBar = document.getElementById('applyai-jd-bar');
        if (jdBar.style.display === 'none') {
            // First click: show JD bar
            const count = extractFields().length;
            badge.textContent = count;
            jdBar.style.display = 'flex';
            tooltip.textContent = 'Paste the Job Description for better answers';
        } else {
            // Second click: hide JD bar (skip JD)
            jdBar.style.display = 'none';
            tooltip.textContent = 'Autofill with ApplyAI ✨';
        }
    });

    container.appendChild(fab);
    document.body.appendChild(container);

    // Set badge on load
    requestAnimationFrame(() => {
        const count = extractFields().length;
        badge.textContent = count;
    });
}

// ---- JD BAR ----
function buildJDBar() {
    const bar = document.createElement('div');
    bar.className = 'applyai-jd-bar';
    bar.id = 'applyai-jd-bar';

    const label = document.createElement('label');
    label.textContent = '📋 Job Description (optional)';
    bar.appendChild(label);

    const textarea = document.createElement('textarea');
    textarea.id = 'applyai-jd-textarea';
    textarea.placeholder = 'Paste the job description here for a tailored, role-specific autofill...';
    bar.appendChild(textarea);

    const actions = document.createElement('div');
    actions.className = 'applyai-jd-bar-actions';

    const dashBtn = document.createElement('button');
    dashBtn.className = 'applyai-btn applyai-btn-ghost';
    dashBtn.textContent = '📊 Dashboard';
    dashBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'openDashboard' });
    });

    const skipBtn = document.createElement('button');
    skipBtn.className = 'applyai-btn applyai-btn-ghost';
    skipBtn.textContent = 'Skip JD';
    skipBtn.addEventListener('click', () => triggerAutofill(''));

    const goBtn = document.createElement('button');
    goBtn.className = 'applyai-btn applyai-btn-primary';
    goBtn.textContent = '✨ Autofill';
    goBtn.addEventListener('click', () => {
        const jd = document.getElementById('applyai-jd-textarea')?.value || '';
        triggerAutofill(jd);
    });

    actions.appendChild(dashBtn);
    actions.appendChild(skipBtn);
    actions.appendChild(goBtn);
    bar.appendChild(actions);
    return bar;
}

// ---- FIELD EXTRACTION ----
function extractFields() {
    const fields = [];
    const inputs = document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea:not(#applyai-jd-textarea), select'
    );

    inputs.forEach((input, index) => {
        if (!input.id) {
            input.id = `applyai-gen-id-${index}`;
        }

        let labelText = '';
        const label = document.querySelector(`label[for="${input.id}"]`);
        if (label) labelText = label.innerText;
        if (!labelText && input.closest('label')) {
            labelText = input.closest('label').innerText;
        }
        // Try aria-label as fallback
        if (!labelText && input.getAttribute('aria-label')) {
            labelText = input.getAttribute('aria-label');
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

// ---- TRIGGER AUTOFILL ----
function isContextValid() {
    try {
        return typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;
    } catch (e) {
        return false;
    }
}

function triggerAutofill(jobDescription) {
    if (!isContextValid()) {
        alert('ApplyAI extension was updated or reloaded.\n\nPlease refresh this webpage (F5) to use ApplyAI.');
        return;
    }

    const fab = document.getElementById('applyai-fab');
    const tooltip = document.querySelector('.applyai-tooltip');
    const jdBar = document.getElementById('applyai-jd-bar');

    jdBar.style.display = 'none';

    chrome.storage.local.get(['applyAiProvider', 'applyAiResume'], (data) => {
        if (!data.applyAiResume) {
            alert('Please configure your ApplyAI Master Profile in the extension options first.\n\nRight-click the extension icon → Options.');
            return;
        }

        // Loading state
        const badge = document.getElementById('applyai-badge');
        fab.classList.add('loading');
        fab.innerHTML = '⏳';
        if (badge) fab.appendChild(badge);
        tooltip.textContent = jobDescription ? 'Tailoring to job description...' : 'Analyzing resume...';

        const fields = extractFields();

        chrome.runtime.sendMessage({
            action: 'autofill',
            payload: {
                fields,
                resume_text: data.applyAiResume,
                provider: data.applyAiProvider || 'gemini',
                job_description: jobDescription || null
            }
        }, (response) => {
            fab.classList.remove('loading');
            const badge = document.getElementById('applyai-badge');

            if (response && response.success) {
                currentAnswers = response.data.answers;
                showReviewPanel(fields, currentAnswers);

                fab.classList.add('success');
                fab.innerHTML = '✓';
                if (badge) fab.appendChild(badge);
                tooltip.textContent = 'Review & Apply →';
            } else {
                fab.innerHTML = '⚠️';
                if (badge) fab.appendChild(badge);
                tooltip.textContent = 'Error — check console';
                console.error('ApplyAI Error:', response?.error);

                setTimeout(() => {
                    fab.innerHTML = '✨';
                    if (badge) fab.appendChild(badge);
                    tooltip.textContent = 'Autofill with ApplyAI ✨';
                    fab.classList.remove('success');
                }, 3000);
            }
        });
    });
}

// ---- REVIEW PANEL ----
function showReviewPanel(fields, answers) {
    // Remove old panel if exists
    document.getElementById('applyai-overlay')?.remove();
    document.getElementById('applyai-panel')?.remove();

    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'applyai-panel-overlay';
    overlay.id = 'applyai-overlay';
    overlay.addEventListener('click', closePanel);
    document.body.appendChild(overlay);

    // Panel
    const panel = document.createElement('div');
    panel.className = 'applyai-panel';
    panel.id = 'applyai-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'applyai-panel-header';

    const titleWrap = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'applyai-panel-title';
    title.innerHTML = '✨ Review Answers';
    const subtitle = document.createElement('div');
    subtitle.className = 'applyai-panel-subtitle';

    const highCount = Object.values(answers).filter(a => a.confidence === 'high').length;
    const total = Object.keys(answers).length;
    subtitle.textContent = `${highCount}/${total} fields with high confidence`;
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'applyai-panel-close';
    closeBtn.innerHTML = '✕';
    closeBtn.addEventListener('click', closePanel);

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Body — one card per field
    const body = document.createElement('div');
    body.className = 'applyai-panel-body';

    fields.forEach(field => {
        const answer = answers[field.id];
        if (!answer) return;

        // Skip file fields (just shown as info), skip hidden/submit
        if (field.type === 'file') {
            const card = buildFileCard(field, answer);
            body.appendChild(card);
            return;
        }
        if (field.type === 'submit' || field.type === 'button') return;
        if (!answer.value && answer.confidence === 'low') return; // Skip empty low-conf

        const card = buildFieldCard(field, answer);
        body.appendChild(card);
    });

    panel.appendChild(body);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'applyai-panel-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'applyai-btn applyai-btn-ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.flex = '0 0 90px';
    cancelBtn.addEventListener('click', closePanel);

    const applyBtn = document.createElement('button');
    applyBtn.className = 'applyai-btn applyai-btn-primary';
    applyBtn.textContent = '✓ Apply to Form';
    applyBtn.addEventListener('click', () => {
        collectEditsAndFill(fields);
        closePanel();
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(applyBtn);
    panel.appendChild(footer);

    document.body.appendChild(panel);
}

function buildFieldCard(field, answer) {
    const card = document.createElement('div');
    card.className = 'applyai-field-card';

    const meta = document.createElement('div');
    meta.className = 'applyai-field-meta';

    const labelEl = document.createElement('div');
    labelEl.className = 'applyai-field-label';
    labelEl.textContent = field.label || field.placeholder || field.name || field.id;
    labelEl.title = field.label || field.id;

    const conf = document.createElement('div');
    conf.className = `applyai-confidence ${answer.confidence}`;
    const dot = answer.confidence === 'high' ? '🟢' : answer.confidence === 'medium' ? '🟡' : '🔴';
    conf.textContent = `${dot} ${answer.confidence}`;

    meta.appendChild(labelEl);
    meta.appendChild(conf);
    card.appendChild(meta);

    // Editable textarea for the value
    const inputEl = document.createElement('textarea');
    inputEl.className = 'applyai-field-input';
    inputEl.dataset.fieldId = field.id;
    inputEl.value = answer.value;
    inputEl.rows = answer.value && answer.value.length > 80 ? 5 : 2;

    card.appendChild(inputEl);
    return card;
}

function buildFileCard(field, answer) {
    const card = document.createElement('div');
    card.className = 'applyai-field-card';
    card.style.opacity = '0.7';

    const meta = document.createElement('div');
    meta.className = 'applyai-field-meta';

    const labelEl = document.createElement('div');
    labelEl.className = 'applyai-field-label';
    labelEl.textContent = `📎 ${field.label || 'File Upload'} — cover letter will be generated`;

    meta.appendChild(labelEl);
    card.appendChild(meta);
    return card;
}

function closePanel() {
    document.getElementById('applyai-overlay')?.remove();
    document.getElementById('applyai-panel')?.remove();

    const fab = document.getElementById('applyai-fab');
    const badge = document.getElementById('applyai-badge');
    if (fab) {
        fab.classList.remove('success');
        fab.innerHTML = '✨';
        if (badge) fab.appendChild(badge);
        document.querySelector('.applyai-tooltip').textContent = 'Autofill with ApplyAI ✨';
    }
}

// ---- COLLECT EDITS & FILL ----
function collectEditsAndFill(fields) {
    // Merge user edits from the panel back into answers
    const editedAnswers = { ...currentAnswers };

    document.querySelectorAll('.applyai-field-input[data-field-id]').forEach(input => {
        const id = input.dataset.fieldId;
        if (editedAnswers[id]) {
            editedAnswers[id] = { ...editedAnswers[id], value: input.value };
        }
    });

    // Build a flat value map for fill
    const flatAnswers = {};
    for (const [id, answer] of Object.entries(editedAnswers)) {
        flatAnswers[id] = answer.value;
    }

    fillFields(flatAnswers, editedAnswers);
    logApplication(fields, flatAnswers, editedAnswers);
}

function logApplication(fields, flatAnswers, confidenceMap) {
    let company = location.hostname.replace('www.', '').split('.')[0];
    if (company) company = company.charAt(0).toUpperCase() + company.slice(1);
    
    const h1 = document.querySelector('h1')?.innerText?.trim();
    const role = h1 || document.title?.trim() || 'Job Application';

    const confValues = Object.values(confidenceMap || {}).map(c => c.confidence);
    const highConf = confValues.filter(c => c === 'high').length;
    const totalConf = confValues.length || 1;
    const matchScore = Math.round((highConf / totalConf) * 100);

    const appRecord = {
        id: 'app_' + Date.now(),
        company: company || 'Company',
        role: role,
        url: location.href,
        date: new Date().toISOString(),
        status: 'Applied',
        matchScore: matchScore,
        fieldsCount: Object.keys(flatAnswers).length
    };

    chrome.storage.local.get(['applyAiApplications'], (res) => {
        const apps = res.applyAiApplications || [];
        apps.unshift(appRecord);
        chrome.storage.local.set({ applyAiApplications: apps });
    });
}

// ---- FILL FIELDS ----
function fillFields(flatAnswers, confidenceMap) {
    for (const [id, value] of Object.entries(flatAnswers)) {
        if (value === undefined || value === null) continue;

        const element = document.getElementById(id);
        if (!element) continue;

        try {
            if (element.type === 'file') {
                if (value && value.startsWith('data:')) {
                    const arr = value.split(',');
                    const mime = arr[0].match(/:(.*?);/)[1];
                    const bstr = atob(arr[1]);
                    let n = bstr.length;
                    const u8arr = new Uint8Array(n);
                    while (n--) u8arr[n] = bstr.charCodeAt(n);

                    const file = new File([u8arr], 'Cover_Letter.docx', { type: mime });
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    element.files = dt.files;

                    // Preview link
                    const previewLink = document.createElement('a');
                    previewLink.href = URL.createObjectURL(file);
                    previewLink.download = 'Cover_Letter.docx';
                    previewLink.textContent = '🔍 Preview generated cover letter';
                    previewLink.style.cssText = 'display:block;font-size:12px;color:#3b82f6;margin-top:6px;';
                    element.parentNode?.querySelectorAll('a[download]').forEach(a => a.remove());
                    element.parentNode?.insertBefore(previewLink, element.nextSibling);
                }
                element.dispatchEvent(new Event('change', { bubbles: true }));

            } else if (element.type === 'checkbox' || element.type === 'radio') {
                const strVal = value.toString().toLowerCase();
                if (strVal === 'true' || strVal === 'yes' || strVal === element.value?.toLowerCase()) {
                    element.checked = true;
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                }

            } else {
                if (!value) continue;
                element.value = value;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Inject confidence dot on the page
            if (confidenceMap && confidenceMap[id]) {
                injectConfidenceDot(element, confidenceMap[id].confidence);
            }

        } catch (e) {
            console.warn(`ApplyAI: Could not fill field ${id}:`, e);
        }
    }
}

// ---- CONFIDENCE DOT ----
function injectConfidenceDot(element, confidence) {
    // Remove existing dot
    element.parentNode?.querySelector('.applyai-dot')?.remove();

    const dot = document.createElement('span');
    dot.className = `applyai-dot ${confidence}`;
    dot.title = `ApplyAI confidence: ${confidence}`;

    // Insert after element
    element.insertAdjacentElement('afterend', dot);
}

// ---- INIT ----
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectFAB);
} else {
    injectFAB();
}
