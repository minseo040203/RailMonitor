// DOM 요소 참조
const queueCountEl = document.getElementById('queue-count');
const statusCardEl = document.getElementById('status-card');
const statusIconEl = document.getElementById('status-icon');
const statusTextEl = document.getElementById('status-text');
const lastUpdatedEl = document.getElementById('last-updated');

// 서버 API 주소
const API_URL = 'http://127.0.0.1:5000/api/queue';

// UI를 업데이트하는 함수
function updateQueueUI(count) {
    // 1. 숫자 업데이트
    queueCountEl.textContent = count;

    // 2. 마지막 업데이트 시간 표시
    const now = new Date();
    lastUpdatedEl.textContent = now.toLocaleTimeString('ko-KR');

    // 3. 인원수에 따라 상태 카드(메시지, 아이콘, 색상) 변경
    let text, icon, statusClass;

    if (count === 0) {
        text = "대기 인원 없음";
        icon = '✅';
        statusClass = 'status-ok'; // Green
    } else if (count > 0 && count <= 3) {
        text = `보통 (${count}명 대기)`;
        icon = '⚠️';
        statusClass = 'status-warn'; // Yellow
    } else { // 4명 이상
        text = `혼잡! (${count}명 대기)`;
        icon = '🚨';
        statusClass = 'status-busy'; // Red
    }

    // 기존 상태 클래스를 모두 지우고 새 클래스 추가
    statusCardEl.className = 'status-card'; // Reset
    statusCardEl.classList.add(statusClass);

    // 아이콘과 텍스트 내용 변경
    statusIconEl.textContent = icon;
    statusTextEl.textContent = text;
}

// 서버에 최신 대기 인원 데이터를 요청하는 함수
async function fetchAndUpdateQueue() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        updateQueueUI(data.queue_count);
    } catch (error) {
        console.error('데이터를 가져오는 데 실패했습니다:', error);
        // 에러 발생 시 초기 상태로 UI 표시
        statusIconEl.textContent = '🔄';
        statusTextEl.textContent = '서버 연결 오류';
        statusCardEl.className = 'status-card status-init';
    }
}

// 2초마다 주기적으로 서버에 데이터를 요청
setInterval(fetchAndUpdateQueue, 2000);

// 페이지 로드 시 즉시 한 번 실행
fetchAndUpdateQueue();