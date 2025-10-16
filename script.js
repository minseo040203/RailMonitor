let seatingData = {
    '1층 A구역': { total: 100, occupied: 85 }, '1층 B구역': { total: 80, occupied: 30 }, '2층 C구역 (맞이방)': { total: 150, occupied: 70 }, '2층 D구역': { total: 120, occupied: 110 },
};
let restroomData = {
    '1층 1번 출구 옆 (남)': { waiting: 8 }, '1층 1번 출구 옆 (여)': { waiting: 11 },
    '1층 6번 출구 옆 (남)': { waiting: 3 }, '1층 6번 출구 옆 (여)': { waiting: 4 },
    '2층 8번 출구 옆 (남)': { waiting: 0 }, '2층 8번 출구 옆 (여)': { waiting: 2 },
    '2층 경찰대 옆 (남)': { waiting: 1 }, '2층 경찰대 옆 (여)': { waiting: 1 },
};

const pages = document.querySelectorAll('.page');
const headerTitle = document.getElementById('header-title');
const backButton = document.getElementById('back-button');
const mapModal = document.getElementById('map-modal');

function showPage(pageId) {
    pages.forEach(p => p.classList.toggle('active', p.id === pageId));
    backButton.classList.toggle('hidden', pageId === 'main-page');
    if (pageId === 'main-page') headerTitle.innerText = '부산역 이용 현황';
    else if (pageId === 'seating-page') headerTitle.innerText = '구역별 좌석 현황';
    else if (pageId === 'restroom-page') headerTitle.innerText = '화장실별 대기 현황';
}

document.getElementById('navigate-seating').addEventListener('click', () => showPage('seating-page'));
document.getElementById('navigate-restroom').addEventListener('click', () => showPage('restroom-page'));
backButton.addEventListener('click', () => showPage('main-page'));

function getCongestionStatus(type, value) {
    if (type === 'seating') {
        const p = value * 100;
        if (p >= 70) return { text: '혼잡', class: 'congestion-crowded', bg: 'bg-congestion-crowded' };
        if (p >= 40) return { text: '보통', class: 'congestion-moderate', bg: 'bg-congestion-moderate' };
        return { text: '원활', class: 'congestion-smooth', bg: 'bg-congestion-smooth' };
    }
    if (type === 'restroom') {
        if (value >= 5) return { text: '혼잡', class: 'congestion-crowded' };
        if (value >= 2) return { text: '보통', class: 'congestion-moderate' };
        return { text: '원활', class: 'congestion-smooth' };
    }
}

function renderSeatingPage() {
    const container = document.getElementById('seating-details-container');
    container.innerHTML = Object.entries(seatingData).map(([zone, data]) => {
        const available = data.total - data.occupied, rate = data.occupied / data.total, status = getCongestionStatus('seating', rate);
        return `<div class="card p-4"><div class="flex justify-between items-center mb-2"><h3 class="text-md font-bold text-gray-800">${zone}</h3><span class="text-xs font-bold px-2.5 py-1 rounded-full text-white ${status.bg}">${status.text}</span></div><div class="w-full bg-gray-200 rounded-full h-3.5"><div class="${status.bg} h-3.5 rounded-full" style="width: ${rate * 100}%"></div></div><div class="flex justify-between text-xs mt-2 text-gray-500"><span>이용 가능: <span class="font-bold text-gray-700">${available}석</span></span><span>전체: ${data.total}석</span></div></div>`;
    }).join('');
}

function renderRestroomPage() {
    const container = document.getElementById('restroom-details-container');
    container.innerHTML = Object.entries(restroomData).map(([location, data]) => {
        const status = getCongestionStatus('restroom', data.waiting), waitTime = Math.ceil(data.waiting * 1.5);
        return `<div class="card card-clickable p-4" onclick="showMap('${location}')"><div class="flex justify-between items-center"><div><h3 class="text-md font-bold text-gray-800">${location}</h3><p class="text-gray-500 text-sm mt-1">예상 대기 시간: <span class="font-bold">${waitTime > 0 ? `${waitTime}분` : '없음'}</span></p></div><div class="text-right"><p class="text-3xl font-bold ${status.class}">${data.waiting}</p><p class="text-xs text-gray-500">대기 인원</p></div></div></div>`;
    }).join('');
}

function renderMainPage() {
    const totalSeats = Object.values(seatingData).reduce((s, v) => s + v.total, 0), totalOccupied = Object.values(seatingData).reduce((s, v) => s + v.occupied, 0);
    const status = getCongestionStatus('seating', totalOccupied / totalSeats), statusEl = document.getElementById('avg-seating-status');
    statusEl.innerText = status.text; statusEl.className = `text-lg font-bold ${status.class}`;
    const male = Object.entries(restroomData).filter(([l]) => l.includes('(남)')).sort((a, b) => a[1].waiting - b[1].waiting)[0];
    document.getElementById('best-restroom-male').textContent = `${male[0].replace(' (남)', '')} (대기 ${male[1].waiting}명)`;
    const female = Object.entries(restroomData).filter(([l]) => l.includes('(여)')).sort((a, b) => a[1].waiting - b[1].waiting)[0];
    document.getElementById('best-restroom-female').textContent = `${female[0].replace(' (여)', '')} (대기 ${female[1].waiting}명)`;
}

const locationToDotMap = {
    '1층 1번 출구 옆': 'dot-loc1', '1층 6번 출구 옆': 'dot-loc2',
    '2층 8번 출구 옆': 'dot-loc3', '2층 경찰대 옆': 'dot-loc4',
};

function showMap(locationKey) {
    mapModal.classList.remove('hidden');
    document.querySelectorAll('.location-dot').forEach(dot => dot.style.display = 'none');
    const cleanLocation = locationKey.replace(/ \((남|여)\)$/, '');
    const dotId = locationToDotMap[cleanLocation];
    if (dotId) {
        document.getElementById(dotId).style.display = 'block';
        document.getElementById('map-title').innerText = locationKey;
    }
}

function closeMap() { mapModal.classList.add('hidden'); }
mapModal.addEventListener('click', (event) => {
    if (event.target.id === 'map-modal') closeMap();
});

function renderAllPages() { renderMainPage(); renderSeatingPage(); renderRestroomPage(); }

function simulateDataUpdate() {
    Object.keys(seatingData).forEach(z => { const c = Math.floor(Math.random() * 5) - 2; seatingData[z].occupied = Math.max(0, Math.min(seatingData[z].total, seatingData[z].occupied + c)); });
    Object.keys(restroomData).forEach(l => { const c = Math.floor(Math.random() * 3) - 1; restroomData[l].waiting = Math.max(0, restroomData[l].waiting + c); });
    renderAllPages();
}

async function fetchAndUpdateData() {
    try {
        const response = await fetch('http://127.0.0.1:5000/api/all_status');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        const restroomEl = document.getElementById('live-restroom-data');
        const seatingEl = document.getElementById('live-seating-data');
        restroomEl.textContent = `대기 인원: ${data.restroom_queue_count}명`;
        seatingEl.textContent = `점유/전체: ${data.seating_occupied_count} / ${data.seating_total_seats} 석`;

    } catch (error) {
        console.error("데이터를 가져오는 데 실패했습니다:", error);
        const restroomEl = document.getElementById('live-restroom-data');
        restroomEl.textContent = "서버 연결 실패";
        const seatingEl = document.getElementById('live-seating-data');
        seatingEl.textContent = "서버 연결 실패";
    }
}

document.addEventListener('DOMContentLoaded', () => {
    renderAllPages(); 
    showPage('main-page'); 
    setInterval(simulateDataUpdate, 3000); 

    fetchAndUpdateData(); 
    setInterval(fetchAndUpdateData, 3000);
});