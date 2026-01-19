const API_URL = 'https://script.google.com/macros/s/AKfycbw1dutfDLvVkwzHPb1l2mWyc2FUw4dEPYVzE913fMG1HcnIbd1FLs1OBdFD4lwPaLmNmg/exec';

const state = {
    matches: [],
    attendance: {},
    members: [],
    selectedYear: new Date().getFullYear()
};

const STORAGE_KEY = 'reysol_attendance_data';

async function init() {
    // 1. Try to load from local storage
    const hasLocalData = loadFromLocal();

    if (hasLocalData) {
        // If we have local data, render immediately
        setupYearSelect();
        renderRankings();
    } else {
        // First time load: show blocking loader
        showLoading(true);
    }

    try {
        // 2. Fetch fresh data
        await loadData();

        // Update UI with fresh data
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

    yearSelect.addEventListener('change', (e) => {
        state.selectedYear = parseInt(e.target.value);
        renderRankings();
    });
}

function renderRankings() {
    const yearMatches = state.matches.filter(m => {
        const matchYear = new Date(m.date).getFullYear();
        return matchYear === state.selectedYear;
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

    // Janken Candidate Ranking
    const jankenCandidate = {};
    // Morning Withdraw Ranking
    const morningWithdraw = {};
    // Big Flag Ranking
    const bigFlag = {};
    const matchIds = new Set(yearMatches.map(m => String(m.id)));

    Object.keys(state.attendance).forEach(key => {
        const [matchId, memberName] = key.split('_');
        if (matchIds.has(matchId)) {
            const data = state.attendance[key];
            if (data.jankenParticipate) {
                jankenCandidate[memberName] = (jankenCandidate[memberName] || 0) + 1;
            }
            if (data.morningWithdraw) {
                morningWithdraw[memberName] = (morningWithdraw[memberName] || 0) + 1;
            }
            if (data.bigFlag) {
                bigFlag[memberName] = (bigFlag[memberName] || 0) + 1;
            }
        }
    });

    renderRankingCard('janken-candidate-ranking', jankenCandidate);
    renderRankingCard('morning-withdraw-ranking', morningWithdraw);
    renderRankingCard('big-flag-ranking', bigFlag);
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
