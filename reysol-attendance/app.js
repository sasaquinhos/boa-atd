// App State
const state = {
    members: [],
    matches: [],
    attendance: {}, // { "matchId_memberName": { status, guestsMain, guestsBack } }
    loading: false
};

const API_URL = 'https://script.google.com/macros/s/AKfycbynfmWO5PLkTPb5e2wqN8Vx0CUhHV-0auo4PPdYVsGpWFI9IEzqPaxTAvh2R8GJZTG0uA/exec';

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
async function init() {
    console.log('Current API URL:', API_URL);
    setLoading(true);
    try {
        await loadData();
        setupUserSelect();
        renderMatches();
        setupEventListeners();
    } catch (e) {
        alert('データの読み込みに失敗しました: ' + e.message);
    } finally {
        setLoading(false);
    }
}

async function loadData() {
    const res = await fetch(`${API_URL}?t=${new Date().getTime()}`);
    const data = await res.json();

    if (data.members) state.members = data.members;
    else state.members = [];

    if (data.matches) state.matches = data.matches;
    else state.matches = [];

    if (data.attendance) state.attendance = data.attendance;
    else state.attendance = {};
}

function setLoading(isLoading) {
    state.loading = isLoading;
    if (isLoading) {
        if (!document.getElementById('loading-overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'loading-overlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.7);display:flex;justify-content:center;align-items:center;z-index:9999;font-size:1.5rem;';
            overlay.innerText = '読み込み中...';
            document.body.appendChild(overlay);
        }
    } else {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.remove();
    }
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

// API Interaction
async function apiCall(action, payload = {}) {
    console.log('API Call:', action, payload);
    const body = { action, ...payload };

    try {
        await fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            cache: 'no-cache',
            keepalive: true,
            body: JSON.stringify(body)
        });
    } catch (e) {
        console.error('API Error:', e);
        alert('保存に失敗しました: ' + (e.message || e.toString()));
    }
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
            <div class="big-flag-section">
                <label class="checkbox-label">
                    <input type="checkbox" class="big-flag-checkbox" ${data.bigFlag ? 'checked' : ''}>
                    ビックフラッグ搬入可
                </label>
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
                // Optimistic Update
                state.members.push({ name, section });
                renderMatches();
                newMemberNameInput.value = '';

                // API Call
                apiCall('add_member', { name, section });
            } else if (state.members.some(m => m.name === name)) {
                alert('そのメンバーは既に存在します');
            }
        });
    }

    // Add Match
    if (addMatchBtn) {
        addMatchBtn.addEventListener('click', () => {
            const date = newMatchDateInput.value;
            const opponent = newMatchOpponentInput.value.trim();

            if (date && opponent) {
                const newMatch = {
                    id: Date.now(),
                    date,
                    opponent
                };
                // Optimistic Update
                state.matches.push(newMatch);
                renderMatches();
                newMatchDateInput.value = '';
                newMatchOpponentInput.value = '';

                // API Call
                apiCall('add_match', newMatch);
            } else {
                alert('日付と対戦相手を入力してください');
            }
        });
    }

    // Admin Member Actions (Delete/Edit)
    const adminList = document.getElementById('members-list-admin');
    if (adminList) {
        // Use delegation for dynamic list
        adminList.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-member-btn')) {
                const memberName = e.target.dataset.name;
                if (confirm(`メンバー「${memberName}」を削除しますか？\n(過去の出欠データからも削除されます)`)) {
                    state.members = state.members.filter(m => m.name !== memberName);
                    // Cleanup attendance data for this member locally
                    Object.keys(state.attendance).forEach(key => {
                        if (key.endsWith(`_${memberName}`)) {
                            delete state.attendance[key];
                        }
                    });
                    renderMatches();
                    apiCall('delete_member', { name: memberName });
                }
            } else if (e.target.classList.contains('edit-member-btn')) {
                const name = e.target.dataset.name;
                openEditMemberModal(name);
            }
        });

        // Edit Member Modal Elements
        const editModal = document.getElementById('edit-member-modal');
        const editNameInput = document.getElementById('edit-member-name');
        const saveEditBtn = document.getElementById('save-edit-member');
        const cancelEditBtn = document.getElementById('cancel-edit-member');
        let currentEditingMemberName = null;

        function openEditMemberModal(name) {
            const member = state.members.find(m => m.name === name);
            if (member) {
                currentEditingMemberName = name;
                editNameInput.value = member.name;
                const radios = document.getElementsByName('edit-member-section');
                radios.forEach(r => {
                    r.checked = (parseInt(r.value) === (member.section || 1));
                });
                editModal.style.display = 'flex';
            }
        }

        if (saveEditBtn) {
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
                    // Update attendance keys if name changed locally
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

                    renderMatches();
                    editModal.style.display = 'none';

                    apiCall('update_member', {
                        originalName: currentEditingMemberName,
                        name: newName,
                        section: newSection
                    });

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

function attachMatchListeners() {
    // Attendance Changes
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const row = e.target.closest('.attendance-row');
            const key = row.dataset.key;
            const matchId = key.split('_')[0];
            const memberName = key.split('_')[1]; // Fragile but works for now
            const status = parseInt(e.target.value);

            if (!state.attendance[key]) state.attendance[key] = { status: null, guestsMain: '', guestsBack: '' };
            state.attendance[key].status = status;

            updateMatchSummary(matchId);

            // API Call
            apiCall('update_attendance', {
                matchId: matchId,
                memberName: memberName, // We need to extract this reliably
                status: status,
                guestsMain: state.attendance[key].guestsMain,
                guestsBack: state.attendance[key].guestsBack
            });
        });
    });

    // Guest Count Changes (Unified)
    document.querySelectorAll('.guest-input-unified').forEach(input => {
        input.addEventListener('input', (e) => {
            const row = e.target.closest('.attendance-row');
            const key = row.dataset.key;
            const matchId = key.split('_')[0];
            const namePart = key.substring(matchId.length + 1);

            const member = state.members.find(m => m.name === namePart);
            const section = member ? (member.section || 1) : 1;

            if (!state.attendance[key]) state.attendance[key] = { status: null, guestsMain: '', guestsBack: '' };

            const val = e.target.value;

            if (section === 2) { // Back
                state.attendance[key].guestsMain = '';
                state.attendance[key].guestsBack = val;
            } else { // Main
                state.attendance[key].guestsMain = val;
                state.attendance[key].guestsBack = '';
            }

            updateMatchSummary(matchId);

            // API Call
            // Debounce? For now direct call.
            apiCall('update_attendance', {
                matchId: matchId,
                memberName: namePart,
                status: state.attendance[key].status,
                guestsMain: state.attendance[key].guestsMain,
                guestsBack: state.attendance[key].guestsBack
            });
        });
    });

    // Big Flag Checkbox
    document.querySelectorAll('.big-flag-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const row = e.target.closest('.attendance-row');
            const key = row.dataset.key;
            const matchId = key.split('_')[0];
            const namePart = key.substring(matchId.length + 1);

            if (!state.attendance[key]) state.attendance[key] = { status: null, guestsMain: '', guestsBack: '', bigFlag: false };
            state.attendance[key].bigFlag = e.target.checked;

            updateMatchSummary(matchId);

            // API Call
            apiCall('update_attendance', {
                matchId: matchId,
                memberName: namePart,
                status: state.attendance[key].status,
                guestsMain: state.attendance[key].guestsMain,
                guestsBack: state.attendance[key].guestsBack,
                bigFlag: state.attendance[key].bigFlag
            });
        });
    });

    // Delete Match
    document.querySelectorAll('.delete-match-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (confirm('この試合を削除しますか？')) {
                const id = parseInt(e.target.dataset.id);
                state.matches = state.matches.filter(m => m.id !== id);
                renderMatches();
                apiCall('delete_match', { id: id });
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
                    renderMatches();
                    apiCall('update_match', { id: id, opponent: match.opponent });
                }
            }
        });
    });
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

    // Big Flag Summary
    const bigFlagMembers = state.members.filter(member => {
        const key = `${matchId}_${member.name}`;
        const data = state.attendance[key];
        return data && data.bigFlag;
    }).map(m => m.name);

    if (bigFlagMembers.length > 0) {
        html += `
            <div class="summary-item active" style="background-color: #e3f2fd; margin-top: 0.5rem;">
                <span class="summary-count">ビックフラッグ搬入: ${bigFlagMembers.length}名</span>
                <span class="summary-names">(${bigFlagMembers.join(', ')})</span>
            </div>
        `;
    }



    html += '</div>';
    return html;
}


function generateAttendanceTable(matchId) {
    let html = `
        <details class="attendance-table-details">
            <summary>詳細リストを表示</summary>
            <table class="attendance-table">
                <thead>
                    <tr>
                        <th>名前</th>
                        <th>区分</th>
                        <th>回答</th>
                        <th>同伴(Main)</th>
                        <th>同伴(Back)</th>
                    </tr>
                </thead>
                <tbody>
    `;

    // Sort members for consistency (e.g. by Section then Name)
    const sortedMembers = [...state.members].sort((a, b) => {
        if (a.section !== b.section) return a.section - b.section; // 1 (TOP) then 2 (FRONT)
        return a.name.localeCompare(b.name);
    });

    sortedMembers.forEach(member => {
        const key = `${matchId}_${member.name}`;
        const data = state.attendance[key] || {};

        let statusLabel = '-';
        if (data.status) {
            const statusObj = STATUS_OPTIONS.find(s => s.id == data.status);
            statusLabel = statusObj ? statusObj.label : '-';
        }

        const sectionLabel = SECTION_LABELS[member.section] || 'TOP';
        const guestsMain = data.guestsMain || '-';
        const guestsBack = data.guestsBack || '-';

        // Row highlighting based on status
        let rowClass = '';
        if (data.status === 5) rowClass = 'status-absent'; // 欠席
        else if (data.status) rowClass = 'status-attending'; // 出席

        html += `
            <tr class="${rowClass}">
                <td>${member.name}</td>
                <td><span class="badge section-${member.section}">${sectionLabel}</span></td>
                <td>${statusLabel}</td>
                <td style="text-align:center;">${guestsMain}</td>
                <td style="text-align:center;">${guestsBack}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </details>
    `;
    return html;
}

// Utilities
function formatDate(dateString) {
    const d = new Date(dateString);
    return `${d.getMonth() + 1}/${d.getDate()} (${['日', '月', '火', '水', '木', '金', '土'][d.getDay()]})`;
}

// Start
init();
