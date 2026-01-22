const API_URL = 'https://script.google.com/macros/s/AKfycbwcuqJk9zuxWuvwjk06UeqmbwbZ1dzony20Fsf04vNMsCueca1W6m89GmBENYfq08IBLQ/exec';

const state = {
    matches: [],
    attendance: {},
    members: [],
    leagues: [],
    selectedLeague: null,
    selectedLocation: 'home'
};

const STORAGE_KEY = 'reysol_attendance_data';

async function init() {
    // 1. Try to load from local storage
    const hasLocalData = loadFromLocal();

    if (hasLocalData) {
        setupLeagueSelect();
        renderRankings();
    } else {
        showLoading(true);
    }

    try {
        await loadData();
        setupLeagueSelect();
        renderRankings();
    } catch (e) {
        console.error('Data sync failed:', e);
        if (!hasLocalData) {
            alert('データの読み込みに失敗しました');
        }
    } finally {
        showLoading(false);
    }

    // Attach listeners once
    setupEventListeners();
}

function setupEventListeners() {
    setupYearSelectListener();
    setupLocationToggle();
}

async function loadData() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
        const response = await fetch(`${API_URL}?t=${new Date().getTime()}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        state.matches = data.matches || [];
        state.attendance = data.attendance || {};
        state.members = data.members || [];

        if (data.settings && data.settings.leagues) {
            try {
                state.leagues = JSON.parse(data.settings.leagues);
            } catch (e) {
                console.error('Failed to parse leagues settings:', e);
                state.leagues = [];
            }
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
        if (data.attendance) state.attendance = data.attendance;
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
            leagues: state.leagues,
            timestamp: new Date().getTime()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Error saving to local storage:', e);
    }
}

function setupLeagueSelect() {
    const leagueSelect = document.getElementById('year-select'); // Keep same ID for simplicity
    if (state.leagues.length === 0) {
        leagueSelect.innerHTML = '<option value="">リーグが登録されていません</option>';
        state.selectedLeague = null;
        return;
    }

    leagueSelect.innerHTML = state.leagues.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
    state.selectedLeague = state.leagues[0];
}

function setupYearSelectListener() {
    const leagueSelect = document.getElementById('year-select');
    leagueSelect.addEventListener('change', (e) => {
        const leagueId = e.target.value;
        state.selectedLeague = state.leagues.find(l => l.id === leagueId);
        renderRankings();
    });
}

function setupLocationToggle() {
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetBtn = e.target.closest('.toggle-btn');
            if (!targetBtn) return;
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            targetBtn.classList.add('active');
            state.selectedLocation = targetBtn.dataset.location;
            renderRankings();
        });
    });
}

function renderRankings() {
    const grid = document.getElementById('rankings-grid');
    if (state.selectedLocation === 'home') {
        grid.innerHTML = `
            <div id="janken-confirmed-ranking" class="ranking-card">
                <div class="ranking-header">
                    <h3>じゃんけん大会参加者</h3>
                    <span class="ranking-sub-title">（参加回数の多い順）</span>
                </div>
                <div class="ranking-body">読み込み中...</div>
            </div>
            <div id="janken-candidate-ranking" class="ranking-card">
                <div class="ranking-header">
                    <h3>じゃんけん大会立候補者</h3>
                    <span class="ranking-sub-title">（立候補回数の多い順）</span>
                </div>
                <div class="ranking-body">読み込み中...</div>
            </div>
            <div id="morning-withdraw-ranking" class="ranking-card">
                <div class="ranking-header">
                    <h3>朝の引き込み</h3>
                    <span class="ranking-sub-title">（参加回数の多い順）</span>
                </div>
                <div class="ranking-body">読み込み中...</div>
            </div>
            <div id="big-flag-ranking" class="ranking-card">
                <div class="ranking-header">
                    <h3>ビッグフラッグ搬入手伝い</h3>
                    <span class="ranking-sub-title">（参加回数の多い順）</span>
                </div>
                <div class="ranking-body">読み込み中...</div>
            </div>
        `;
        renderHomeRankings();
    } else {
        grid.innerHTML = `
            <div id="queue-start-ranking" class="ranking-card">
                <div class="ranking-header">
                    <h3>並び開始（シート貼り）</h3>
                    <span class="ranking-sub-title">（参加回数の多い順）</span>
                </div>
                <div class="ranking-body">読み込み中...</div>
            </div>
            <div id="line-org-ranking" class="ranking-card">
                <div class="ranking-header">
                    <h3>列整理</h3>
                    <span class="ranking-sub-title">（参加回数の多い順）</span>
                </div>
                <div class="ranking-body">読み込み中...</div>
            </div>
        `;
        renderAwayRankings();
    }
}

function renderHomeRankings() {
    if (!state.selectedLeague) {
        clearRankings();
        return;
    }

    const start = state.selectedLeague.start; // YYYY-MM
    const end = state.selectedLeague.end;     // YYYY-MM

    const leagueMatches = state.matches.filter(m => {
        const matchMonth = m.date.substring(0, 7); // YYYY-MM
        const isMatchInLeague = matchMonth >= start && matchMonth <= end;
        return isMatchInLeague && (m.location === 'home' || !m.location);
    });

    // Janken Confirmed Ranking
    const jankenConfirmed = {};
    yearMatches.forEach(m => {
        if (m.jankenConfirmed) {
            m.jankenConfirmed.split(',').map(s => s.trim()).filter(s => s).forEach(name => {
                jankenConfirmed[name] = (jankenConfirmed[name] || 0) + 1;
            });
        }
    });

    renderRankingCard('janken-confirmed-ranking', jankenConfirmed);

    const jankenCandidate = {};
    const morningWithdraw = {};
    const bigFlag = {};

    leagueMatches.forEach(match => {
        state.members.forEach(member => {
            const key = `${match.id}_${member.name}`;
            const data = state.attendance[key];
            if (!data) return;
            if (data.jankenParticipate) jankenCandidate[member.name] = (jankenCandidate[member.name] || 0) + 1;
            if (data.morningWithdraw) morningWithdraw[member.name] = (morningWithdraw[member.name] || 0) + 1;
            if (data.bigFlag) bigFlag[member.name] = (bigFlag[member.name] || 0) + 1;
        });
    });

    renderRankingCard('janken-candidate-ranking', jankenCandidate);
    renderRankingCard('morning-withdraw-ranking', morningWithdraw);
    renderRankingCard('big-flag-ranking', bigFlag);
}

function renderAwayRankings() {
    if (!state.selectedLeague) {
        clearRankings();
        return;
    }

    const start = state.selectedLeague.start;
    const end = state.selectedLeague.end;

    const leagueMatches = state.matches.filter(m => {
        const matchMonth = m.date.substring(0, 7);
        const isMatchInLeague = matchMonth >= start && matchMonth <= end;
        return isMatchInLeague && m.location === 'away';
    });

    const queueStart = {};
    const lineOrg = {};

    leagueMatches.forEach(match => {
        state.members.forEach(member => {
            const key = `${match.id}_${member.name}`;
            const data = state.attendance[key];
            if (!data) return;
            if (data.status === 6) queueStart[member.name] = (queueStart[member.name] || 0) + 1;
            if (data.status === 7) lineOrg[member.name] = (lineOrg[member.name] || 0) + 1;
        });
    });

    renderRankingCard('queue-start-ranking', queueStart);
    renderRankingCard('line-org-ranking', lineOrg);
}

function clearRankings() {
    document.querySelectorAll('.ranking-body').forEach(container => {
        container.innerHTML = '<div class="no-data">リーグを選択してください</div>';
    });
}

function renderRankingCard(containerId, counts) {
    const card = document.getElementById(containerId);
    if (!card) return;
    const container = card.querySelector('.ranking-body');
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
        container.innerHTML = '<div class="no-data">データがありません</div>';
        return;
    }

    let currentRank = 1;
    let prevCount = null;

    container.innerHTML = sorted.map(([name, count], index) => {
        // Tie-breaking logic (Standard Competition Ranking)
        if (prevCount !== null && count < prevCount) {
            currentRank = index + 1;
        }
        prevCount = count;

        let rankClass = '';
        if (currentRank === 1) rankClass = 'rank-gold';
        else if (currentRank === 2) rankClass = 'rank-silver';
        else if (currentRank === 3) rankClass = 'rank-bronze';

        return `
            <div class="ranking-item">
                <div class="rank-badge ${rankClass}">${currentRank}</div>
                <div class="rank-name">${name}</div>
                <div class="rank-count">${count}回</div>
            </div>
        `;
    }).join('');
}

function showLoading(show) {
    document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

init();
