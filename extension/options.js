// ApplyAI Dashboard SPA Script

document.addEventListener('DOMContentLoaded', () => {
    initTabNavigation();
    initApplicationTracker();
    initResumeVault();
    initAnalytics();
    initSettings();
});

// State Store
let state = {
    applications: [],
    resumes: [],
    activeResumeId: null,
    provider: 'gemini'
};

// ============================================
// 1. TAB NAVIGATION & SPA ROUTING
// ============================================
function initTabNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    const viewTitle = document.getElementById('viewTitle');
    const viewSubtitle = document.getElementById('viewSubtitle');

    const titles = {
        tracker: { title: 'Application Tracker', subtitle: 'Track and manage your automated job applications' },
        resumes: { title: 'Resume Vault', subtitle: 'Manage multiple resume profiles and set active version for autofill' },
        analytics: { title: 'Analytics & Insights', subtitle: 'Track your application efficiency and conversion rates' },
        settings: { title: 'Settings', subtitle: 'Configure default LLM providers and server connections' }
    };

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.dataset.tab;

            navItems.forEach(nav => nav.classList.remove('active'));
            tabContents.forEach(tab => tab.classList.remove('active'));

            item.classList.add('active');
            document.getElementById(`tab-${targetTab}`).classList.add('active');

            if (titles[targetTab]) {
                viewTitle.textContent = titles[targetTab].title;
                viewSubtitle.textContent = titles[targetTab].subtitle;
            }

            if (targetTab === 'analytics') renderAnalytics();
            if (targetTab === 'tracker') renderKanbanBoard();
        });
    });
}

// ============================================
// 2. APPLICATION TRACKER LOGIC
// ============================================
function initApplicationTracker() {
    const addAppBtn = document.getElementById('addAppBtn');
    const appModal = document.getElementById('appModal');
    const closeAppModal = document.getElementById('closeAppModal');
    const cancelAppModal = document.getElementById('cancelAppModal');
    const appForm = document.getElementById('appForm');
    const searchInput = document.getElementById('trackerSearch');
    const filterStatus = document.getElementById('trackerFilterStatus');

    loadApplications();

    addAppBtn.addEventListener('click', () => {
        document.getElementById('modalTitle').textContent = 'Add Job Application';
        document.getElementById('appId').value = '';
        appForm.reset();
        appModal.classList.add('active');
    });

    [closeAppModal, cancelAppModal].forEach(btn => {
        btn.addEventListener('click', () => appModal.classList.remove('active'));
    });

    appForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('appId').value || 'app_' + Date.now();
        const company = document.getElementById('modalCompany').value;
        const role = document.getElementById('modalRole').value;
        const url = document.getElementById('modalUrl').value;
        const status = document.getElementById('modalStatus').value;

        const existingIndex = state.applications.findIndex(a => a.id === id);
        const appItem = {
            id,
            company,
            role,
            url,
            status,
            date: existingIndex >= 0 ? state.applications[existingIndex].date : new Date().toISOString(),
            matchScore: existingIndex >= 0 ? state.applications[existingIndex].matchScore : 85
        };

        if (existingIndex >= 0) {
            state.applications[existingIndex] = appItem;
        } else {
            state.applications.unshift(appItem);
        }

        saveApplications();
        appModal.classList.remove('active');
    });

    searchInput.addEventListener('input', renderKanbanBoard);
    filterStatus.addEventListener('change', renderKanbanBoard);
}

function loadApplications() {
    chrome.storage.local.get(['applyAiApplications'], (res) => {
        state.applications = res.applyAiApplications || [];
        renderKanbanBoard();
        renderAnalytics();
    });
}

function saveApplications() {
    chrome.storage.local.set({ applyAiApplications: state.applications }, () => {
        renderKanbanBoard();
        renderAnalytics();
    });
}

function renderKanbanBoard() {
    const statuses = ['Applied', 'Screening', 'Interview', 'Offer', 'Rejected'];
    const searchTerm = document.getElementById('trackerSearch').value.toLowerCase();
    const statusFilter = document.getElementById('trackerFilterStatus').value;

    // Reset columns
    statuses.forEach(s => {
        document.getElementById(`cards-${s}`).innerHTML = '';
        document.getElementById(`count-${s}`).textContent = '0';
    });

    const counts = { Applied: 0, Screening: 0, Interview: 0, Offer: 0, Rejected: 0 };

    state.applications.forEach(app => {
        if (statusFilter !== 'all' && app.status !== statusFilter) return;
        if (searchTerm && !app.company.toLowerCase().includes(searchTerm) && !app.role.toLowerCase().includes(searchTerm)) return;

        if (counts[app.status] !== undefined) counts[app.status]++;

        const card = document.createElement('div');
        card.className = 'app-card';
        card.draggable = true;
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', app.id);
        });

        const dateStr = new Date(app.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        card.innerHTML = `
            <div class="app-card-header">
                <div>
                    <div class="company-name">${escapeHtml(app.company)}</div>
                    <div class="role-title">${escapeHtml(app.role)}</div>
                </div>
                <span class="match-score-pill">${app.matchScore || 85}% Match</span>
            </div>
            <div class="app-card-footer">
                <span class="app-date">${dateStr}</span>
                <div class="card-actions">
                    ${app.url ? `<a href="${escapeHtml(app.url)}" target="_blank" class="card-action-btn" title="Open Job Page">🔗</a>` : ''}
                    <button class="card-action-btn edit-app-btn" title="Edit">✏️</button>
                    <button class="card-action-btn delete-app-btn" title="Delete">🗑️</button>
                </div>
            </div>
        `;

        card.querySelector('.edit-app-btn').addEventListener('click', () => openEditAppModal(app));
        card.querySelector('.delete-app-btn').addEventListener('click', () => deleteApp(app.id));

        const container = document.getElementById(`cards-${app.status}`);
        if (container) container.appendChild(card);
    });

    statuses.forEach(s => {
        document.getElementById(`count-${s}`).textContent = counts[s] || 0;
        const column = document.querySelector(`.kanban-column[data-status="${s}"]`);
        
        column.addEventListener('dragover', (e) => e.preventDefault());
        column.addEventListener('drop', (e) => {
            e.preventDefault();
            const appId = e.dataTransfer.getData('text/plain');
            updateAppStatus(appId, s);
        });
    });
}

function updateAppStatus(id, newStatus) {
    const app = state.applications.find(a => a.id === id);
    if (app) {
        app.status = newStatus;
        saveApplications();
    }
}

function openEditAppModal(app) {
    document.getElementById('modalTitle').textContent = 'Edit Job Application';
    document.getElementById('appId').value = app.id;
    document.getElementById('modalCompany').value = app.company;
    document.getElementById('modalRole').value = app.role;
    document.getElementById('modalUrl').value = app.url || '';
    document.getElementById('modalStatus').value = app.status;
    document.getElementById('appModal').classList.add('active');
}

function deleteApp(id) {
    if (confirm('Are you sure you want to remove this application from tracker?')) {
        state.applications = state.applications.filter(a => a.id !== id);
        saveApplications();
    }
}

// ============================================
// 3. RESUME VAULT LOGIC
// ============================================
function initResumeVault() {
    const createResumeBtn = document.getElementById('createResumeBtn');
    const resumeModal = document.getElementById('resumeModal');
    const closeResumeModal = document.getElementById('closeResumeModal');
    const cancelResumeModal = document.getElementById('cancelResumeModal');
    const resumeForm = document.getElementById('resumeForm');

    loadResumes();

    createResumeBtn.addEventListener('click', () => {
        document.getElementById('resumeModalTitle').textContent = 'Add Resume Profile';
        document.getElementById('resumeId').value = '';
        resumeForm.reset();
        resumeModal.classList.add('active');
    });

    [closeResumeModal, cancelResumeModal].forEach(btn => {
        btn.addEventListener('click', () => resumeModal.classList.remove('active'));
    });

    resumeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('resumeId').value || 'res_' + Date.now();
        const title = document.getElementById('modalResumeTitle').value;
        const text = document.getElementById('modalResumeText').value;

        const existingIndex = state.resumes.findIndex(r => r.id === id);
        const resumeItem = { id, title, text };

        if (existingIndex >= 0) {
            state.resumes[existingIndex] = resumeItem;
        } else {
            state.resumes.push(resumeItem);
            if (state.resumes.length === 1) state.activeResumeId = id; // Set active if first
        }

        saveResumes();
        resumeModal.classList.remove('active');
    });
}

function loadResumes() {
    chrome.storage.local.get(['applyAiResumes', 'applyAiActiveResumeId', 'applyAiResume'], (res) => {
        state.resumes = res.applyAiResumes || [];
        state.activeResumeId = res.applyAiActiveResumeId || null;

        // Migration fallback for legacy single resume string
        if (state.resumes.length === 0 && res.applyAiResume) {
            const defaultRes = { id: 'res_default', title: 'Master Profile', text: res.applyAiResume };
            state.resumes.push(defaultRes);
            state.activeResumeId = defaultRes.id;
            saveResumes();
        } else {
            renderResumeGrid();
        }
    });
}

function saveResumes() {
    const activeRes = state.resumes.find(r => r.id === state.activeResumeId) || state.resumes[0];
    const activeText = activeRes ? activeRes.text : '';

    chrome.storage.local.set({
        applyAiResumes: state.resumes,
        applyAiActiveResumeId: state.activeResumeId,
        applyAiResume: activeText // Maintain sync for content script
    }, () => {
        renderResumeGrid();
    });
}

function renderResumeGrid() {
    const grid = document.getElementById('resumeGrid');
    grid.innerHTML = '';

    const activeRes = state.resumes.find(r => r.id === state.activeResumeId);
    document.getElementById('sidebarActiveResumeName').textContent = activeRes ? activeRes.title : 'No Resume Selected';

    if (state.resumes.length === 0) {
        grid.innerHTML = `<div class="help-text">No resume profiles stored yet. Click "+ New Resume Version" to create one!</div>`;
        return;
    }

    state.resumes.forEach(r => {
        const isActive = r.id === state.activeResumeId;
        const card = document.createElement('div');
        card.className = `resume-card glass-panel ${isActive ? 'active-resume' : ''}`;

        card.innerHTML = `
            ${isActive ? `<span class="active-badge">✓ Active Profile</span>` : ''}
            <div class="resume-title">${escapeHtml(r.title)}</div>
            <div class="resume-preview">${escapeHtml(r.text)}</div>
            <div class="resume-card-actions">
                ${!isActive ? `<button class="primary-btn sm set-active-btn">Use for Autofill</button>` : ''}
                <button class="secondary-btn sm edit-resume-btn">Edit</button>
                <button class="secondary-btn sm delete-resume-btn">Delete</button>
            </div>
        `;

        if (!isActive) {
            card.querySelector('.set-active-btn').addEventListener('click', () => {
                state.activeResumeId = r.id;
                saveResumes();
            });
        }

        card.querySelector('.edit-resume-btn').addEventListener('click', () => {
            document.getElementById('resumeModalTitle').textContent = 'Edit Resume Profile';
            document.getElementById('resumeId').value = r.id;
            document.getElementById('modalResumeTitle').value = r.title;
            document.getElementById('modalResumeText').value = r.text;
            document.getElementById('resumeModal').classList.add('active');
        });

        card.querySelector('.delete-resume-btn').addEventListener('click', () => {
            if (confirm(`Delete profile "${r.title}"?`)) {
                state.resumes = state.resumes.filter(item => item.id !== r.id);
                if (state.activeResumeId === r.id) {
                    state.activeResumeId = state.resumes[0] ? state.resumes[0].id : null;
                }
                saveResumes();
            }
        });

        grid.appendChild(card);
    });
}

// ============================================
// 4. ANALYTICS LOGIC
// ============================================
function initAnalytics() {
    renderAnalytics();
}

function renderAnalytics() {
    const total = state.applications.length;
    const activePipeline = state.applications.filter(a => ['Screening', 'Interview', 'Offer'].includes(a.status)).length;
    
    let avgMatch = 0;
    if (total > 0) {
        const sum = state.applications.reduce((acc, a) => acc + (a.matchScore || 85), 0);
        avgMatch = Math.round(sum / total);
    }

    const timeSavedHrs = (total * 15 / 60).toFixed(1); // 15 mins saved per application

    document.getElementById('statTotalApps').textContent = total;
    document.getElementById('statActivePipeline').textContent = activePipeline;
    document.getElementById('statAvgMatch').textContent = `${avgMatch}%`;
    document.getElementById('statTimeSaved').textContent = `${timeSavedHrs} hrs`;

    // Distribution Bars
    const distContainer = document.getElementById('distributionBars');
    distContainer.innerHTML = '';

    const statuses = [
        { label: 'Applied', color: '#3b82f6' },
        { label: 'Screening', color: '#8b5cf6' },
        { label: 'Interview', color: '#f59e0b' },
        { label: 'Offer', color: '#10b981' },
        { label: 'Rejected', color: '#ef4444' }
    ];

    statuses.forEach(s => {
        const count = state.applications.filter(a => a.status === s.label).length;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;

        const item = document.createElement('div');
        item.className = 'dist-bar-item';
        item.innerHTML = `
            <div class="dist-label-wrap">
                <span>${s.label}</span>
                <span>${count} (${pct}%)</span>
            </div>
            <div class="dist-bar-bg">
                <div class="dist-bar-fill" style="width: ${pct}%; background: ${s.color}"></div>
            </div>
        `;
        distContainer.appendChild(item);
    });
}

// ============================================
// 5. SETTINGS LOGIC
// ============================================
function initSettings() {
    const providerSelect = document.getElementById('provider');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const testBackendBtn = document.getElementById('testBackendBtn');
    const statusMsg = document.getElementById('statusMessage');

    chrome.storage.local.get(['applyAiProvider'], (res) => {
        if (res.applyAiProvider) {
            providerSelect.value = res.applyAiProvider;
            state.provider = res.applyAiProvider;
        }
    });

    saveSettingsBtn.addEventListener('click', () => {
        const provider = providerSelect.value;
        chrome.storage.local.set({ applyAiProvider: provider }, () => {
            statusMsg.textContent = 'Settings saved successfully! ✨';
            statusMsg.className = 'status success';
            setTimeout(() => { statusMsg.style.opacity = '0'; }, 3000);
        });
    });

    testBackendBtn.addEventListener('click', testBackendConnection);
    testBackendConnection();
}

function testBackendConnection() {
    const dot = document.getElementById('backendStatusDot');
    const text = document.getElementById('backendStatusText');

    text.textContent = 'Checking server status...';
    dot.className = 'status-indicator-dot';

    fetch('http://127.0.0.1:8000/api/autofill', { method: 'OPTIONS' })
        .then(res => {
            dot.className = 'status-indicator-dot online';
            text.textContent = 'FastAPI server online at http://127.0.0.1:8000';
        })
        .catch(err => {
            dot.className = 'status-indicator-dot offline';
            text.textContent = 'Backend offline. Run `python main.py` in your backend folder.';
        });
}

// Utility
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}
