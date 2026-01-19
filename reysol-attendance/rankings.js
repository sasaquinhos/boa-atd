const API_URL = 'https://script.google.com/macros/s/AKfycbw1dutfDLvVkwzHPb1l2mWyc2FUw4dEPYVzE913fMG1HcnIbd1FLs1OBdFD4lwPaLmNmg/exec';

const state = {
    matches: [],
    attendance: {},
    members: [],
    selectedYear: new Date().getFullYear()
};

async function init() {
    showLoading(true);
    try {
        const response = await fetch(API_URL);
        const data = await response.json();

        state.matches = data.matches || [];
        state.attendance = data.attendance || {};
        state.members = data.members || [];

        setupYearSelect();
        renderRankings();
    } catch (e) {
        console.error('Failed to load data:', e);
        alert('データの読み込みに失敗しました');
    } finally {
        showLoading(false);
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
    const matchIds = new Set(yearMatches.map(m => String(m.id)));

    Object.keys(state.attendance).forEach(key => {
        const [matchId, memberName] = key.split('_');
        if (matchIds.has(matchId)) {
            const data = state.attendance[key];
            if (data.jankenParticipate) {
                jankenCandidate[memberName] = (jankenCandidate[memberName] || 0) + 1;
            }
        }
    });

    renderRankingCard('janken-candidate-ranking', jankenCandidate);
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
