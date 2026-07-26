document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('openDashboard');
    btn.addEventListener('click', () => {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL('options.html'));
        }
    });

    chrome.storage.local.get(['applyAiApplications', 'applyAiResumes', 'applyAiActiveResumeId', 'applyAiProvider'], (res) => {
        const apps = res.applyAiApplications || [];
        document.getElementById('popTotalApps').textContent = apps.length;

        const resumes = res.applyAiResumes || [];
        const activeRes = resumes.find(r => r.id === res.applyAiActiveResumeId) || resumes[0];
        document.getElementById('popActiveProfile').textContent = activeRes ? activeRes.title : 'Default Profile';

        const providerMap = {
            openai: 'GPT-4o mini',
            anthropic: 'Claude Haiku',
            gemini: 'Gemini Flash'
        };
        document.getElementById('popProvider').textContent = providerMap[res.applyAiProvider] || 'Gemini Flash';
    });
});
