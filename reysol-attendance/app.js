// App State
const state = {
    members: loadMembers(),
    matches: JSON.parse(localStorage.getItem('reysol_matches')) || [], // { id, date, opponent }
    attendance: JSON.parse(localStorage.getItem('reysol_attendance')) || {} // { "matchId_memberName": { status, guests, guestsMain, guestsBack } }
};

function loadMembers() {
    const raw = JSON.parse(localStorage.getItem('reysol_members'));
    if (!raw) return [{ name: '佐々木賢', section: 1 }, { name: '佐々木利恵', section: 1 }];

    // Migration: Convert strings to objects if needed
    if (raw.length > 0 && typeof raw[0] === 'string') {
        const migrated = raw.map(name => ({ name, section: 1 }));
        localStorage.setItem('reysol_members', JSON.stringify(migrated));
        return migrated;
    }
    return raw;
}

// DOM Elements
const matchesContainer = document.getElementById('matches-container');
const newMemberNameInput = document.getElementById('new-member-name');
const addMemberBtn = document.getElementById('add-member-btn');
const newMatchDateInput = document.getElementById('new-match-date');
const newMatchOpponentInput = document.getElementById('new-match-opponent');
const addMatchBtn = document.getElementById('add-match-btn');
const currentUserSelect = document.getElementById('current-user-select');

// Constants
const STATUS_OPTIONS = [
    { id: 1, label: '列整理まで' },
    { id: 2, label: '開場まで' },
    { id: 3, label: '開場後' },
    { id: 4, label: '柏熱以外で' },
    { id: 5, label: '欠席' }
];

const SECTION_LABELS = {
    1: 'TOP',
    2: 'FRONT'
};

// Initialization
function init() {
    setupUserSelect();
    renderMatches();
    setupEventListeners();
}

function setupUserSelect() {
    if (!currentUserSelect) return;

    // Save current selection if re-rendering
    const currentVal = currentUserSelect.value || localStorage.getItem('reysol_currentUser') || '';

    currentUserSelect.innerHTML = '<option value="">-- 選択してください --</option>' +
        state.members.map(m => `<option value="${m.name}">${m.name}</option>`).join('');

    currentUserSelect.value = currentVal;

    currentUserSelect.addEventListener('change', (e) => {
        localStorage.setItem('reysol_currentUser', e.target.value);
        renderMatches();
    });
}

// Saving Data
function saveData() {
    localStorage.setItem('reysol_members', JSON.stringify(state.members));
    localStorage.setItem('reysol_matches', JSON.stringify(state.matches));
    localStorage.setItem('reysol_attendance', JSON.stringify(state.attendance));
}

// Render Functions
function renderMatches() {
    matchesContainer.innerHTML = '';

    // Sort matches by date (descending)
    const sortedMatches = [...state.matches].sort((a, b) => new Date(b.date) - new Date(a.date));

    const isAdmin = !!document.getElementById('add-member-btn');
    const currentUser = currentUserSelect ? currentUserSelect.value : null;

    if (!isAdmin && currentUserSelect && !currentUser) {
        matchesContainer.innerHTML = '<p style="text-align:center; padding:2rem; color:#666;">ユーザーを選択してください。</p>';
        return;
    }

    sortedMatches.forEach(match => {
        const matchEl = document.createElement('div');
        matchEl.className = 'match-card';
        matchEl.dataset.matchId = match.id;

        // Admin: Show "Edit Match" and "Delete Match" buttons
        // User: No buttons
        const adminControlsHtml = isAdmin ? `
            <div class="match-controls">
                <button class="edit-match-btn" data-id="${match.id}">編集</button>
                <button class="delete-match-btn" data-id="${match.id}">削除</button>
            </div>
        ` : '';

        // Filter members: 
        // Admin: Show NONE (inputs hidden, only summary)
        // User: Show only SELECTED user
        let membersToRender = [];
        let hideName = false;

        if (isAdmin) {
            membersToRender = [];
        } else if (currentUser) {
            // Find the member object
            const memberObj = state.members.find(m => m.name === currentUser);
            if (memberObj) {
                membersToRender = [memberObj];
                hideName = true;
            }
        }

        matchEl.innerHTML = `
            <div class="match-header">
                <div class="match-info">
                    <h2>${match.opponent}</h2>
                    <span class="match-date">${formatDate(match.date)}</span>
                </div>
                ${adminControlsHtml}
            </div>
            <div class="members-list">
                ${membersToRender.map(member => createMemberRow(match.id, member, hideName)).join('')}
            </div>
            <div id="summary-${match.id}" class="match-summary-container">
                ${generateMatchSummaryContent(match.id)}
            </div>
        `;
        matchesContainer.appendChild(matchEl);
    });

    if (isAdmin) {
        renderMembersAdmin();
    }

    attachMatchListeners();
}

function createMemberRow(matchId, member, hideName = false) {
    const memberName = member.name;
    const key = `${matchId}_${memberName}`;
    const data = state.attendance[key] || { status: null, guestsMain: '', guestsBack: '' };

    let radiosHtml = STATUS_OPTIONS.map(opt => `
        <label class="radio-label">
            <input type="radio" name="status_${key}" value="${opt.id}" ${data.status == opt.id ? 'checked' : ''}>
            ${opt.label}
        </label>
    `).join('');

    const nameHtml = hideName ? '' : `<div class="member-name">${memberName}</div>`;

    // Determined default value to show: sum of both or just the relevant one? 
    // To be safe and show existing data, let's sum them or show the one matching section.
    // If we assume mutually exclusive, sum is fine.
    const currentGuests = (parseInt(data.guestsMain) || 0) + (parseInt(data.guestsBack) || 0);
    const guestValue = currentGuests > 0 ? currentGuests : '';

    return `
        <div class="attendance-row" data-key="${key}">
            ${nameHtml}
            <div class="status-options">
                ${radiosHtml}
            </div>
            <div class="extra-guests">
                <label>自分以外の人数:</label>
                <div class="guest-inputs-container">
                    <div class="guest-input-group">
                        <input type="number" class="guest-input guest-input-unified" min="0" value="${guestValue}" placeholder="0" style="width: 60px;">
                        <span style="font-size: 0.8rem; color: #666; margin-left: 0.5rem;">名 (${SECTION_LABELS[member.section] || 'TOP'})</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Event Listeners
function setupEventListeners() {
    // Add Member
    if (addMemberBtn) {
        addMemberBtn.addEventListener('click', () => {
            const name = newMemberNameInput.value.trim();
            const sectionRadio = document.querySelector('input[name="new-member-section"]:checked');
            const section = parseInt(sectionRadio ? sectionRadio.value : 1);

            if (name && !state.members.some(m => m.name === name)) {
                state.members.push({ name, section });
                saveData();
                renderMatches();
                newMemberNameInput.value = '';
                // Reset radios to default if desired
            } else if (state.members.some(m => m.name === name)) {
                alert('そのメンバーは既に存在します');
            }
        });
    }

    // Add Match
    addMatchBtn.addEventListener('click', () => {
        const date = newMatchDateInput.value;
        const opponent = newMatchOpponentInput.value.trim();

        if (date && opponent) {
            const newMatch = {
                id: Date.now(),
                date,
                opponent
            };
            state.matches.push(newMatch);
            saveData();
            renderMatches();
            newMatchDateInput.value = '';
            newMatchOpponentInput.value = '';
        } else {
            alert('日付と対戦相手を入力してください');
        }
    });
}

function attachMatchListeners() {
    // Attendance Changes
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const row = e.target.closest('.attendance-row');
            const key = row.dataset.key;
            // Extract match ID from key (format: timestamp_Name)
            const matchId = key.split('_')[0];
            const status = parseInt(e.target.value);

            if (!state.attendance[key]) state.attendance[key] = { status: null, guestsMain: '', guestsBack: '' };
            state.attendance[key].status = status;
            saveData();

            // Update Summary Live
            updateMatchSummary(matchId);
        });
    });

    // Guest Count Changes (Unified)
    document.querySelectorAll('.guest-input-unified').forEach(input => {
        input.addEventListener('input', (e) => {
            const row = e.target.closest('.attendance-row');
            const key = row.dataset.key;
            const matchId = key.split('_')[0];
            const memberName = key.split('_')[1]; // Fragile if name has underscore, but key generation uses identifier
            // Better: extract name by removing matchId_ prefix? Or use data attribute if simpler. 
            // Current key format: `${matchId}_${member.name}`. 
            // Let's look up member object by name.

            // Re-find member object
            // Note: key might be 123456_Name.
            const namePart = key.substring(matchId.length + 1);
            const member = state.members.find(m => m.name === namePart);
            const section = member ? (member.section || 1) : 1;

            if (!state.attendance[key]) state.attendance[key] = { status: null, guestsMain: '', guestsBack: '' };

            const val = e.target.value;

            if (section === 2) { // Back
                state.attendance[key].guestsMain = ''; // Clear other
                state.attendance[key].guestsBack = val;
            } else { // Main (default)
                state.attendance[key].guestsMain = val;
                state.attendance[key].guestsBack = ''; // Clear other
            }

            saveData();
            updateMatchSummary(matchId);
        });
    });

    // Delete Match
    document.querySelectorAll('.delete-match-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (confirm('この試合を削除しますか？')) {
                const id = parseInt(e.target.dataset.id);
                state.matches = state.matches.filter(m => m.id !== id);
                // Optional: Cleanup attendance data
                saveData();
                renderMatches();
            }
        });
    });

    // Edit Match
    document.querySelectorAll('.edit-match-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.target.dataset.id);
            const match = state.matches.find(m => m.id === id);
            if (match) {
                const newOpponent = prompt('新しい対戦相手を入力してください:', match.opponent);
                if (newOpponent && newOpponent.trim() !== '') {
                    match.opponent = newOpponent.trim();
                    saveData();
                    renderMatches();
                }
            }
        });
    });

    // Admin Member Actions
    if (document.getElementById('members-list-admin')) {
        document.querySelectorAll('.delete-member-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const memberName = e.target.dataset.name;
                if (confirm(`メンバー「${memberName}」を削除しますか？\n(過去の出欠データからも削除されます)`)) {
                    state.members = state.members.filter(m => m.name !== memberName);
                    // Cleanup attendance data for this member
                    Object.keys(state.attendance).forEach(key => {
                        if (key.endsWith(`_${memberName}`)) {
                            delete state.attendance[key];
                        }
                    });
                    saveData();
                    renderMatches();
                }
            });
        });

        // Edit Member Modal Elements
        const editModal = document.getElementById('edit-member-modal');
        const editNameInput = document.getElementById('edit-member-name');
        const saveEditBtn = document.getElementById('save-edit-member');
        const cancelEditBtn = document.getElementById('cancel-edit-member');
        let currentEditingMemberName = null;

        document.querySelectorAll('.edit-member-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const name = e.target.dataset.name;
                const member = state.members.find(m => m.name === name);
                if (member) {
                    currentEditingMemberName = name;
                    editNameInput.value = member.name;
                    // Set radio
                    const radios = document.getElementsByName('edit-member-section');
                    radios.forEach(r => {
                        r.checked = (parseInt(r.value) === (member.section || 1));
                    });

                    editModal.style.display = 'flex';
                }
            });
        });

        if (saveEditBtn) {
            // Remove old listeners to prevent duplicates if this runs multiple times (though init runs once)
            // A cleaner way is to defining this outside, but for now inside init/setupEventListeners is fine 
            // as long as we don't duplicate. replacing the node clone is a trick or just simple state check.
            // For this simple app, we assume setupEventListeners runs once.

            saveEditBtn.onclick = () => {
                const newName = editNameInput.value.trim();
                const sectionRadio = document.querySelector('input[name="edit-member-section"]:checked');
                const newSection = parseInt(sectionRadio ? sectionRadio.value : 1);

                if (!newName) {
                    alert('名前を入力してください');
                    return;
                }

                if (newName !== currentEditingMemberName && state.members.some(m => m.name === newName)) {
                    alert('その名前は既に使用されています');
                    return;
                }

                const member = state.members.find(m => m.name === currentEditingMemberName);
                if (member) {
                    // Update attendance keys if name changed
                    if (newName !== currentEditingMemberName) {
                        const newAttendance = {};
                        Object.keys(state.attendance).forEach(key => {
                            if (key.endsWith(`_${currentEditingMemberName}`)) {
                                const matchId = key.split('_')[0];
                                newAttendance[`${matchId}_${newName}`] = state.attendance[key];
                            } else {
                                newAttendance[key] = state.attendance[key];
                            }
                        });
                        state.attendance = newAttendance;
                    }

                    // Update member data
                    member.name = newName;
                    member.section = newSection;

                    saveData();
                    renderMatches();
                    editModal.style.display = 'none';
                    currentEditingMemberName = null;
                }
            };
        }

        if (cancelEditBtn) {
            cancelEditBtn.onclick = () => {
                editModal.style.display = 'none';
                currentEditingMemberName = null;
            };
        }
    }
}

function renderMembersAdmin() {
    const container = document.getElementById('members-list-admin');
    if (!container) return;

    container.innerHTML = state.members.map(member => `
        <div class="member-admin-row">
            <span>${member.name} <small class="text-muted">(${SECTION_LABELS[member.section] || 'TOP'})</small></span>
            <div class="member-actions">
                <button class="edit-member-btn" data-name="${member.name}">編集</button>
                <button class="delete-member-btn" data-name="${member.name}">削除</button>
            </div>
        </div>
    `).join('');
}

function updateMatchSummary(matchId) {
    const container = document.getElementById(`summary-${matchId}`);
    if (container) {
        container.innerHTML = generateMatchSummaryContent(matchId);
    }
}

function generateMatchSummaryContent(matchId) {
    const summary = {}; // { statusId: [names] }
    let memberMain = 0;
    let memberBack = 0;
    let guestMain = 0;
    let guestBack = 0;

    // Initialize map
    STATUS_OPTIONS.forEach(opt => summary[opt.id] = []);

    state.members.forEach(member => {
        const key = `${matchId}_${member.name}`;
        const data = state.attendance[key];

        // Count member attendance
        if (data && data.status && data.status !== 5) { // 5 is Absent
            // If member is attending (status 1-4)
            if (member.section === 2) {
                memberBack += 1;
            } else {
                memberMain += 1;
            }
        }

        if (data && data.status) {
            if (summary[data.status]) {
                summary[data.status].push(member.name);
            }
        }

        // Count guests
        if (data) {
            if (data.guestsMain) guestMain += parseInt(data.guestsMain) || 0;
            if (data.guestsBack) guestBack += parseInt(data.guestsBack) || 0;
        }
    });

    let html = '<div class="match-summary"><div class="summary-title">集計</div>';

    const totalMain = memberMain + guestMain;
    const totalBack = memberBack + guestBack;

    // Add Total Count Breakdown
    if (totalMain > 0 || totalBack > 0) {
        html += `
            <div class="summary-item active" style="font-weight: bold; background-color: #fff8e1; flex-direction: column; align-items: flex-start; gap: 0.2rem;">
                <div>TOP 合計${totalMain}名 <small style="font-weight:normal;">(メンバー${memberMain} / 同伴${guestMain})</small></div>
                <div>FRONT 合計${totalBack}名 <small style="font-weight:normal;">(メンバー${memberBack} / 同伴${guestBack})</small></div>
            </div>
        `;
    }

    STATUS_OPTIONS.forEach(opt => {
        const names = summary[opt.id];
        if (names && names.length > 0) {
            html += `
                <div class="summary-item active">
                    <span class="summary-count">${opt.label}: ${names.length}名</span>
                    <span class="summary-names">(${names.join(', ')})</span>
                </div>
            `;
        }
    });

    html += '</div>';
    return html;
}

// Utilities
function formatDate(dateString) {
    const d = new Date(dateString);
    return `${d.getMonth() + 1}/${d.getDate()} (${['日', '月', '火', '水', '木', '金', '土'][d.getDay()]})`;
}

// Start
init();
