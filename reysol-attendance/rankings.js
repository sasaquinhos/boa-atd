const API_URL = 'https://script.google.com/macros/s/AKfycbwjL6Zii0EdQHzlOvQNS1LprDJ8VfGWQ_yrS8jqj63wMT4erN_RXUNKbKTaBzyoBFLjkA/exec';

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
    console.log('Year selected:', state.selectedYear);
    // Rankings rendering is disabled for now
}

function renderRankingCard(containerId, counts) {
    // Disabled for now
}

function showLoading(show) {
    document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

init();
