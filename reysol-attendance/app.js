// App State
const state = {
    members: [],
    matches: [],
    attendance: {}, // { "matchId_memberName": { status, guestsMain, guestsBack } }
    expandedMatches: new Set(), // Set of match IDs that are expanded
    loading: false,
    matchLimit: 10,
    leagues: []
};

const API_URL = 'https://script.google.com/macros/s/AKfycbzEVd4owVNNMDI-zMaf_Cwx6q_U02jyB_uhu0pjb9Z5dshrVn5HG6CJkt-M5FF20Kiw/exec';

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
    { id: 1, label: '開場まで' },
    { id: 2, label: '開場後' },
    { id: 3, label: 'キックオフ後' },
    { id: 4, label: '柏熱以外' },
    { id: 5, label: '欠席' },
    { id: 6, label: '並び開始' },
    { id: 7, label: '列整理' }
];

const SECTION_LABELS = {
    1: 'TOP',
    2: 'FRONT'
};

// Caching Constants
const STORAGE_KEY = 'reysol_attendance_data';

// Initialization
async function init() {
    console.log('Current API URL:', API_URL);

    // 1. Try to load from local storage (Stale)
    const hasLocalData = loadFromLocal();

    if (hasLocalData) {
        // If we have local data, render immediately and setup listeners
        setupUserSelect();
        renderMatches();
        setupEventListeners();

        // Background loading indicator removed per user request
        // setLoading(true, 'background');
    } else {
        // First time load: show full blocker
        setLoading(true, 'full');
    }

    try {
        // 2. Fetch fresh data (Revalidate)
        await loadData();

        // Update UI with fresh data
        setupUserSelect();
        renderMatches();

        // If listeners weren't set up yet (no local data), do it now
        if (!hasLocalData) {
            setupEventListeners();
        }

    } catch (e) {
        console.error('Data sync failed:', e);
        if (!hasLocalData) {
            alert('データの読み込みに失敗しました: ' + e.message);
        }
    } finally {
        setLoading(false);
    }
}

async function loadData() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout for GAS cold starts

    try {
        const res = await fetch(`${API_URL}?t=${new Date().getTime()}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

        const data = await res.json();

        if (data.members) state.members = data.members;
        else state.members = [];

        if (data.matches) state.matches = data.matches;
        else state.matches = [];

        if (data.settings && data.settings.matchLimit) {
            state.matchLimit = data.settings.matchLimit;
        }

        if (data.settings && data.settings.leagues) {
            try {
                state.leagues = JSON.parse(data.settings.leagues);
            } catch (e) {
                console.error('Failed to parse leagues settings:', e);
                state.leagues = [];
            }
        }

        if (data.attendance) {
            state.attendance = data.attendance;
            sanitizeAttendanceData();
        } else {
            state.attendance = {};
        }

        // Save to local storage
        saveToLocal();
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
}

function loadFromLocal() {
    try {
        const json = localStorage.getItem(STORAGE_KEY);
        if (!json) return false;

        const data = JSON.parse(json);
        if (!data) return false;

        if (data.members) state.members = data.members;
        if (data.matches) state.matches = data.matches;
        if (data.attendance) {
            state.attendance = data.attendance;
            sanitizeAttendanceData();
        }

        if (data.matchLimit) state.matchLimit = data.matchLimit;
        if (data.leagues) state.leagues = data.leagues;

        return true;
    } catch (e) {
        console.error('Error loading from local storage:', e);
        return false;
    }
}

function saveToLocal() {
    try {
        const data = {
            members: state.members,
            matches: state.matches,
            attendance: state.attendance,
            matchLimit: state.matchLimit,
            leagues: state.leagues,
            timestamp: new Date().getTime()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Error saving to local storage:', e);
    }
}

function sanitizeAttendanceData() {
    Object.keys(state.attendance).forEach(key => {
        const att = state.attendance[key];
        if (att.status === undefined) att.status = null;
        if (att.guestsMain === undefined) att.guestsMain = '';
        if (att.guestsBack === undefined) att.guestsBack = '';
        if (att.bigFlag === undefined) att.bigFlag = false;
        if (att.jankenParticipate === undefined) att.jankenParticipate = false;
        if (att.morningWithdraw === undefined) att.morningWithdraw = false;
    });
}

function setLoading(isLoading, mode = 'full') {
    state.loading = isLoading;
    const overlayId = 'loading-overlay';
    // Removed indicatorId as we no longer show subtle updates

    // Cleanup existing
    const existingOverlay = document.getElementById(overlayId);
    if (existingOverlay) existingOverlay.remove();

    const existingIndicator = document.getElementById('loading-indicator-subtle');
    if (existingIndicator) existingIndicator.remove();

    if (isLoading && mode === 'full') {
        const overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.7);display:flex;justify-content:center;align-items:center;z-index:9999;font-size:1.5rem;';
        overlay.innerText = '読み込み中...';
        document.body.appendChild(overlay);
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
        const res = await fetch(API_URL, {
            method: 'POST',
            mode: 'cors',
            cache: 'no-cache',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8', // GAS handles text/plain best for POST bodies
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            throw new Error(`Server returned ${res.status} ${res.statusText}`);
        }

        const json = await res.json();
        if (json.result !== 'success') {
            throw new Error(json.error || 'Unknown server error');
        }

    } catch (e) {
        console.error('API Error:', e);
        // Only alert if it's not a generic "Failed to fetch" on unload (optional, but good for UX)
        alert('保存に失敗しました: ' + (e.message || e.toString()));
    }
}

// Render Functions
function renderMatches() {
    matchesContainer.innerHTML = '';

    // Sort matches by date (descending)
    const sortedMatches = [...state.matches].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Initialize expandedMatches if empty and we have matches
    if (state.expandedMatches.size === 0 && sortedMatches.length > 0) {
        state.expandedMatches.add(sortedMatches[0].id);
    }

    const isAdmin = !!document.getElementById('add-member-btn');
    const currentUser = currentUserSelect ? currentUserSelect.value : null;

    // Apply limit (global sync)
    let matchesToRender = sortedMatches;
    const limitInput = document.getElementById('match-limit-input');
    // Only update value if the user isn't currently typing to avoid cursor jumps/reversion
    if (limitInput && document.activeElement !== limitInput) {
        limitInput.value = state.matchLimit;
    }

    const limitCount = parseInt(state.matchLimit);
    if (!isNaN(limitCount)) {
        matchesToRender = sortedMatches.slice(0, limitCount);
    }

    if (!isAdmin && currentUserSelect && !currentUser) {
        matchesContainer.innerHTML = '<p style="text-align:center; padding:2rem; color:#666;">ユーザーを選択してください。</p>';
        return;
    }

    matchesToRender.forEach(match => {
        const matchEl = document.createElement('div');
        const isExpanded = state.expandedMatches.has(match.id);
        matchEl.className = `match-card ${isExpanded ? '' : 'collapsed'}`;
        matchEl.dataset.matchId = match.id;

        // Admin: Show "Edit Match" and "Delete Match" buttons
        // User: No buttons
        const adminControlsHtml = isAdmin ? `
            <div class="match-controls">
                <button class="edit-match-btn" data-id="${match.id}">編集</button>
                <button class="delete-match-btn" data-id="${match.id}" style="margin-left:0.5rem;">削除</button>
            </div>
        ` : '';

        const jankenAdminHtml = (isAdmin && match.location === 'home') ? `
            <div class="janken-admin-section" style="margin: 0.5rem 1rem; padding-top: 0.5rem; border-top: 1px dashed #eee;">
                <label style="font-size:0.8rem; font-weight:bold; color:#555;">じゃんけん大会参加確定者</label>
                <div class="janken-tags-container" style="display:flex; flex-wrap:wrap; gap:0.2rem; margin-bottom:0.2rem; padding:0.2rem; border:1px solid #ddd; background:#fff; min-height:2rem; border-radius:4px;">
                    ${(match.jankenConfirmed || '').split(',').map(s => s.trim()).filter(s => s).map(name => `
                        <span class="janken-tag" style="background:#e3f2fd; padding:0.1rem 0.4rem; border-radius:10px; font-size:0.8rem; display:inline-flex; align-items:center;">
                            ${name}
                            <span class="remove-janken-tag" data-match-id="${match.id}" data-name="${name}" style="margin-left:0.3rem; cursor:pointer; color:#d32f2f; font-weight:bold;">×</span>
                        </span>
                    `).join('')}
                </div>
                <select class="janken-add-select" data-match-id="${match.id}" style="width:100%; padding:0.2rem; font-size:0.9rem; border-radius:4px; border:1px solid #ddd;">
                    <option value="">＋ メンバーを追加</option>
                    ${state.members.filter(m => !(match.jankenConfirmed || '').split(',').map(s => s.trim()).includes(m.name)).map(m => `
                        <option value="${m.name}">${m.name}</option>
                    `).join('')}
                </select>
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
            <div class="match-header ${match.location === 'away' ? 'location-away' : 'location-home'}">
                <div class="match-info">
                    <h2>${match.opponent}</h2>
                    <span class="match-date">${formatDate(match.date)}</span>
                    <span class="match-location-badge ${match.location === 'away' ? 'location-away' : 'location-home'}">
                        ${match.location === 'away' ? 'アウェイ' : 'ホーム'}
                        ${match.location === 'away' ? (match.seatType === 'reserved' ? ' (指定席)' : ' (自由席)') : ''}
                    </span>
                </div>
                ${adminControlsHtml}
            </div>
            ${jankenAdminHtml}
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
        renderLeaguesAdmin();
    }

    attachMatchListeners();
}

function createMemberRow(matchId, member, hideName = false) {
    const memberName = member.name;
    const key = `${matchId}_${memberName}`;
    const data = state.attendance[key] || { status: null, guestsMain: '', guestsBack: '', bigFlag: false, jankenParticipate: false, morningWithdraw: false };

    // Ensure default values
    if (data.bigFlag === undefined) data.bigFlag = false;
    if (data.jankenParticipate === undefined) data.jankenParticipate = false;
    if (data.morningWithdraw === undefined) data.morningWithdraw = false;

    const match = state.matches.find(m => m.id == matchId);
    const jankenConfirmedText = match ? (match.jankenConfirmed || '') : '';
    let effectiveStatus = data.status;
    if (effectiveStatus == 6 && !match.queueFlag) effectiveStatus = null;
    if (effectiveStatus == 7 && !match.lineOrgFlag) effectiveStatus = null;

    const isAbsent = effectiveStatus == 5;
    const isAttending = effectiveStatus !== null && effectiveStatus !== "" && effectiveStatus != 5;

    const isAway = match && match.location === 'away';
    const isAwayFree = isAway && match.seatType === 'free';

    const formatDateWithDayAndTime = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} (${days[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const subStatuses = [...STATUS_OPTIONS.filter(opt => opt.id !== 5 && opt.id !== 6 && opt.id !== 7)];
    if (isAwayFree) {
        if (match.lineOrgFlag) subStatuses.unshift(STATUS_OPTIONS.find(o => o.id === 7));
        if (match.queueFlag) subStatuses.unshift(STATUS_OPTIONS.find(o => o.id === 6));
    }

    let radiosHtml = subStatuses.map(opt => {
        let label = opt.label;
        if (isAway && opt.id === 4) label = 'ゴール裏以外';
        return `
            <label class="radio-label">
                <input type="radio" name="status_${key}" value="${opt.id}" ${effectiveStatus == opt.id ? 'checked' : ''} ${!isAttending ? 'disabled' : ''}>
                ${label}
            </label>
        `;
    }).join('');

    const nameHtml = hideName ? '' : `<div class="member-name">${memberName}</div>`;

    const currentGuests = (parseInt(data.guestsMain) || 0) + (parseInt(data.guestsBack) || 0);
    const guestValue = currentGuests > 0 ? currentGuests : '';

    const matchDate = match ? new Date(match.date) : null;

    if (isAway) {
        let noticeHtml = '';
        if (match.awayNotice) {
            noticeHtml = `<div class="away-notice-box"><div class="away-notice-title">連絡事項</div>${match.awayNotice}</div>`;
        }

        let awayHeaderInfo = '';
        if (match.deadline) {
            awayHeaderInfo += `<div style="font-size:0.9rem; color:#d32f2f; font-weight:bold; margin-top:0.3rem;">回答期限: ${formatDateWithDayAndTime(match.deadline)}</div>`;
        }

        let awayDetailsHtml = '';
        if (isAwayFree) {
            if (match.queueFlag && match.queueTime) {
                awayDetailsHtml += `<div style="font-size: 0.9rem; margin-bottom: 0.3rem;"><span style="font-weight:bold; color:#1976d2;">並び開始（シート貼り）：</span>${formatDateWithDayAndTime(match.queueTime)}</div>`;
            }
            if (match.lineOrgFlag && match.lineOrgTime) {
                awayDetailsHtml += `<div style="font-size: 0.9rem; margin-bottom: 0.5rem;"><span style="font-weight:bold; color:#388e3c;">列整理：</span>${formatDateWithDayAndTime(match.lineOrgTime)}</div>`;
            }
        }

        return `
            <div class="attendance-row" data-key="${key}">
                <div class="attendance-input-container">
                    ${noticeHtml}
                    <div class="input-box" style="width: 100%; border: 2px solid #e0e0e0;">
                        ${awayHeaderInfo}
                        ${nameHtml}

                        <!-- Attend or Absent -->
                        <div class="presence-selection" style="margin-top: 0.5rem; padding-bottom: 0.75rem; border-bottom: 2px solid #e0e0e0;">
                            <label class="radio-label">
                                <input type="radio" class="presence-radio" name="presence_${key}" value="attendance" ${isAttending ? 'checked' : ''}>
                                出席
                            </label>
                            <label class="radio-label">
                                <input type="radio" class="presence-radio" name="presence_${key}" value="absence" ${isAbsent ? 'checked' : ''}>
                                欠席
                            </label>
                        </div>

                        <!-- Details (Only enabled if Attendance is selected) -->
                        <div class="attendance-details ${!isAttending ? 'disabled-section' : ''}">
                            ${isAwayFree ? `
                                ${awayDetailsHtml}
                                <div class="status-options">
                                    ${radiosHtml}
                                </div>
                            ` : ''}
                            <div class="extra-guests">
                                <label>自分以外の人数:</label>
                                <div class="guest-inputs-container" style="margin-top:0;">
                                    <div class="guest-input-group">
                                        <input type="number" class="guest-input guest-input-unified" min="0" value="${guestValue}" placeholder="0" style="width: 60px;" ${!isAttending ? 'disabled' : ''}>
                                        <span style="font-size: 0.8rem; color: #666; margin-left: 0.5rem;">名</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Default Home View
    let jankenLabelSuffix = '';
    if (matchDate) {
        const prevDate = new Date(matchDate);
        prevDate.setDate(matchDate.getDate() - 1);
        const mmdd = `${prevDate.getMonth() + 1}/${prevDate.getDate()}`;
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        const dayStr = days[prevDate.getDay()];
        jankenLabelSuffix = `<br>（日立台公園 ${mmdd}(${dayStr}) 15:00）`;
    }

    let jankenHeader = '';
    let jankenTitle = 'じゃんけん大会';
    if (matchDate) {
        const twoDaysBefore = new Date(matchDate);
        twoDaysBefore.setDate(matchDate.getDate() - 2);
        const mmdd = `${twoDaysBefore.getMonth() + 1}/${twoDaysBefore.getDate()}`;
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        const dayStr = days[twoDaysBefore.getDay()];
        jankenHeader = '【前日】';
        jankenTitle = `回答期限：${mmdd}(${dayStr}) 20:00`;
    }

    let generalTitle = '出欠情報';
    if (matchDate) {
        const prevDate = new Date(matchDate);
        prevDate.setDate(matchDate.getDate() - 1);
        const mmdd = `${prevDate.getMonth() + 1}/${prevDate.getDate()}`;
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        const dayStr = days[prevDate.getDay()];
        generalTitle = `回答期限：${mmdd}(${dayStr}) 20:00`;
    }

    let noticeHtml = '';
    if (match.awayNotice) {
        noticeHtml = `<div class="away-notice-box"><div class="away-notice-title">連絡事項</div>${match.awayNotice}</div>`;
    }

    return `
        <div class="attendance-row" data-key="${key}">
            <div class="attendance-input-container">
                ${noticeHtml}
                <!-- Janken Box -->
                <div class="janken-box-wrapper">
                    <div class="janken-outside-header">${jankenHeader}</div>
                    <div class="input-box janken-box" style="margin-top:0;">
                        <div class="input-box-title">${jankenTitle}</div>
                        <div class="janken-section">
                            <label class="checkbox-label" style="font-weight:bold; color:#d32f2f;">
                                <input type="checkbox" class="janken-participate-checkbox" ${data.jankenParticipate ? 'checked' : ''}>
                                じゃんけん大会参加${jankenLabelSuffix}
                            </label>
                            <div class="janken-confirmed-display" style="font-size: 0.9rem; color: #333; margin-top: 0.5rem; background: #fbe9e7; padding: 0.5rem; border-radius: 4px; border: 1px solid #ffccbc;">
                                <span style="font-weight:bold;">参加確定:</span> ${jankenConfirmedText || 'なし'}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- General Box -->
                <div class="general-box-wrapper">
                    <div class="janken-outside-header">【当日】</div>
                    <div class="input-box general-box" style="margin-top:0;">
                        <div class="input-box-title">${generalTitle}</div>
                        ${nameHtml}
                        <div class="morning-withdraw-section" style="margin-bottom: 0.75rem; padding-bottom: 0.75rem; border-bottom: 2px solid #e3f2fd;">
                            <label class="checkbox-label">
                                <input type="checkbox" class="morning-withdraw-checkbox" ${data.morningWithdraw ? 'checked' : ''}>
                                朝の引き込み(9:00)
                            </label>
                        </div>

                        <!-- Attend or Absent -->
                        <div class="presence-selection">
                            <label class="radio-label">
                                <input type="radio" class="presence-radio" name="presence_${key}" value="attendance" ${isAttending ? 'checked' : ''}>
                                出席
                            </label>
                            <label class="radio-label">
                                <input type="radio" class="presence-radio" name="presence_${key}" value="absence" ${isAbsent ? 'checked' : ''}>
                                欠席
                            </label>
                        </div>

                        <!-- Details (Only enabled if Attendance is selected) -->
                        <div class="attendance-details ${!isAttending ? 'disabled-section' : ''}">
                            <div class="status-options">
                                ${radiosHtml}
                            </div>
                            <div class="extra-guests">
                                <label>自分以外の人数:</label>
                                <div class="guest-inputs-container" style="margin-top:0;">
                                    <div class="guest-input-group">
                                        <input type="number" class="guest-input guest-input-unified" min="0" value="${guestValue}" placeholder="0" style="width: 60px;" ${!isAttending ? 'disabled' : ''}>
                                        <span style="font-size: 0.8rem; color: #666; margin-left: 0.5rem;">名 (${SECTION_LABELS[member.section] || 'TOP'})</span>
                                    </div>
                                </div>
                            </div>
                            <div class="big-flag-section">
                                <label class="checkbox-label">
                                    <input type="checkbox" class="big-flag-checkbox" ${data.bigFlag ? 'checked' : ''} ${!isAttending ? 'disabled' : ''}>
                                    ビッグフラッグ搬入手伝い
                                </label>
                                <div class="big-flag-note" style="font-size: 0.8rem; color: #666; margin-left: 1.6rem;">
                                    （開場30分後にGATE9前集合）
                                </div>
                            </div>
                        </div>
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
                // Optimistic Update
                state.members.push({ name, section });
                saveToLocal();
                renderMatches();
                newMemberNameInput.value = '';

                // API Call
                apiCall('add_member', { name, section });
            } else if (state.members.some(m => m.name === name)) {
                alert('そのメンバーは既に存在します');
            }
        });
    }

    // Match Limit Change
    const limitInput = document.getElementById('match-limit-input');
    if (limitInput) {
        // Immediate local update
        limitInput.addEventListener('input', (e) => {
            state.matchLimit = e.target.value;
            saveToLocal();
            renderMatches();
        });

        // Sync to server only on blur/change to avoid race conditions and excessive calls
        limitInput.addEventListener('change', (e) => {
            apiCall('update_setting', {
                key: 'matchLimit',
                value: state.matchLimit
            });
        });
    }

    // Add Match
    if (addMatchBtn) {
        addMatchBtn.addEventListener('click', () => {
            const date = newMatchDateInput.value;
            const opponent = newMatchOpponentInput.value.trim();

            const locationRadio = document.querySelector('input[name="new-match-location"]:checked');
            const location = locationRadio ? locationRadio.value : 'home';
            const seatTypeRadio = document.querySelector('input[name="new-match-seat-type"]:checked');
            const seatType = (location === 'away' && seatTypeRadio) ? seatTypeRadio.value : '';

            // New fields
            const deadline = document.getElementById('new-match-deadline').value;
            const queueFlag = document.getElementById('new-match-queue-flag').checked;
            const queueTime = document.getElementById('new-match-queue-time').value;
            const lineOrgFlag = document.getElementById('new-match-line-org-flag').checked;
            const lineOrgTime = document.getElementById('new-match-line-org-time').value;
            const awayNotice = document.getElementById('new-match-away-notice').value;

            if (date && opponent) {
                const isAwayFree = (location === 'away' && seatType === 'free');
                const newMatch = {
                    id: Date.now(),
                    date,
                    opponent,
                    location,
                    seatType,
                    deadline: (location === 'away' ? deadline : ''),
                    queueFlag: (isAwayFree ? queueFlag : false),
                    queueTime: (isAwayFree ? queueTime : ''),
                    lineOrgFlag: (isAwayFree ? lineOrgFlag : false),
                    lineOrgTime: (isAwayFree ? lineOrgTime : ''),
                    awayNotice: awayNotice
                };
                // Optimistic Update
                state.matches.push(newMatch);
                saveToLocal();
                renderMatches();
                newMatchDateInput.value = '';
                newMatchOpponentInput.value = '';

                // Reset radio buttons and fields
                const homeRadio = document.querySelector('input[name="new-match-location"][value="home"]');
                if (homeRadio) homeRadio.checked = true;

                const seatContainer = document.getElementById('away-seat-type-container');
                if (seatContainer) seatContainer.style.display = 'none';

                const detailContainer = document.getElementById('away-general-details');
                if (detailContainer) detailContainer.style.display = 'none';

                document.getElementById('new-match-deadline').value = '';
                document.getElementById('new-match-queue-flag').checked = false;
                document.getElementById('new-match-queue-time').value = '';
                document.getElementById('queue-time-container').style.display = 'none';

                document.getElementById('new-match-line-org-flag').checked = false;
                document.getElementById('new-match-line-org-time').value = '';
                document.getElementById('line-org-time-container').style.display = 'none';
                document.getElementById('new-match-away-notice').value = ''; // Reset awayNotice

                // API Call
                apiCall('add_match', newMatch);
            } else {
                alert('日付と対戦相手を入力してください');
            }
        });

        // Toggle Listeners
        const locationRadios = document.querySelectorAll('input[name="new-match-location"]');
        const awaySeatTypeContainer = document.getElementById('away-seat-type-container');
        const awayGeneralDetails = document.getElementById('away-general-details');

        function updateAwayUI(e) {
            const isManualChange = !!e;
            const loc = document.querySelector('input[name="new-match-location"]:checked').value;
            const seat = document.querySelector('input[name="new-match-seat-type"]:checked').value;

            const isAway = (loc === 'away');
            const isFree = (seat === 'free');

            const queueSec = document.getElementById('new-match-queue-section');
            const lineSec = document.getElementById('new-match-line-org-section');

            // Detect if the Away/Free details were previously hidden to trigger auto-check
            const wasAwayFreeVisible = (awayGeneralDetails.style.display === 'flex' &&
                queueSec && queueSec.style.display === 'flex');

            if (isAway) {
                awaySeatTypeContainer.style.display = 'flex';
                awayGeneralDetails.style.display = 'flex';

                if (queueSec) queueSec.style.display = isFree ? 'flex' : 'none';
                if (lineSec) lineSec.style.display = isFree ? 'flex' : 'none';

                if (isManualChange && isAway && isFree && !wasAwayFreeVisible) {
                    const qFlag = document.getElementById('new-match-queue-flag');
                    if (qFlag) {
                        qFlag.checked = true;
                        document.getElementById('queue-time-container').style.display = 'flex';
                    }
                    const lFlag = document.getElementById('new-match-line-org-flag');
                    if (lFlag) {
                        lFlag.checked = true;
                        document.getElementById('line-org-time-container').style.display = 'flex';
                    }
                }
            } else {
                awaySeatTypeContainer.style.display = 'none';
                awayGeneralDetails.style.display = 'none';
            }
        }

        locationRadios.forEach(radio => {
            radio.addEventListener('change', updateAwayUI);
        });

        document.querySelectorAll('input[name="new-match-seat-type"]').forEach(radio => {
            radio.addEventListener('change', updateAwayUI);
        });

        const queueFlagCheckbox = document.getElementById('new-match-queue-flag');
        const queueTimeContainer = document.getElementById('queue-time-container');
        if (queueFlagCheckbox && queueTimeContainer) {
            queueFlagCheckbox.addEventListener('change', (e) => {
                queueTimeContainer.style.display = e.target.checked ? 'flex' : 'none';
            });
        }

        const lineOrgFlagCheckbox = document.getElementById('new-match-line-org-flag');
        const lineOrgTimeContainer = document.getElementById('line-org-time-container');
        if (lineOrgFlagCheckbox && lineOrgTimeContainer) {
            lineOrgFlagCheckbox.addEventListener('change', (e) => {
                lineOrgTimeContainer.style.display = e.target.checked ? 'flex' : 'none';
            });
        }

        // League Registration
        const addLeagueBtn = document.getElementById('add-league-btn');
        if (addLeagueBtn) {
            addLeagueBtn.addEventListener('click', addLeague);
        }
    }

    // Admin Member Actions (Delete/Edit)
    const membersSelect = document.getElementById('members-select-admin');
    const editBtn = document.getElementById('edit-member-btn-admin');
    const deleteBtn = document.getElementById('delete-member-btn-admin');

    if (editBtn && membersSelect) {
        editBtn.addEventListener('click', () => {
            const memberName = membersSelect.value;
            if (memberName) {
                openEditMemberModal(memberName);
            } else {
                alert('編集するメンバーを選択してください');
            }
        });
    }

    if (deleteBtn && membersSelect) {
        deleteBtn.addEventListener('click', () => {
            const memberName = membersSelect.value;
            if (memberName) {
                if (confirm(`メンバー「${memberName}」を削除しますか？\n(過去の出欠データからも削除されます)`)) {
                    state.members = state.members.filter(m => m.name !== memberName);
                    // Cleanup attendance data for this member locally
                    Object.keys(state.attendance).forEach(key => {
                        if (key.endsWith(`_${memberName} `)) {
                            delete state.attendance[key];
                        }
                    });
                    saveToLocal();
                    renderMatches();
                    apiCall('delete_member', { name: memberName });
                }
            } else {
                alert('削除するメンバーを選択してください');
            }
        });
    }

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
                        if (key.endsWith(`_${currentEditingMemberName} `)) {
                            const matchId = key.split('_')[0];
                            newAttendance[`${matchId}_${newName} `] = state.attendance[key];
                        } else {
                            newAttendance[key] = state.attendance[key];
                        }
                    });
                    state.attendance = newAttendance;
                }

                // Update member data
                member.name = newName;
                member.section = newSection;

                saveToLocal();
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

function attachMatchListeners() {
    // Match Header Toggle (Expand/Collapse)
    document.querySelectorAll('.match-header').forEach(header => {
        header.addEventListener('click', (e) => {
            // Don't toggle if clicking on admin buttons
            if (e.target.closest('.match-controls')) return;

            const matchEl = e.target.closest('.match-card');
            const matchId = parseInt(matchEl.dataset.matchId);

            if (state.expandedMatches.has(matchId)) {
                state.expandedMatches.delete(matchId);
                matchEl.classList.add('collapsed');
            } else {
                state.expandedMatches.add(matchId);
                matchEl.classList.remove('collapsed');
            }
        });
    });

    // Attendance Changes (Sub-status)
    document.querySelectorAll('.status-options input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const row = e.target.closest('.attendance-row');
            const key = row.dataset.key;
            const matchId = key.split('_')[0];
            const memberName = key.split('_')[1];
            const status = parseInt(e.target.value);

            if (!state.attendance[key]) state.attendance[key] = { status: null, guestsMain: '', guestsBack: '', bigFlag: false, jankenParticipate: false, morningWithdraw: false };
            state.attendance[key].status = status;

            saveToLocal();
            updateMatchSummary(matchId);

            // API Call
            apiCall('update_attendance', {
                matchId: matchId,
                memberName: memberName,
                status: status,
                guestsMain: state.attendance[key].guestsMain,
                guestsBack: state.attendance[key].guestsBack,
                morningWithdraw: state.attendance[key].morningWithdraw
            });
        });
    });

    // Presence Changes (Attendance vs Absence)
    document.querySelectorAll('.presence-radio').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const row = e.target.closest('.attendance-row');
            const details = row.querySelector('.attendance-details');
            const key = row.dataset.key;
            const matchId = key.split('_')[0];
            const namePart = key.substring(matchId.length + 1);
            const val = e.target.value;

            if (!state.attendance[key]) state.attendance[key] = { status: null, guestsMain: '', guestsBack: '', bigFlag: false, jankenParticipate: false, morningWithdraw: false };

            if (val === 'absence') {
                state.attendance[key].status = 5;
                state.attendance[key].guestsMain = '';
                state.attendance[key].guestsBack = '';
                state.attendance[key].bigFlag = false;

                // UI Reset
                const guestInput = row.querySelector('.guest-input-unified');
                if (guestInput) guestInput.value = '';
                const bigFlagCheckbox = row.querySelector('.big-flag-checkbox');
                if (bigFlagCheckbox) bigFlagCheckbox.checked = false;

                details.classList.add('disabled-section');
                details.querySelectorAll('input').forEach(input => input.disabled = true);
            } else {
                // Return to attendance.
                const match = state.matches.find(m => m.id == matchId);
                const isAwayReserved = match && match.location === 'away' && match.seatType === 'reserved';

                // If switching from Absent (5) or it's current null/empty, reset sub-status
                // BUT for Away Reserved, we don't have sub-radios, so we use 1 as default "Attending"
                if (state.attendance[key].status === 5 || !state.attendance[key].status) {
                    state.attendance[key].status = isAwayReserved ? 1 : 0; // 0: Attending but sub-status unpicked
                }

                details.classList.remove('disabled-section');
                details.querySelectorAll('input').forEach(input => input.disabled = false);

                // Ensure the correct sub-status radio is checked visually, or uncheck all if 0
                const currentStatus = state.attendance[key].status;
                const subRadios = row.querySelectorAll('.status-options input[type="radio"]');
                subRadios.forEach(r => {
                    r.checked = (parseInt(r.value) === currentStatus);
                });
            }

            saveToLocal();
            updateMatchSummary(matchId);

            // API Call
            apiCall('update_attendance', {
                matchId: matchId,
                memberName: namePart,
                status: state.attendance[key].status,
                guestsMain: state.attendance[key].guestsMain,
                guestsBack: state.attendance[key].guestsBack,
                bigFlag: state.attendance[key].bigFlag,
                jankenParticipate: state.attendance[key].jankenParticipate,
                morningWithdraw: state.attendance[key].morningWithdraw
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

            if (!state.attendance[key]) state.attendance[key] = { status: null, guestsMain: '', guestsBack: '', bigFlag: false, jankenParticipate: false, morningWithdraw: false };

            const val = e.target.value;

            if (section === 2) { // Back
                state.attendance[key].guestsMain = '';
                state.attendance[key].guestsBack = val;
            } else { // Main
                state.attendance[key].guestsMain = val;
                state.attendance[key].guestsBack = '';
            }

            saveToLocal();
            updateMatchSummary(matchId);

            // API Call
            // Debounce? For now direct call.
            apiCall('update_attendance', {
                matchId: matchId,
                memberName: namePart,
                status: state.attendance[key].status,
                guestsMain: state.attendance[key].guestsMain,
                guestsBack: state.attendance[key].guestsBack,
                morningWithdraw: state.attendance[key].morningWithdraw
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

            if (!state.attendance[key]) state.attendance[key] = { status: null, guestsMain: '', guestsBack: '', bigFlag: false, jankenParticipate: false, morningWithdraw: false };
            state.attendance[key].bigFlag = e.target.checked;

            saveToLocal();
            updateMatchSummary(matchId);

            // API Call
            apiCall('update_attendance', {
                matchId: matchId,
                memberName: namePart,
                status: state.attendance[key].status,
                guestsMain: state.attendance[key].guestsMain,
                guestsBack: state.attendance[key].guestsBack,
                bigFlag: state.attendance[key].bigFlag,
                jankenParticipate: state.attendance[key].jankenParticipate,
                morningWithdraw: state.attendance[key].morningWithdraw
            });
        });
    });

    // Janken Participate Checkbox
    document.querySelectorAll('.janken-participate-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const row = e.target.closest('.attendance-row');
            const key = row.dataset.key;
            const matchId = key.split('_')[0];
            const namePart = key.substring(matchId.length + 1);

            if (!state.attendance[key]) state.attendance[key] = { status: null, guestsMain: '', guestsBack: '', bigFlag: false, jankenParticipate: false, morningWithdraw: false };
            state.attendance[key].jankenParticipate = e.target.checked;

            saveToLocal();
            updateMatchSummary(matchId);

            // API Call
            apiCall('update_attendance', {
                matchId: matchId,
                memberName: namePart,
                status: state.attendance[key].status,
                guestsMain: state.attendance[key].guestsMain,
                guestsBack: state.attendance[key].guestsBack,
                bigFlag: state.attendance[key].bigFlag,
                jankenParticipate: state.attendance[key].jankenParticipate,
                morningWithdraw: state.attendance[key].morningWithdraw
            });
        });
    });

    // Morning Withdraw Checkbox
    document.querySelectorAll('.morning-withdraw-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const row = e.target.closest('.attendance-row');
            const key = row.dataset.key;
            const matchId = key.split('_')[0];
            const namePart = key.substring(matchId.length + 1);

            if (!state.attendance[key]) state.attendance[key] = { status: null, guestsMain: '', guestsBack: '', bigFlag: false, jankenParticipate: false, morningWithdraw: false };
            state.attendance[key].morningWithdraw = e.target.checked;

            saveToLocal();
            updateMatchSummary(matchId);

            // API Call
            apiCall('update_attendance', {
                matchId: matchId,
                memberName: namePart,
                status: state.attendance[key].status,
                guestsMain: state.attendance[key].guestsMain,
                guestsBack: state.attendance[key].guestsBack,
                bigFlag: state.attendance[key].bigFlag,
                jankenParticipate: state.attendance[key].jankenParticipate,
                morningWithdraw: state.attendance[key].morningWithdraw
            });
        });
    });

    // Save Janken Confirmed (Admin)
    // Janken Admin Actions (Dropdown & Tags)
    // Add Member
    document.querySelectorAll('.janken-add-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const matchId = e.target.dataset.matchId;
            const name = e.target.value;
            if (!name) return;

            const match = state.matches.find(m => m.id == matchId);
            if (match) {
                const current = (match.jankenConfirmed || '').split(',').map(s => s.trim()).filter(s => s);
                if (!current.includes(name)) {
                    current.push(name);
                    const val = current.join(', ');
                    match.jankenConfirmed = val;
                    saveToLocal();
                    renderMatches(); // Re-render to update UI
                    apiCall('update_match', { id: matchId, jankenConfirmed: val });
                }
            }
        });
    });

    // Remove Tag
    document.querySelectorAll('.remove-janken-tag').forEach(span => {
        span.addEventListener('click', (e) => {
            const matchId = e.target.dataset.matchId;
            const name = e.target.dataset.name;

            const match = state.matches.find(m => m.id == matchId);
            if (match) {
                const current = (match.jankenConfirmed || '').split(',').map(s => s.trim()).filter(s => s);
                const newVal = current.filter(n => n !== name).join(', ');
                match.jankenConfirmed = newVal;
                saveToLocal();
                renderMatches();
                apiCall('update_match', { id: matchId, jankenConfirmed: newVal });
            }
        });
    });

    // Delete Match
    document.querySelectorAll('.delete-match-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (confirm('この試合を削除しますか？')) {
                const id = parseInt(e.target.dataset.id);
                state.matches = state.matches.filter(m => m.id !== id);
                saveToLocal();
                renderMatches();
                apiCall('delete_match', { id: id });
            }
        });
    });

    // Edit Match
    document.querySelectorAll('.edit-match-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.target.dataset.id);
            openEditMatchModal(id);
        });
    });
}

function openEditMatchModal(matchId) {
    const match = state.matches.find(m => m.id === matchId);
    if (!match) return;

    const modal = document.getElementById('edit-match-modal');
    const dateInput = document.getElementById('edit-match-date');
    const opponentInput = document.getElementById('edit-match-opponent');
    const deadlineInput = document.getElementById('edit-match-deadline');
    const queueFlagInput = document.getElementById('edit-match-queue-flag');
    const queueTimeInput = document.getElementById('edit-match-queue-time');
    const lineOrgFlagInput = document.getElementById('edit-match-line-org-flag');
    const lineOrgTimeInput = document.getElementById('edit-match-line-org-time');

    const formatForInput = (dateStr, isDateTime = false) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;

        const pad = (num) => String(num).padStart(2, '0');
        const year = d.getFullYear();
        const month = pad(d.getMonth() + 1);
        const day = pad(d.getDate());

        if (isDateTime) {
            const hours = pad(d.getHours());
            const minutes = pad(d.getMinutes());
            return `${year}-${month}-${day}T${hours}:${minutes}`;
        }
        return `${year}-${month}-${day}`;
    };

    dateInput.value = formatForInput(match.date);
    opponentInput.value = match.opponent;

    // Set radios
    const locRadios = document.getElementsByName('edit-match-location');
    locRadios.forEach(r => r.checked = (r.value === (match.location || 'home')));

    const seatRadios = document.getElementsByName('edit-match-seat-type');
    seatRadios.forEach(r => r.checked = (r.value === (match.seatType || 'free')));

    // Set other fields with proper formatting
    deadlineInput.value = formatForInput(match.deadline, true);
    queueFlagInput.checked = !!match.queueFlag;
    queueTimeInput.value = formatForInput(match.queueTime, true);
    lineOrgFlagInput.checked = !!match.lineOrgFlag;
    lineOrgTimeInput.value = formatForInput(match.lineOrgTime, true);
    document.getElementById('edit-match-away-notice').value = match.awayNotice || '';

    // Function for modal UI updates
    const updateModalUI = (isManualChange = false) => {
        const loc = Array.from(locRadios).find(r => r.checked)?.value || 'home';
        const seat = Array.from(seatRadios).find(r => r.checked)?.value || 'free';

        const seatContainer = document.getElementById('edit-away-seat-type-container');
        const generalDetails = document.getElementById('edit-away-general-details');
        const queueSec = document.getElementById('edit-match-queue-section');
        const lineSec = document.getElementById('edit-match-line-org-section');

        const isAway = (loc === 'away');
        const isFree = (seat === 'free');

        const wasAwayFreeVisible = (generalDetails.style.display === 'flex' &&
            queueSec && queueSec.style.display === 'flex');

        if (isAway) {
            seatContainer.style.display = 'flex';
            generalDetails.style.display = 'flex';

            if (queueSec) queueSec.style.display = isFree ? 'flex' : 'none';
            if (lineSec) lineSec.style.display = isFree ? 'flex' : 'none';

            if (isManualChange && isAway && isFree && !wasAwayFreeVisible) {
                queueFlagInput.checked = true;
                lineOrgFlagInput.checked = true;
            }
        } else {
            seatContainer.style.display = 'none';
            generalDetails.style.display = 'none';
        }

        document.getElementById('edit-queue-time-container').style.display = queueFlagInput.checked ? 'flex' : 'none';
        document.getElementById('edit-line-org-time-container').style.display = lineOrgFlagInput.checked ? 'flex' : 'none';
    };

    // Attach listeners for modal
    locRadios.forEach(r => r.onchange = () => updateModalUI(true));
    seatRadios.forEach(r => r.onchange = () => updateModalUI(true));
    queueFlagInput.onchange = () => updateModalUI(false);
    lineOrgFlagInput.onchange = () => updateModalUI(false);

    updateModalUI(false);
    modal.style.display = 'flex';

    // Save/Cancel
    document.getElementById('save-edit-match').onclick = () => {
        const loc = Array.from(locRadios).find(r => r.checked)?.value || 'home';
        const seat = Array.from(seatRadios).find(r => r.checked)?.value || 'free';

        const updatedMatch = {
            id: matchId,
            date: dateInput.value,
            opponent: opponentInput.value.trim(),
            location: loc,
            seatType: (loc === 'away' ? seat : ''),
            deadline: (loc === 'away' ? deadlineInput.value : ''),
            awayNotice: document.getElementById('edit-match-away-notice').value,
            queueFlag: (loc === 'away' && seat === 'free' ? queueFlagInput.checked : false),
            queueTime: (loc === 'away' && seat === 'free' && queueFlagInput.checked ? queueTimeInput.value : ''),
            lineOrgFlag: (loc === 'away' && seat === 'free' ? lineOrgFlagInput.checked : false),
            lineOrgTime: (loc === 'away' && seat === 'free' && lineOrgFlagInput.checked ? lineOrgTimeInput.value : '')
        };

        if (!updatedMatch.date || !updatedMatch.opponent) {
            alert('日付と対戦相手を入力してください');
            return;
        }

        // Update local state
        const idx = state.matches.findIndex(m => m.id === matchId);
        if (idx !== -1) {
            state.matches[idx] = { ...state.matches[idx], ...updatedMatch };
            saveToLocal();
            renderMatches();
            modal.style.display = 'none';
            apiCall('update_match', updatedMatch);
        }
    };

    document.getElementById('cancel-edit-match').onclick = () => {
        modal.style.display = 'none';
    };
}

function renderMembersAdmin() {
    const select = document.getElementById('members-select-admin');
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="">-- メンバーを選択 --</option>' +
        state.members.sort((a, b) => a.name.localeCompare(b.name)).map(member => `
            <option value="${member.name}" ${member.name === currentValue ? 'selected' : ''}>${member.name} (${SECTION_LABELS[member.section] || 'TOP'})</option>
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
    let outsideTotal = 0;

    // Initialize map
    STATUS_OPTIONS.forEach(opt => summary[opt.id] = []);

    const match = state.matches.find(m => m.id == matchId);
    if (!match) return '';

    state.members.forEach(member => {
        const key = `${matchId}_${member.name}`;
        const data = state.attendance[key];

        if (data && data.status !== null && data.status !== "") {
            let effectiveStatus = data.status;

            // Validate away-specific statuses
            if (effectiveStatus == 6 && !match.queueFlag) effectiveStatus = null;
            if (effectiveStatus == 7 && !match.lineOrgFlag) effectiveStatus = null;

            if (effectiveStatus && summary[effectiveStatus]) {
                summary[effectiveStatus].push(member.name);
            }

            // Exclude Absent (5) and Outside Hakunetsu (4) from section totals
            // Allow status 0 (Attending but pending) to be counted
            if (effectiveStatus !== null && effectiveStatus != 5 && effectiveStatus !== 4) {
                if (member.section === 2) {
                    memberBack += 1;
                } else {
                    memberMain += 1;
                }

                // Count guests for section totals
                if (data.guestsMain) guestMain += parseInt(data.guestsMain) || 0;
                if (data.guestsBack) guestBack += parseInt(data.guestsBack) || 0;
            } else if (effectiveStatus === 4) {
                // Count status 4 ("柏熱以外で") separately
                outsideTotal += 1; // The member themselves
                outsideTotal += (parseInt(data.guestsMain) || 0) + (parseInt(data.guestsBack) || 0);
            }
        }
    });

    const isAway = match && match.location === 'away';
    let html = '<div class="match-summary"><div class="summary-title">集計</div>';

    if (!isAway) {
        // Janken Summary (Top Priority)
        const jankenParticipants = state.members.filter(member => {
            const key = `${matchId}_${member.name}`;
            const data = state.attendance[key];
            return data && data.jankenParticipate;
        }).map(m => m.name);

        if (jankenParticipants.length > 0) {
            html += `
                <div class="summary-item active" style="background-color: #ffebee; border: 1px solid #ef5350;">
                    <span class="summary-count" style="color: #c62828;">じゃんけん大会立候補者: ${jankenParticipants.length}名</span>
                    <span class="summary-names">(${jankenParticipants.join(', ')})</span>
                </div>
            `;
        }

        // Morning Withdraw Summary (Moved below Janken Candidates)
        const morningMembers = state.members.filter(member => {
            const key = `${matchId}_${member.name}`;
            const data = state.attendance[key];
            return data && data.morningWithdraw;
        }).map(m => m.name);

        if (morningMembers.length > 0) {
            html += `
                <div class="summary-item active" style="background-color: #f1f8e9; border: 1px solid #8bc34a; margin-top: 0.5rem;">
                    <span class="summary-count" style="color: #33691e;">朝の引き込み: ${morningMembers.length}名</span>
                    <span class="summary-names">(${morningMembers.join(', ')})</span>
                </div>
            `;
        }
    }

    const totalMain = memberMain + guestMain;
    const totalBack = memberBack + guestBack;

    // Add Total Count Breakdown
    if (totalMain > 0 || totalBack > 0 || outsideTotal > 0) {
        let sectionTotalsHtml = '';
        let reservedNamesHtml = '';

        if (isAway) {
            // Away: Simple total
            sectionTotalsHtml += `<div>合計 ${totalMain + totalBack}名 <small style="font-weight:normal;">(メンバー${memberMain + memberBack} / 同伴${guestMain + guestBack})</small></div>`;
            if (outsideTotal > 0) sectionTotalsHtml += `<div style="padding-top: 0.1rem; margin-top: 0.1rem;">ゴール裏以外 合計${outsideTotal}名</div>`;

            // If Away Reserved, prepare names list
            if (match.seatType === 'reserved') {
                const attendees = [];
                state.members.forEach(member => {
                    const key = `${matchId}_${member.name}`;
                    const data = state.attendance[key];
                    if (data && data.status && data.status != 5) {
                        attendees.push(member.name);
                    }
                });
                if (attendees.length > 0) {
                    reservedNamesHtml = `<div class="summary-item active" style="margin-top: 0.3rem;"><span class="summary-names" style="font-size: 0.85rem;">出席者: (${attendees.join(', ')})</span></div>`;
                }
            }
        } else {
            // Home: Breakdown by section
            if (totalMain > 0) sectionTotalsHtml += `<div>TOP 合計${totalMain}名 <small style="font-weight:normal;">(メンバー${memberMain} / 同伴${guestMain})</small></div>`;
            if (totalBack > 0) sectionTotalsHtml += `<div>FRONT 合計${totalBack}名 <small style="font-weight:normal;">(メンバー${memberBack} / 同伴${guestBack})</small></div>`;
            if (outsideTotal > 0) sectionTotalsHtml += `<div style="padding-top: 0.1rem; margin-top: 0.1rem;">柏熱以外 合計${outsideTotal}名</div>`;
        }

        html += `
            <div class="summary-item active" style="font-weight: bold; background-color: #fff8e1; border: 2px solid #FCD116; border-radius: 4px; flex-direction: column; align-items: flex-start; gap: 0.2rem;">
                ${sectionTotalsHtml}
            </div>
            ${reservedNamesHtml}
        `;
    }


    const isAwayFree = isAway && match.seatType === 'free';

    // Determine order of status items to display
    let displayOrder = [...STATUS_OPTIONS.filter(opt => opt.id !== 5 && opt.id !== 6 && opt.id !== 7)]; // Default order
    if (isAwayFree) {
        // For Away Free, match radio button order: Queue(6), LineOrg(7), then others
        const awayOrder = [];
        if (match.lineOrgFlag) awayOrder.unshift(STATUS_OPTIONS.find(o => o.id === 7));
        if (match.queueFlag) awayOrder.unshift(STATUS_OPTIONS.find(o => o.id === 6));
        displayOrder = [...awayOrder, ...displayOrder];
    } else if (!isAway) {
        // For Home, append 6 and 7 at the end (though they usually aren't used for Home)
        displayOrder = [...displayOrder, STATUS_OPTIONS.find(o => o.id === 6), STATUS_OPTIONS.find(o => o.id === 7)];
    }

    if (!isAway || isAwayFree) {
        displayOrder.forEach(opt => {
            if (!opt) return;
            const names = summary[opt.id];
            if (names && names.length > 0) {
                let label = opt.label;
                if (isAway && opt.id === 4) label = 'ゴール裏以外';
                html += `
                    <div class="summary-item active">
                        <span class="summary-count">${label}: ${names.length}名</span>
                        <span class="summary-names">(${names.join(', ')})</span>
                    </div>
                `;
            }
        });
    }


    // Big Flag Summary
    const bigFlagMembers = state.members.filter(member => {
        const key = `${matchId}_${member.name}`;
        const data = state.attendance[key];
        return data && data.bigFlag;
    }).map(m => m.name);

    if (bigFlagMembers.length > 0) {
        html += `
            <div class="summary-item active" style="background-color: #e3f2fd; border: 1px solid #64b5f6; margin-top: 0.5rem;">
                <span class="summary-count" style="color: #0d47a1;">ビッグフラッグ搬入手伝い: ${bigFlagMembers.length}名</span>
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

function renderLeaguesAdmin() {
    const list = document.getElementById('leagues-list-admin');
    if (!list) return;

    if (state.leagues.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:#999; font-size:0.9rem;">登録されたリーグはありません</p>';
        return;
    }

    // Sort by start date specific (Newest First)
    const sortedLeagues = [...state.leagues].sort((a, b) => {
        if (a.start < b.start) return 1;
        if (a.start > b.start) return -1;
        return 0;
    });

    list.innerHTML = sortedLeagues.map(league => `
        <div style="display:flex; align-items:center; justify-content:space-between; background:#f9f9f9; padding:0.5rem 1rem; border-radius:4px; border:1px solid #eee;">
            <div>
                <strong style="font-size:1rem;">${league.name}</strong>
                <div style="font-size:0.8rem; color:#666;">${league.start} ～ ${league.end}</div>
            </div>
            <div style="display:flex; gap:0.5rem;">
                <button class="edit-league-btn" data-id="${league.id}" style="background:#e3f2fd; color:#1565c0; border:none; padding:0.3rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.8rem;">修正</button>
                <button class="delete-league-btn" data-id="${league.id}" style="background:#ffebee; color:#d32f2f; border:none; padding:0.3rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.8rem;">削除</button>
            </div>
        </div>
    `).join('');

    // Attach listeners
    list.querySelectorAll('.delete-league-btn').forEach(btn => {
        btn.onclick = (e) => {
            const leagueId = e.target.dataset.id;
            deleteLeague(leagueId);
        };
    });

    list.querySelectorAll('.edit-league-btn').forEach(btn => {
        btn.onclick = (e) => {
            const leagueId = e.target.dataset.id;
            openEditLeagueModal(leagueId);
        };
    });
}

function addLeague() {
    const nameInput = document.getElementById('new-league-name');
    const startInput = document.getElementById('new-league-start');
    const endInput = document.getElementById('new-league-end');

    const name = nameInput.value.trim();
    const start = startInput.value;
    const end = endInput.value;

    if (!name || !start || !end) {
        alert('リーグ名と期間を入力してください');
        return;
    }

    const newLeague = {
        id: Date.now().toString(),
        name,
        start,
        end
    };

    state.leagues.push(newLeague);
    saveToLocal();
    renderLeaguesAdmin();

    // Reset inputs
    nameInput.value = '';
    startInput.value = '';
    endInput.value = '';

    // API Call
    syncLeagues();
}

function deleteLeague(leagueId) {
    if (confirm('このリーグを削除しますか？')) {
        state.leagues = state.leagues.filter(l => l.id !== leagueId);
        saveToLocal();
        renderLeaguesAdmin();
        syncLeagues();
    }
}

async function syncLeagues() {
    await apiCall('update_setting', {
        key: 'leagues',
        value: JSON.stringify(state.leagues)
    });
}

// --- Edit League Modal Logic ---
function setupEditLeagueModalListeners() {
    const modal = document.getElementById('edit-league-modal');
    const closeBtn = document.getElementById('close-edit-league-modal');
    const updateBtn = document.getElementById('update-league-btn');

    if (closeBtn) {
        closeBtn.onclick = () => modal.style.display = 'none';
    }
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    if (updateBtn) {
        updateBtn.onclick = updateLeague;
    }
}

function openEditLeagueModal(leagueId) {
    const league = state.leagues.find(l => l.id === leagueId);
    if (!league) return;

    document.getElementById('edit-league-id').value = league.id;
    document.getElementById('edit-league-name').value = league.name;
    document.getElementById('edit-league-start').value = league.start;
    document.getElementById('edit-league-end').value = league.end;

    document.getElementById('edit-league-modal').style.display = 'block';
}

function updateLeague() {
    const id = document.getElementById('edit-league-id').value;
    const name = document.getElementById('edit-league-name').value.trim();
    const start = document.getElementById('edit-league-start').value;
    const end = document.getElementById('edit-league-end').value;

    if (!name || !start || !end) {
        alert('全ての項目を入力してください');
        return;
    }

    const index = state.leagues.findIndex(l => l.id === id);
    if (index === -1) return;

    state.leagues[index] = { ...state.leagues[index], name, start, end };

    saveToLocal();
    renderLeaguesAdmin();
    syncLeagues();

    document.getElementById('edit-league-modal').style.display = 'none';
}

// Utilities
function formatDate(dateString) {
    const d = new Date(dateString);
    return `${d.getMonth() + 1}/${d.getDate()} (${['日', '月', '火', '水', '木', '金', '土'][d.getDay()]})`;
}

// Start
init();
