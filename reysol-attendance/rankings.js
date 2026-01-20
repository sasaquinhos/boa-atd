const API_URL = 'https://script.google.com/macros/s/AKfycbywRN_oNWEl25L2Rm7taLwexuhPZxl2XoLqATAyh_B7JpTq_7r0gBgOBFO5wjP8IFBxhg/exec';

const state = {
    matches: [],
    attendance: {},
    members: [],
    selectedYear: new Date().getFullYear(),
    selectedLocation: 'home'
};

const STORAGE_KEY = 'reysol_attendance_data';

async function init() {
    // 1. Try to load from local storage
    const hasLocalData = loadFromLocal();

    if (hasLocalData) {
        setupYearSelect();
        renderRankings();
    } else {
        showLoading(true);
    }

    try {
        await loadData();
        setupYearSelect();
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
            timestamp: new Date().getTime()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Error saving to local storage:', e);
    }
}

function setupYearSelect() {
    const yearSelect = document.getElementById('year-select');
    const years = [...new Set(state.matches.map(m => new Date(m.date).getFullYear()))].sort((a, b) => b - a);

    if (years.length === 0) {
        years.push(new Date().getFullYear());
    }

    yearSelect.innerHTML = years.map(year => `<option value="${year}">${year}年度</option>`).join('');
    state.selectedYear = years[0];
    yearSelect.value = state.selectedYear;
}

function setupYearSelectListener() {
    const yearSelect = document.getElementById('year-select');
    yearSelect.addEventListener('change', (e) => {
        state.selectedYear = parseInt(e.target.value);
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
    const yearMatches = state.matches.filter(m => {
        const matchYear = new Date(m.date).getFullYear();
        return matchYear === state.selectedYear && (m.location === 'home' || !m.location);
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
    const matchIds = new Set(yearMatches.map(m => String(m.id)));

    Object.keys(state.attendance).forEach(key => {
        const [matchId, memberName] = key.split('_');
        if (matchIds.has(matchId)) {
            const data = state.attendance[key];
            if (data.jankenParticipate) jankenCandidate[memberName] = (jankenCandidate[memberName] || 0) + 1;
            if (data.morningWithdraw) morningWithdraw[memberName] = (morningWithdraw[memberName] || 0) + 1;
            if (data.bigFlag) bigFlag[memberName] = (bigFlag[memberName] || 0) + 1;
        }
    });

    renderRankingCard('janken-candidate-ranking', jankenCandidate);
    renderRankingCard('morning-withdraw-ranking', morningWithdraw);
    renderRankingCard('big-flag-ranking', bigFlag);
}

function renderAwayRankings() {
    const yearMatches = state.matches.filter(m => {
        const matchYear = new Date(m.date).getFullYear();
        return matchYear === state.selectedYear && m.location === 'away';
    });

    const queueStart = {};
    const lineOrg = {};
    const matchIds = new Set(yearMatches.map(m => String(m.id)));

    Object.keys(state.attendance).forEach(key => {
        const [matchId, memberName] = key.split('_');
        if (matchIds.has(matchId)) {
            const data = state.attendance[key];
            if (data.status === 6) queueStart[memberName] = (queueStart[memberName] || 0) + 1;
            if (data.status === 7) lineOrg[memberName] = (lineOrg[memberName] || 0) + 1;
        }
    });

    renderRankingCard('queue-start-ranking', queueStart);
    renderRankingCard('line-org-ranking', lineOrg);
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
