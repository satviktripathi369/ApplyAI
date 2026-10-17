var MAX_FORM_FIELDS = 100;

function injectFAB() {
    if (document.getElementById('applyai-fab')) return;

    const container = document.createElement('div');
    container.className = 'applyai-fab-container';
    container.id = 'applyai-fab-container';

    const tooltip = document.createElement('div');
    tooltip.className = 'applyai-tooltip';
    tooltip.textContent = 'Review answers with ApplyAI';
    tooltip.setAttribute('role', 'status');
    tooltip.setAttribute('aria-live', 'polite');

    const fab = document.createElement('button');
    fab.className = 'applyai-fab';
    fab.id = 'applyai-fab';
    fab.textContent = 'AI';
    fab.setAttribute('aria-label', 'Generate and review answers with ApplyAI');
    fab.addEventListener('click', handleAutofill);

    container.append(tooltip, fab);
    document.body.appendChild(container);
}

function getVisibleLabel(input) {
    const labels = input.labels ? Array.from(input.labels) : [];
    const labelledBy = (input.getAttribute('aria-labelledby') || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id))
        .filter(Boolean);
    const label = [
        ...labels.map((node) => node.innerText || node.textContent),
        ...labelledBy.map((node) => node.innerText || node.textContent),
        input.getAttribute('aria-label'),
        input.closest('label')?.innerText
    ].find((value) => value && value.trim());

    return (label || '').trim().slice(0, 2048);
}

function ensureUniqueId(input, index) {
    const duplicate = input.id && Array.from(document.querySelectorAll('[id]'))
        .some((element) => element !== input && element.id === input.id);
    if (input.id && !duplicate) return input.id;

    let id;
    do {
        id = `applyai-field-${index}-${Math.random().toString(36).slice(2, 8)}`;
    } while (document.getElementById(id));
    input.id = id;
    return id;
}

function isVisibleAndEditable(input) {
    if (input.disabled || input.readOnly || input.type === 'hidden') return false;
    if (input.closest('[hidden], [aria-hidden="true"]')) return false;
    if (input.getClientRects().length > 0) return true;

    if (input.type === 'file' && input.labels) {
        return Array.from(input.labels).some((label) => label.getClientRects().length > 0);
    }
    return false;
}

function getFieldChoices(input) {
    if (input instanceof HTMLSelectElement) {
        return Array.from(input.options)
            .filter((option) => option.value && !option.disabled)
            .map((option) => option.text.trim())
            .filter(Boolean)
            .slice(0, 50);
    }

    if (input instanceof HTMLInputElement && ['radio', 'checkbox'].includes(input.type) && input.name) {
        const group = Array.from(document.querySelectorAll('input'))
            .filter((candidate) => candidate.name === input.name && candidate.type === input.type);
        return group.map((candidate) => getVisibleLabel(candidate) || candidate.value)
            .filter(Boolean)
            .slice(0, 50);
    }
    return [];
}

function extractFields() {
    const visibleControls = Array.from(document.querySelectorAll('input, textarea, select'))
        .filter(isVisibleAndEditable);
    const truncated = visibleControls.length > MAX_FORM_FIELDS;
    const controls = visibleControls.slice(0, MAX_FORM_FIELDS);

    return {
        fields: controls.map((input, index) => ({
            id: ensureUniqueId(input, index),
            type: input.type || input.tagName.toLowerCase(),
            name: (input.name || '').slice(0, 512),
            placeholder: (input.placeholder || '').slice(0, 2048),
            label: getVisibleLabel(input),
            options: getFieldChoices(input)
        })),
        truncated
    };
}

function setFabState(fab, tooltip, { text, message, loading = false, success = false }) {
    fab.textContent = text;
    fab.classList.toggle('loading', loading);
    fab.classList.toggle('success', success);
    tooltip.textContent = message;
}

function handleAutofill() {
    const fab = document.getElementById('applyai-fab');
    const tooltip = document.querySelector('.applyai-tooltip');
    if (!fab || fab.classList.contains('loading')) return;

    chrome.storage.local.get(['applyAiProvider', 'applyAiResume'], (data) => {
        if (chrome.runtime.lastError) {
            setFabState(fab, tooltip, { text: '!', message: 'Could not read your profile' });
            return;
        }
        if (!data.applyAiResume) {
            setFabState(fab, tooltip, { text: '!', message: 'Add your resume in ApplyAI settings first' });
            return;
        }

        const { fields, truncated } = extractFields();
        if (!fields.length) {
            setFabState(fab, tooltip, { text: '!', message: 'No visible, editable fields found' });
            return;
        }

        setFabState(fab, tooltip, {
            text: '...',
            message: 'Preparing suggestions for review',
            loading: true
        });

        chrome.runtime.sendMessage({
            action: 'autofill',
            payload: {
                fields,
                resume_text: data.applyAiResume,
                provider: data.applyAiProvider || 'openai'
            }
        }, (response) => {
            fab.classList.remove('loading');
            if (chrome.runtime.lastError || !response?.success) {
                const errorMessage = chrome.runtime.lastError?.message
                    || response?.error
                    || 'Check the backend and provider settings.';
                console.error('ApplyAI Error:', errorMessage);
                setFabState(fab, tooltip, {
                    text: '!',
                    message: errorMessage
                });
                return;
            }

            setFabState(fab, tooltip, {
                text: 'AI',
                message: 'Review your suggestions before applying'
            });
            openReviewPanel(
                fields,
                response.data.answers || {},
                response.data.evidence || {},
                fab,
                tooltip,
                truncated
            );
        });
    });
}

function createReviewNode(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function openReviewPanel(fields, answers, evidence, fab, tooltip, truncated) {
    document.getElementById('applyai-review-root')?.remove();

    const root = document.createElement('div');
    root.id = 'applyai-review-root';
    root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:block;visibility:visible';
    const shadow = root.attachShadow({ mode: 'open' });
    const style = createReviewStyles();
    shadow.appendChild(style);

    const backdrop = createReviewNode('div', 'backdrop');
    const dialog = createReviewNode('section', 'dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'review-title');

    const header = createReviewNode('header', 'header');
    const headingGroup = createReviewNode('div', 'heading-group');
    headingGroup.append(
        createReviewNode('p', 'eyebrow', 'APPLYAI / REVIEW'),
        createReviewNode('h2', '', 'Your answers, your call')
    );
    const closeButton = createReviewNode('button', 'close-button', '×');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close answer review');
    header.append(headingGroup, closeButton);
    dialog.appendChild(header);

    const title = headingGroup.querySelector('h2');
    title.id = 'review-title';
    const introText = truncated
        ? 'This form has more than 100 visible fields; only the first 100 are shown. Edit suggestions, include only what looks right, then apply. Resume quotes are clues, not guarantees—verify sensitive answers yourself.'
        : 'Edit suggestions, include only what looks right, then apply. Resume quotes are clues, not guarantees—verify sensitive answers yourself.';
    const intro = createReviewNode('p', 'intro', introText);
    dialog.appendChild(intro);

    const list = createReviewNode('div', 'answer-list');
    const controls = [];

    fields.forEach((field, index) => {
        const answer = typeof answers[field.id] === 'string' ? answers[field.id] : '';
        const source = typeof evidence[field.id] === 'string' ? evidence[field.id] : '';
        const isFile = field.type.toLowerCase() === 'file';
        const isDocument = isFile && answer.startsWith('data:');
        const hasAnswer = Boolean(answer);
        const card = createReviewNode('article', 'answer-card');
        const top = createReviewNode('div', 'card-top');
        const fieldName = field.label || field.name || field.placeholder || `Form field ${index + 1}`;
        const label = createReviewNode('div', 'field-label', fieldName);
        const type = createReviewNode('span', 'field-type', field.type.toUpperCase());
        top.append(label, type);

        const editorLabel = createReviewNode('label', 'answer-label', 'SUGGESTED ANSWER');
        const editorId = `applyai-answer-${index}`;
        editorLabel.htmlFor = editorId;
        let editor;

        if (isDocument) {
            editor = createReviewNode('a', 'document-link', 'Open generated document preview ↗');
            editor.href = answer;
            editor.download = 'ApplyAI_Cover_Letter.docx';
            editor.target = '_blank';
            editor.rel = 'noopener';
            editor.id = editorId;
        } else {
            editor = createReviewNode(isFile ? 'input' : 'textarea', 'answer-editor');
            editor.id = editorId;
            editor.setAttribute('aria-label', `Suggested answer for ${fieldName}`);
            editor.value = answer;
            if (isFile) {
                editor.type = 'text';
                editor.placeholder = 'No document suggestion was generated.';
            } else {
                editor.rows = Math.min(5, Math.max(2, answer.split('\n').length));
                editor.placeholder = 'No answer found in your profile.';
            }
        }

        const sourceBlock = createReviewNode('div', source ? 'source' : 'source missing');
        sourceBlock.appendChild(createReviewNode('span', 'source-label', source ? 'FROM YOUR RESUME' : 'NO EXACT RESUME QUOTE'));
        sourceBlock.appendChild(createReviewNode(
            'p',
            '',
            source || 'Review this carefully. ApplyAI could not verify an exact supporting excerpt.'
        ));

        const includeLabel = createReviewNode('label', 'include-option');
        const checkbox = createReviewNode('input', '');
        checkbox.type = 'checkbox';
        checkbox.checked = Boolean(hasAnswer && source && !isDocument);
        checkbox.disabled = !hasAnswer;
        const includeText = createReviewNode('span', '', hasAnswer ? 'Include this answer' : 'No answer suggested');
        includeLabel.append(checkbox, includeText);
        card.append(top, editorLabel, editor, sourceBlock, includeLabel);
        list.appendChild(card);

        controls.push({
            checkbox,
            editor,
            field,
            answer,
            isDocument
        });
    });

    const footer = createReviewNode('footer', 'footer');
    const selectedCount = createReviewNode('span', 'selection-count');
    const applyButton = createReviewNode('button', 'apply-button', 'Apply selected answers');
    applyButton.type = 'button';
    footer.append(selectedCount, applyButton);
    dialog.append(list, footer);
    backdrop.appendChild(dialog);
    shadow.appendChild(backdrop);
    document.body.appendChild(root);

    const updateSelectionCount = () => {
        const count = controls.filter((control) => control.checkbox.checked).length;
        selectedCount.textContent = `${count} SELECTED`;
        applyButton.disabled = count === 0;
    };
    controls.forEach(({ checkbox }) => checkbox.addEventListener('change', updateSelectionCount));
    updateSelectionCount();

    const close = () => {
        root.remove();
        document.removeEventListener('keydown', handleKeydown, true);
        fab.focus();
    };
    closeButton.addEventListener('click', close);
    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) close();
    });
    const handleKeydown = (event) => {
        if (event.key === 'Escape') {
            close();
            document.removeEventListener('keydown', handleKeydown, true);
        }
    };
    document.addEventListener('keydown', handleKeydown, true);

    applyButton.addEventListener('click', () => {
        const selectedAnswers = {};
        controls.forEach((control) => {
            if (!control.checkbox.checked) return;
            selectedAnswers[control.field.id] = control.isDocument
                ? control.answer
                : control.editor.value;
        });

        const result = fillFields(selectedAnswers);
        close();
        setFabState(fab, tooltip, {
            text: result.skipped ? '!' : '✓',
            message: result.skipped
                ? `Filled ${result.filled}; ${result.skipped} need manual attention`
                : `Applied ${result.filled} reviewed answer${result.filled === 1 ? '' : 's'}`,
            success: result.skipped === 0 && result.filled > 0
        });
    });

    closeButton.focus();
}

function createReviewStyles() {
    const style = document.createElement('style');
    style.textContent = `
        :host { all: initial; color-scheme: light; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
        *, *::before, *::after { box-sizing: border-box; }
        .backdrop { position: fixed; inset: 0; z-index: 2147483647; display: flex; justify-content: flex-end; background: rgb(0 0 0 / 45%); }
        .dialog { display: flex; flex-direction: column; width: min(640px, 100%); height: 100%; padding: 26px clamp(18px, 4vw, 40px) 20px; border-left: 1px solid #111; background: #f7f7f4; color: #111; box-shadow: -12px 0 40px rgb(0 0 0 / 15%); }
        .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding-bottom: 17px; border-bottom: 1px solid #111; }
        .eyebrow { margin: 0 0 9px; font: 700 9px/1.4 "Helvetica Neue", Helvetica, Arial, sans-serif; letter-spacing: .13em; }
        h2 { margin: 0; font: 800 clamp(23px, 5vw, 32px)/1 "Helvetica Neue", Helvetica, Arial, sans-serif; letter-spacing: -.06em; }
        .close-button { display: grid; width: 34px; height: 34px; flex: 0 0 34px; place-items: center; border: 1px solid #111; border-radius: 0; background: transparent; color: #111; font: 300 25px/1 Arial, sans-serif; cursor: pointer; }
        .close-button:hover, .close-button:focus-visible { background: #111; color: #fff; outline: none; }
        .intro { margin: 14px 0 18px; color: #555; font: 12px/1.6 "Helvetica Neue", Helvetica, Arial, sans-serif; }
        .answer-list { min-height: 0; flex: 1; overflow: auto; padding: 2px 4px 12px 0; }
        .answer-card { margin-bottom: 13px; padding: 15px; border: 1px solid #c9c9c3; background: #fff; }
        .card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 15px; }
        .field-label { overflow-wrap: anywhere; font: 700 13px/1.4 "Helvetica Neue", Helvetica, Arial, sans-serif; }
        .field-type { flex: 0 0 auto; padding: 4px 6px; border: 1px solid #ccc; color: #666; font: 700 8px/1 "Helvetica Neue", Helvetica, Arial, sans-serif; letter-spacing: .08em; }
        .answer-label, .source-label { display: block; margin-bottom: 7px; color: #666; font: 700 8px/1.4 "Helvetica Neue", Helvetica, Arial, sans-serif; letter-spacing: .1em; }
        .answer-editor { display: block; width: 100%; min-height: 68px; padding: 10px; border: 1px solid #111; border-radius: 0; background: #fff; color: #111; font: 12px/1.5 "Helvetica Neue", Helvetica, Arial, sans-serif; resize: vertical; }
        .answer-editor:focus { outline: 2px solid #111; outline-offset: 2px; }
        .document-link { display: inline-block; padding: 10px 0; color: #111; font: 700 12px/1.5 "Helvetica Neue", Helvetica, Arial, sans-serif; text-underline-offset: 3px; }
        .source { margin-top: 12px; padding: 9px 10px; border-left: 2px solid #111; background: #f3f3ef; }
        .source.missing { border-left-color: #999; }
        .source-label { margin: 0 0 4px; }
        .source p { margin: 0; color: #444; font: 11px/1.5 "Helvetica Neue", Helvetica, Arial, sans-serif; overflow-wrap: anywhere; }
        .include-option { display: inline-flex; align-items: center; gap: 8px; margin-top: 13px; color: #111; font: 600 11px/1.4 "Helvetica Neue", Helvetica, Arial, sans-serif; cursor: pointer; }
        .include-option input { width: 15px; height: 15px; margin: 0; accent-color: #111; }
        .include-option input:disabled + span { color: #999; }
        .footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 14px; border-top: 1px solid #111; }
        .selection-count { color: #666; font: 700 8px/1.4 "Helvetica Neue", Helvetica, Arial, sans-serif; letter-spacing: .12em; }
        .apply-button { min-height: 43px; padding: 0 15px; border: 1px solid #111; border-radius: 0; background: #111; color: #fff; font: 700 11px/1 "Helvetica Neue", Helvetica, Arial, sans-serif; cursor: pointer; }
        .apply-button:hover:not(:disabled) { background: #fff; color: #111; box-shadow: 3px 3px 0 #111; }
        .apply-button:focus-visible { outline: 2px solid #111; outline-offset: 3px; }
        .apply-button:disabled { background: #ccc; border-color: #ccc; color: #666; cursor: not-allowed; }
        @media (max-width: 480px) { .dialog { padding: 18px 14px 14px; } .answer-card { padding: 12px; } }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; } }
    `;
    return style;
}

function fillFields(answers) {
    let filled = 0;
    let skipped = 0;

    for (const [id, value] of Object.entries(answers)) {
        if (!value) {
            skipped += 1;
            continue;
        }

        const element = document.getElementById(id);
        if (!element || !isVisibleAndEditable(element)) {
            skipped += 1;
            continue;
        }

        try {
            if (element.type === 'file') {
                if (!value.startsWith('data:')) {
                    skipped += 1;
                    continue;
                }
                const [metadata, encoded] = value.split(',', 2);
                const mime = metadata.match(/^data:(.*?);base64$/)?.[1];
                if (!mime || !encoded) {
                    skipped += 1;
                    continue;
                }

                const binary = atob(encoded);
                const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
                const file = new File([bytes], 'ApplyAI_Cover_Letter.docx', { type: mime });
                const transfer = new DataTransfer();
                transfer.items.add(file);
                element.files = transfer.files;

                const previewLink = document.createElement('a');
                previewLink.href = URL.createObjectURL(file);
                previewLink.download = file.name;
                previewLink.textContent = 'Open generated document preview';
                previewLink.className = 'applyai-preview-link';
                const previousLink = element.parentNode.querySelector('.applyai-preview-link');
                previousLink?.remove();
                element.insertAdjacentElement('afterend', previewLink);
                element.dispatchEvent(new Event('change', { bubbles: true }));
                filled += 1;
                continue;
            }

            if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) {
                const normalizedAnswer = value.trim().toLowerCase();
                const label = getVisibleLabel(element).toLowerCase();
                const matches = normalizedAnswer === element.value.trim().toLowerCase()
                    || normalizedAnswer === label;
                const isSinglePositive = normalizedAnswer === 'true' || normalizedAnswer === 'yes';
                if (matches || (isSinglePositive && countChoiceGroup(element) === 1)) {
                    element.checked = true;
                } else if (normalizedAnswer === 'false' || normalizedAnswer === 'no') {
                    element.checked = false;
                } else {
                    skipped += 1;
                    continue;
                }
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                filled += 1;
                continue;
            }

            if (element instanceof HTMLSelectElement) {
                const option = Array.from(element.options).find((candidate) =>
                    candidate.value.toLowerCase() === value.trim().toLowerCase()
                    || candidate.text.trim().toLowerCase() === value.trim().toLowerCase()
                );
                if (!option) {
                    skipped += 1;
                    continue;
                }
                setNativeValue(element, option.value);
            } else {
                setNativeValue(element, value);
            }

            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            filled += 1;
        } catch (error) {
            console.warn(`ApplyAI could not apply field ${id}:`, error);
            skipped += 1;
        }
    }
    return { filled, skipped };
}

function countChoiceGroup(element) {
    if (!element.name) return 1;
    return Array.from(document.querySelectorAll('input'))
        .filter((candidate) => candidate.name === element.name && candidate.type === element.type).length;
}

function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (!setter) throw new Error('This field does not support text input');
    setter.call(element, value);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectFAB, { once: true });
} else {
    injectFAB();
}
