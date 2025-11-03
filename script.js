// [수정] script.js (144석 스케일 반영 및 데이터 통합 로직 수정)
document.addEventListener('DOMContentLoaded', () => {

    // --- STATE MANAGEMENT ---
    
    let liveDataState = {
        restroom_queue_count: 0,
        seating_occupied_count: 0,
        seating_total_seats: 144, // [수정] 기본값 144
        seating_available_seats: 144
    };

    // [수정] '1층 A구역'을 144석으로 변경 (실시간 분석 대상)
    let seatingData = {
        '1층 A구역': { total: 144, occupied: 100 }, // 실시간 데이터가 이 값을 덮어쓸 예정
        '1층 B구역': { total: 80, occupied: 30 }, 
        '2층 C구역 (맞이방)': { total: 150, occupied: 70 }, 
        '2층 D구역': { total: 120, occupied: 110 },
    };
    // [수정] '1층 1번 출구 옆 (남)'을 실시간 분석 대상으로 지정
    let restroomData = {
        '1층 1번 출구 옆 (남)': { waiting: 8 }, // 실시간 데이터가 이 값을 덮어쓸 예정
        '1층 1번 출구 옆 (여)': { waiting: 11 },
        '1층 6번 출구 옆 (남)': { waiting: 3 }, '1층 6번 출구 옆 (여)': { waiting: 4 },
        '2층 8번 출구 옆 (남)': { waiting: 0 }, '2층 8번 출구 옆 (여)': { waiting: 2 },
        '2층 경찰대 옆 (남)': { waiting: 1 }, '2층 경찰대 옆 (여)': { waiting: 1 },
    };
    const locationToDotMap = {
        '1층 1번 출구 옆': 'dot-loc1', '1층 6번 출구 옆': 'dot-loc2',
        '2층 8번 출구 옆': 'dot-loc3', '2층 경찰대 옆': 'dot-loc4',
    };
    
    // [신규] 실시간으로 업데이트할 데이터 키 지정
    const LIVE_SEAT_KEY = '1층 A구역';
    const LIVE_RESTROOM_KEY = '1층 1번 출구 옆 (남)';


    // --- DOM ELEMENTS (변경 없음) ---
    const pages = {
        home: document.getElementById('home-page'),
        congestion: document.getElementById('congestion-page'),
        ticket: document.getElementById('ticket-page')
    };
    const headers = {
        main: document.getElementById('main-header'),
        congestion: document.getElementById('congestion-header'),
    };
    const bottomNav = document.getElementById('bottom-nav');
    const backButton = document.getElementById('back-button');
    const headerTitle = document.getElementById('header-title');
    const mapModal = document.getElementById('map-modal');
    const closeMapButton = document.getElementById('close-map-button');

    // --- NAVIGATION (변경 없음) ---
    let congestionSubPage = 'main'; // 'main', 'seating', 'restroom'
    
    function renderBottomNav(activeItemName = '홈') {
        const bottomNavContainer = document.getElementById('bottom-nav');
        if (!bottomNavContainer) return;

        const navItems = [
            { name: '홈' }, 
            { name: '혜택·정기권' }, 
            { name: '여행상품·패스' }, 
            { name: '나의티켓' }
        ];
        const navIcons = {
            '홈': `<svg class="mx-auto h-6 w-6 mb-0.5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h7.5"></path></svg>`,
            '혜택·정기권': `<svg class="mx-auto h-6 w-6 mb-0.5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-1.5h5.25m-5.25 0h5.25m-5.25 0h5.25m-5.25 0h5.25M3 13.5h5.25m2.25-3h5.25m-5.25 0h5.25m-5.25 0h5.25m-5.25 0h5.25M3 7.5h5.25M5.25 6h3.75m-3.75 0h3.75M5.25 18h3.75m-3.75 0h3.75m6-12h3.75m-3.75 0h3.75M9 3.75H6.75A2.25 2.25 0 004.5 6v12a2.25 2.25 0 002.25 2.25h10.5A2.25 2.25 0 0019.5 18V6A2.25 2.25 0 0017.25 3.75H15M12 3v18"></path></svg>`,
            '여행상품·패스': `<svg class="mx-auto h-6 w-6 mb-0.5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"></path></svg>`,
            '나의티켓': `<svg class="mx-auto h-6 w-6 mb-0.5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 6.75l-1.5-1.5-6.75 6.75-1.5-1.5-1.5 1.5 3 3 8.25-8.25z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>`
        };
        
        bottomNavContainer.innerHTML = navItems.map(item => {
            const isActive = (item.name === activeItemName);
            const icon = navIcons[item.name] || '';
            const activeIcon = icon.replace('stroke="currentColor"', 'stroke="#005bac"').replace('fill="none"', 'fill="#005bac"');
            const inactiveIcon = icon.replace('stroke="#005bac"', 'stroke="currentColor"').replace('fill="#005bac"', 'fill="none"');
            
            return `
            <div class="text-center cursor-pointer ${isActive ? 'korail-blue-text' : ''}">
                ${isActive ? activeIcon : inactiveIcon}
                <span class="${isActive ? 'font-bold' : ''}">${item.name}</span>
            </div>`;
        }).join('');

        bottomNavContainer.children[0].addEventListener('click', () => navigateTo('home'));
        bottomNavContainer.children[1].addEventListener('click', () => alert('혜택·정기권 (미구현)'));
        bottomNavContainer.children[2].addEventListener('click', () => alert('여행상품·패스 (미구현)'));
        bottomNavContainer.children[3].addEventListener('click', () => navigateTo('ticket'));
    }

    function navigateTo(pageName) {
        Object.values(pages).forEach(p => p.classList.remove('active', 'block') && p.classList.add('hidden'));
        Object.values(headers).forEach(h => h.classList.add('hidden'));
        bottomNav.classList.add('hidden');
        
        if (pageName === 'home') {
            pages.home.classList.add('active');
            pages.home.classList.remove('hidden');
            headers.main.classList.remove('hidden');
            bottomNav.classList.remove('hidden');
            renderBottomNav('홈');
        } else if (pageName === 'congestion') {
            pages.congestion.classList.add('active');
            pages.congestion.classList.remove('hidden');
            headers.congestion.classList.remove('hidden');
            backButton.style.visibility = 'visible';
            renderCongestionPage();
        } else if (pageName === 'ticket') {
            pages.ticket.classList.add('active');
            pages.ticket.classList.remove('hidden');
            headers.congestion.classList.remove('hidden');
            headerTitle.innerText = '나의티켓';
            backButton.style.visibility = 'hidden';
            bottomNav.classList.remove('hidden');
            renderTicketPage(); 
            renderBottomNav('나의티켓');
        }
    }
    
    backButton.addEventListener('click', () => {
        if (congestionSubPage === 'main') {
            navigateTo('home');
        } else {
            congestionSubPage = 'main';
            renderCongestionPage();
        }
    });

    // --- RENDER FUNCTIONS ---
    
    function renderHomePage() {
        // (이 함수는 변경 없음)
        const serviceGrid = document.getElementById('service-grid');
        const services = ["길안내", "열차위치", "주차", "공항버스", "렌터카", "카셰어링", "짐배송", "커피&빵", "시설 혼잡도"];
        const serviceIcons = {
          "길안내": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
          "열차위치": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 2a5 5 0 0 1 5 5c0 .34-.04.68-.1 1H8.1A5.02 5.02 0 0 1 12 4z"/></svg>`,
          "주차": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11C5.84 5 5.28 5.42 5.08 6.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-1.17 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>`,
          "공항버스": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18 4H6C3.79 4 2 5.79 2 8v5c0 1.66 1.34 3 3 3h1v1c0 .55.45 1 1 1h10c.55 0 1-.45 1-1v-1h1c1.66 0 3-1.34 3-3V8c0-2.21-1.79-4-4-4zm-1.5 9h-9c-.28 0-.5-.22-.5-.5s.22-.5.5-.5h9c.28 0 .5.22.5.5s-.22.5-.5.5zM18 8H6c-.55 0-1-.45-1-1s.45-1 1-1h12c.55 0 1 .45 1 1s-.45 1-1 1z"/></svg>`,
          "렌터카": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11C5.84 5 5.28 5.42 5.08 6.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-1.17 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>`,
          "카셰어링": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11C5.84 5 5.28 5.42 5.08 6.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-1.17 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>`,
          "짐배송": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M20 8h-3V4H7v4H4c-1.1 0-2 .9-2 2v10h20V10c0-1.1-.9-2-2-2zM9 4h6v4H9V4zm11 15H4v-8h16v8z"/></svg>`,
          "커피&빵": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z"/></svg>`,
          "시설 혼잡도": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
        };
        serviceGrid.innerHTML = services.map(service => `
            <div data-service="${service}" class="flex flex-col items-center cursor-pointer">
              <div class="w-12 h-12 flex items-center justify-center text-blue-600 text-3xl">
                  ${serviceIcons[service] || ''}
              </div>
              <span class="text-xs text-gray-600 mt-1">${service}</span>
            </div>
        `).join('');
        serviceGrid.querySelector('[data-service="시설 혼잡도"]').addEventListener('click', () => navigateTo('congestion'));
    }

    
    /**
     * [수정] 티켓 HTML 생성기 (변경 없음)
     */
    function createTicketHTML(ticket, recs, wrapperClass = 'p-4') {
        let platformHTML = '';
        if (ticket.isFutureTicket) {
            platformHTML = `
            <div class="p-3">
                <svg class="w-8 h-8 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.667 0l3.181-3.183m-4.991-4.992v4.992m0 0h-4.992m4.992 0l-3.181-3.183a8.25 8.25 0 00-11.667 0l-3.181 3.183" /></svg>
                <span class="text-xs text-gray-500 mt-1">15분전에<br>표시됩니다</span>
            </div>`;
        } else {
            platformHTML = `
            <div class="p-3">
                <span class="text-3xl font-bold text-gray-700">-</span>
                <span class="text-xs text-gray-500 mt-1">이용완료</span>
            </div>`;
        }

        return `
            <div class="${wrapperClass}">
                <div class="bg-white rounded-lg shadow-lg overflow-hidden">
                    <div class="flex border-b font-semibold">
                        <div class="flex-1 text-center py-3 border-b-2 ${ticket.isFutureTicket ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}">승차권 (1)</div>
                        <div class="flex-1 text-center py-3 text-gray-500">이용권</div>
                        <div class="flex-1 text-center py-3 text-gray-500">정기권·패스</div>
                    </div>
                    
                    <div class="p-4">
                        <div class="text-sm font-semibold text-gray-600 bg-gray-100 p-2 rounded-t-md flex justify-between">
                            <span>${ticket.date}</span>
                            <span class="text-blue-600">${ticket.isFutureTicket ? '스마트티켓 1매' : '이용완료 1매'}</span>
                        </div>
                        
                        <div class="flex items-center justify-between py-3">
                            <div class="text-center">
                                <p class="text-2xl font-bold text-gray-800">${ticket.depStation}</p>
                                <p class="text-3xl font-bold text-gray-800">${ticket.depTime}</p>
                            </div>
                            <svg class="w-6 h-6 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" /></svg>
                            <div class="text-center">
                                <p class="text-2xl font-bold text-gray-800">${ticket.arrStation}</p>
                                <p class="text-3xl font-bold text-gray-800">${ticket.arrTime}</p>
                            </div>
                        </div>

                        <div class="flex justify-between items-center border-t pt-3">
                            <span class="text-lg font-bold text-gray-700">KTX-산천 ${ticket.trainNum}</span>
                            <div>
                                <button class="text-sm border rounded-full px-3 py-1 text-gray-600">차내시설</button>
                                <button class="text-sm border rounded-full px-3 py-1 text-gray-600">열차시각</button>
                            </div>
                        </div>

                        <div class="ticket-grid mt-4">
                            <div class="bg-gray-50 text-sm font-semibold text-gray-600 !p-2">타는곳번호</div>
                            <div class="bg-gray-50 text-sm font-semibold text-gray-600 !p-2">호차번호</div>
                            <div class="bg-gray-50 text-sm font-semibold text-gray-600 !p-2">좌석번호</div>
                            <div class="bg-gray-50 text-sm font-semibold text-gray-600 !p-2">운임영수증</div>
                            
                            ${platformHTML}
                            
                            <div class="p-3">
                                <span class="text-4xl font-bold text-gray-800">${ticket.carNum}</span><span class="font-semibold">호차</span>
                            </div>
                            <div class="p-3">
                                <span class="text-4xl font-bold text-blue-600">${ticket.seatNum}</span>
                            </div>
                            <div class="p-3">
                                <img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=KORAIL-${ticket.ticketNum}" alt="QR Code" class="w-20 h-20">
                            </div>
                            
                            <div class="col-span-4 text-sm text-gray-500 p-3">
                                ${ticket.seatInfo}<br>
                                승차권번호: ${ticket.ticketNum}
                            </div>

                            <div class="col-span-4 text-sm p-3 bg-gray-50">
                                <div class="flex justify-between items-center">
                                    <div>
                                        <h4 class="font-bold text-gray-700 mb-2">💡 ${ticket.isFutureTicket ? '출발역(부산역)' : '도착역(부산역)'} 편의시설 추천</h4>
                                        <div class="space-y-1 text-xs text-gray-600">
                                            <p><strong>· 쾌적한 좌석:</strong> ${recs.bestSeatingName} (현재 ${recs.bestSeatingRate.toFixed(0)}% 점유)</p>
                                            <p><strong>· 한산한 남자화장실:</strong> ${recs.bestMaleName} (대기 ${recs.bestMaleWaiting}명)</p>
                                            <p><strong>· 한산한 여자화장실:</strong> ${recs.bestFemaleName} (대기 ${recs.bestFemaleWaiting}명)</p>
                                        </div>
                                    </div>
                                    <div class="flex-shrink-0 ml-4">
                                        <button class="congestion-shortcut-btn bg-white text-blue-600 border border-blue-500 rounded-full px-3 py-2 text-xs font-semibold shadow-sm hover:bg-blue-50">
                                            혼잡도<br>바로가기
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            ${ticket.isFutureTicket ? `
            <div class="p-4 pt-0">
                <div class="bg-white rounded-lg shadow-lg p-4">
                    <h3 class="text-md font-semibold text-gray-800 mb-4">이런 서비스 어떠세요?</h3>
                    <div class="grid grid-cols-4 gap-4 text-center text-sm text-gray-600">
                        <div class="cursor-pointer">
                            <svg class="w-10 h-10 mx-auto text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                            <span class="mt-1 block">철도범죄<br>신고</span>
                        </div>
                        <div class="cursor-pointer">
                            <svg class="w-10 h-10 mx-auto text-blue-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zM17 13c-1.1 0-2 .9-2 2v2H9v-2c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v5h18v-5c0-1.1-.9-2-2-2h-2z" /></svg>
                            <span class="mt-1 block">승하차<br>도우미 신청</span>
                        </div>
                        <div class="cursor-pointer">
                            <svg class="w-10 h-10 mx-auto text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                            <span class="mt-1 block">보호자<br>안심 SMS</span>
                        </div>
                        <div class="cursor-pointer">
                            <svg class="w-10 h-10 mx-auto text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 5.314l9.566 5.314m0 0a2.25 2.25 0 100-2.186m0 2.186c-.18-.324-.283-.696-.283-1.093s.103-.77.283-1.093m0 2.186l-9.566-5.314m9.566 5.314l-9.566 5.314" /></svg>
                            <span class="mt-1 block">일정공유</span>
                        </div>
                    </div>
                    <button class="w-full mt-4 py-3 bg-gray-100 text-gray-700 font-semibold rounded-lg">부가서비스 더보기</button>
                </div>
            </div>` : ''}
        `;
    }

    /** [수정] 나의티켓 페이지 렌더링 함수 (데이터 통합 로직) */
    function renderTicketPage() {
        const container = pages.ticket;
        const pad = (num) => String(num).padStart(2, '0');
        const dateOptions = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
        
        // --- 1. 실시간 추천 데이터 계산 (공통) ---
        // [수정] 실시간 데이터를 덮어쓴 복사본으로 추천 데이터 생성
        const currentSeatingData = { ...seatingData };
        currentSeatingData[LIVE_SEAT_KEY] = { 
            total: liveDataState.seating_total_seats || 144, 
            occupied: liveDataState.seating_occupied_count || 0 
        };
        const bestSeating = Object.entries(currentSeatingData).sort((a, b) => {
            const rateA = (a[1].total > 0) ? (a[1].occupied / a[1].total) : 1;
            const rateB = (b[1].total > 0) ? (b[1].occupied / b[1].total) : 1;
            return rateA - rateB;
        })[0];
        
        const currentRestroomData = { ...restroomData };
        currentRestroomData[LIVE_RESTROOM_KEY] = { 
            waiting: liveDataState.restroom_queue_count || 0 
        };
        const allRestroomsList = Object.entries(currentRestroomData);
        
        const maleList = allRestroomsList.filter(([l]) => l.includes('(남)'));
        const bestMale = maleList.length > 0 
            ? maleList.sort((a, b) => a[1].waiting - b[1].waiting)[0] 
            : ['정보 없음', { waiting: 0 }];

        const femaleList = allRestroomsList.filter(([l]) => l.includes('(여)'));
        const bestFemale = femaleList.length > 0 
            ? femaleList.sort((a, b) => a[1].waiting - b[1].waiting)[0] 
            : ['정보 없음', { waiting: 0 }];

        const recommendations = {
            bestSeatingName: bestSeating[0],
            bestSeatingRate: (bestSeating[1].total > 0) ? (bestSeating[1].occupied / bestSeating[1].total) * 100 : 0,
            bestMaleName: bestMale[0].replace(' (남)', ''),
            bestMaleWaiting: bestMale[1].waiting,
            bestFemaleName: bestFemale[0].replace(' (여)', ''),
            bestFemaleWaiting: bestFemale[1].waiting
        };

        // --- 2. 티켓 1 (미래) 데이터 ---
        const now = new Date();
        const departureTime1 = new Date(now.getTime() + 30 * 60000); 
        const arrivalTime1 = new Date(departureTime1.getTime() + 210 * 60000); 

        const ticket1Data = {
            isFutureTicket: true,
            depStation: "부산",
            arrStation: "서울",
            date: departureTime1.toLocaleDateString('ko-KR', dateOptions),
            depTime: `${pad(departureTime1.getHours())}:${pad(departureTime1.getMinutes())}`,
            arrTime: `${pad(arrivalTime1.getHours())}:${pad(arrivalTime1.getMinutes())}`,
            trainNum: "019",
            carNum: "5",
            seatNum: "2A",
            seatInfo: "일반실 | 순방향 | 어른",
            ticketNum: "82111-1234-56789-00"
        };
        
        // --- 3. 티켓 2 (과거) 데이터 ---
        const arrivalTime2 = new Date(now.getTime() - 10 * 60000); 
        const departureTime2 = new Date(arrivalTime2.getTime() - 210 * 60000); 

        const ticket2Data = {
            isFutureTicket: false,
            depStation: "서울",
            arrStation: "부산",
            date: arrivalTime2.toLocaleDateString('ko-KR', dateOptions),
            depTime: `${pad(departureTime2.getHours())}:${pad(departureTime2.getMinutes())}`,
            arrTime: `${pad(arrivalTime2.getHours())}:${pad(arrivalTime2.getMinutes())}`,
            trainNum: "045",
            carNum: "8",
            seatNum: "7C",
            seatInfo: "일반실 | 역방향 | 어른",
            ticketNum: "82111-9876-54321-00"
        };

        // --- 4. HTML 렌더링 ---
        container.innerHTML = createTicketHTML(ticket1Data, recommendations, 'p-4') + 
                              createTicketHTML(ticket2Data, recommendations, 'p-4 pt-0');
        
        // --- 5. 바로가기 버튼에 이벤트 리스너 추가 ---
        document.querySelectorAll('.congestion-shortcut-btn').forEach(button => {
            button.addEventListener('click', () => {
                navigateTo('congestion');
            });
        });
    }

    function getCongestionStatus(type, value) {
        // (이 함수는 변경 없음)
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

    /** [수정] 혼잡도 페이지 렌더링 (데이터 통합 로직) */
    function renderCongestionPage() {
        const mainContent = document.getElementById('congestion-main-content');
        const seatingContainer = document.getElementById('seating-details-container');
        const restroomContainer = document.getElementById('restroom-details-container');

        mainContent.innerHTML = '';
        seatingContainer.innerHTML = '';
        restroomContainer.innerHTML = '';

        // [신규] 렌더링 시점의 실시간 데이터가 반영된 복사본 생성
        const currentSeatingData = { ...seatingData };
        currentSeatingData[LIVE_SEAT_KEY] = { 
            total: liveDataState.seating_total_seats || 144, 
            occupied: liveDataState.seating_occupied_count || 0 
        };
        const currentRestroomData = { ...restroomData };
        currentRestroomData[LIVE_RESTROOM_KEY] = { 
            waiting: liveDataState.restroom_queue_count || 0 
        };

        if (congestionSubPage === 'main') {
            headerTitle.innerText = '부산역 이용 현황';
            
            // [수정] 복사본 기준으로 총합 계산
            const totalOccupied = Object.values(currentSeatingData).reduce((s, v) => s + v.occupied, 0);
            const totalSeats = Object.values(currentSeatingData).reduce((s, v) => s + v.total, 0);
            const totalRate = (totalSeats > 0) ? (totalOccupied / totalSeats) : 0;
            const totalStatus = getCongestionStatus('seating', totalRate);

            const allRestroomsList = Object.entries(currentRestroomData);
            
            const maleList = allRestroomsList.filter(([l]) => l.includes('(남)'));
            const bestMale = maleList.length > 0 
                ? maleList.sort((a, b) => a[1].waiting - b[1].waiting)[0] 
                : ['정보 없음', { waiting: 0 }];

            const femaleList = allRestroomsList.filter(([l]) => l.includes('(여)'));
            const bestFemale = femaleList.length > 0 
                ? femaleList.sort((a, b) => a[1].waiting - b[1].waiting)[0] 
                : ['정보 없음', { waiting: 0 }];

            // (HTML 렌더링 로직은 기존과 동일)
            mainContent.innerHTML = `
                <div class="mb-5 text-left"><h2 class="text-xl font-bold text-gray-800">편의시설 혼잡도 안내</h2><p class="text-gray-500 text-sm">부산역 편의시설의 실시간 혼잡도 정보입니다.</p></div>
                
                <div id="navigate-seating" class="card card-clickable p-4 mb-4">
                    <div class="flex items-center">
                        <div class="p-3 bg-blue-50 rounded-full mr-4"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#004d9e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg></div>
                        <div class="flex-1">
                            <h2 class="text-lg font-bold text-gray-800">대기 좌석 현황</h2>
                            <p class="text-sm text-gray-500">층/구역별 좌석 정보를 확인하세요.</p>
                        </div>
                        <div class="text-right">
                            <p class="text-lg font-bold ${totalStatus.class}">${totalStatus.text}</p>
                            <span class="text-xs text-gray-500">전체 ${totalOccupied} / ${totalSeats} 석</span>
                        </div>
                    </div>
                </div>

                <div id="navigate-restroom" class="card card-clickable p-4">
                    <div class="flex items-center mb-3">
                        <div class="p-3 bg-green-50 rounded-full mr-4"><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 240 240"><circle cx="70" cy="45" r="20" fill="#007bff"/><path d="M50 70 L50 140 L40 210 L60 210 L70 150 L80 210 L100 210 L90 140 L90 70 Z" fill="#007bff"/><circle cx="170" cy="45" r="20" fill="#ff2b2b"/><path d="M150 70 L190 70 L210 140 L130 140 Z" fill="#ff2b2b"/><rect x="154" y="140" width="12" height="70" fill="#ff2b2b"/><rect x="174" y="140" width="12" height="70" fill="#ff2b2b"/></svg></div>
                        <div>
                            <h2 class="text-lg font-bold text-gray-800">화장실 현황</h2>
                            <p class="text-sm text-gray-500">가장 한산한 화장실을 이용하세요.</p>
                        </div>
                    </div>
                    <div class="space-y-2">
                        <div class="flex justify-between items-center bg-gray-50 p-2 rounded-md text-sm">
                            <span class="font-semibold text-blue-600">남자 화장실</span>
                            <span class="text-gray-700 font-medium">${bestMale[0].replace(' (남)', '')} (대기 ${bestMale[1].waiting}명)</span>
                        </div>
                        <div class="flex justify-between items-center bg-gray-50 p-2 rounded-md text-sm">
                            <span class="font-semibold text-red-500">여자 화장실</span>
                            <span class="text-gray-700 font-medium">${bestFemale[0].replace(' (여)', '')} (대기 ${bestFemale[1].waiting}명)</span>
                        </div>
                    </div>
                </div>`;
            document.getElementById('navigate-seating').addEventListener('click', () => { congestionSubPage = 'seating'; renderCongestionPage(); });
            document.getElementById('navigate-restroom').addEventListener('click', () => { congestionSubPage = 'restroom'; renderCongestionPage(); });

        } else if (congestionSubPage === 'seating') {
            headerTitle.innerText = '구역별 좌석 현황';
            
            const videoCard = `
                <div class="card p-2 mb-4">
                    <h3 class="text-md font-bold text-gray-800 px-2 pt-1">좌석 실시간 분석 영상 (샘플)</h3>
                    <img src="http://127.0.0.1:5000/video_feed_seating" class="w-full rounded-md" alt="좌석 분석 스트리밍" />
                </div>
            `;
            
            // [수정] liveSeatingCard 삭제, detailsCards가 동적으로 처리
            const detailsCards = Object.entries(currentSeatingData).map(([zone, data]) => {
                const available = data.total - data.occupied;
                const rate = (data.total > 0) ? (data.occupied / data.total) : 0;
                const status = getCongestionStatus('seating', rate);
                const isLive = (zone === LIVE_SEAT_KEY);
                
                return `
                <div class="card p-4 ${isLive ? 'border-2 border-blue-500' : ''}">
                    <div class="flex justify-between items-center mb-2">
                        <h3 class="text-md font-bold ${isLive ? 'text-blue-700' : 'text-gray-800'}">${isLive ? '[실시간] ' : ''}${zone}</h3>
                        <span class="text-xs font-bold px-2.5 py-1 rounded-full text-white ${status.bg}">${status.text}</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-3.5">
                        <div class="${status.bg} h-3.5 rounded-full" style="width: ${rate * 100}%"></div>
                    </div>
                    <div class="flex justify-between text-xs mt-2 text-gray-500">
                        <span>이용 가능: <span class="font-bold text-gray-700">${available}석</span></span>
                        <span>전체: ${data.total}석</span>
                    </div>
                </div>`;
            }).join('');
            
            seatingContainer.innerHTML = videoCard + detailsCards;

        } else if (congestionSubPage === 'restroom') {
            headerTitle.innerText = '화장실별 대기 현황';
            
            const videoCard = `
                <div class="card p-2 mb-4">
                    <h3 class="text-md font-bold text-gray-800 px-2 pt-1">화장실 실시간 분석 영상</h3>
                    <img src="http://127.0.0.1:5000/video_feed_restroom" class="w-full rounded-md" alt="화장실 분석 스트리밍" />
                </div>
            `;

            // [수정] liveRestroomCard 삭제, detailsCards가 동적으로 처리
            const detailsCards = Object.entries(currentRestroomData).map(([location, data]) => {
                const status = getCongestionStatus('restroom', data.waiting), waitTime = Math.ceil(data.waiting * 1.5);
                const isLive = (location === LIVE_RESTROOM_KEY);
                
                return `
                <div class="card card-clickable p-4 ${isLive ? 'border-2 border-blue-500' : ''}" data-location="${location}">
                    <div class="flex justify-between items-center">
                        <div>
                            <h3 class="text-md font-bold ${isLive ? 'text-blue-700' : 'text-gray-800'}">${isLive ? '[실시간] ' : ''}${location}</h3>
                            <p class="text-gray-500 text-sm mt-1">예상 대기 시간: <span class="font-bold">${waitTime > 0 ? `${waitTime}분` : '없음'}</span></p>
                        </div>
                        <div class="text-right">
                            <p class="text-3xl font-bold ${status.class}">${data.waiting}</p>
                            <p class="text-xs text-gray-500">대기 인원</p>
                        </div>
                    </div>
                </div>`;
            }).join('');

            restroomContainer.innerHTML = videoCard + detailsCards;

            document.querySelectorAll('[data-location]').forEach(el => {
                el.addEventListener('click', () => showMap(el.dataset.location));
            });
        }
    }

    // --- MAP MODAL (변경 없음) ---
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
    mapModal.addEventListener('click', (event) => { if (event.target.id === 'map-modal') closeMap(); });
    closeMapButton.addEventListener('click', closeMap);

    // --- DATA SIMULATION & FETCHING (변경 없음) ---

    function simulateDataUpdate() {
        // [수정] 이 로직은 seatingData[z].total을 동적으로 읽으므로 수정 불필요
        Object.keys(seatingData).forEach(z => { 
            const c = Math.floor(Math.random() * 5) - 2; 
            seatingData[z].occupied = Math.max(0, Math.min(seatingData[z].total, seatingData[z].occupied + c)); 
        });
        Object.keys(restroomData).forEach(l => { 
            const c = Math.floor(Math.random() * 3) - 1; 
            restroomData[l].waiting = Math.max(0, restroomData[l].waiting + c); 
        });
        
        if(pages.congestion.classList.contains('active') && congestionSubPage !== 'main') {
            renderCongestionPage();
        }
    }

    async function fetchAndUpdateData() {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/all_status');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            
            liveDataState = data; 

            if (pages.congestion.classList.contains('active')) {
                renderCongestionPage();
            }
            
        } catch (error) {
            console.error("데이터를 가져오는 데 실패했습니다:", error);
            if (pages.congestion.classList.contains('active') && congestionSubPage === 'main') {
                const seatingEl = document.getElementById('navigate-seating')?.querySelector('.text-right p');
                if (seatingEl) {
                    seatingEl.textContent = "연결 실패";
                    seatingEl.className = "text-lg font-bold congestion-crowded";
                }
            }
        }
    }
    
    // --- INITIALIZATION (변경 없음) ---
    
    function updateDepartureDate() {
        const dateEl = document.getElementById('departure-date');
        if (dateEl) {
            const now = new Date();
            const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
            dateEl.textContent = now.toLocaleDateString('ko-KR', options);
        }
    }
    
    updateDepartureDate(); 
    renderHomePage(); 
    navigateTo('home'); 
    
    setInterval(simulateDataUpdate, 1000);
    setInterval(fetchAndUpdateData, 1000); 
    
    fetchAndUpdateData();
});