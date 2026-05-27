// ===== 전역 변수 및 서브시스템 초기화 =====
let currentPlacesData = [];
let googleMapObj = null;
let currentPage = 1;
const itemsPerPage = 9;
const SERVER_URL = "http://192.168.121.1:5000";

const SERVER_URL = "http://localhost:5000"; // ASP.NET 백엔드 서버 포트
let serverSavedIds = [];                    // 서버에서 동기화된 찜하기 ID 리스트 배열

document.addEventListener('DOMContentLoaded', function () {
    if (typeof google !== 'undefined' && google.maps) {
        initializeApp();
    } else {
        console.warn("⚠️ 구글 맵 API 로드 지연. 1초 후 재시도.");
        setTimeout(initializeApp, 1000);
    }
});

// ===== 앱 스타트업 프로토콜 =====
async function initializeApp() {
    await loadLiveGooglePlaces();
    updateAuthUI(); // 로그인 세션 및 위시리스트 초기 동기화 가동
    setupEventListeners();
    fetchWeatherData();
}

// ===== 🔐 [로그인 상태 업데이트 엔진] =====
function updateAuthUI() {
    const token = localStorage.getItem("userToken");
    const authBtn = document.getElementById('authNavBtn');
    if (token) {
        authBtn.textContent = "로그아웃";
        authBtn.onclick = handleLogout;
        loadSavedPlaces(); // 로그인 완료 시 서버에서 위시리스트 가져오기
    } else {
        authBtn.textContent = "로그인";
        authBtn.onclick = openAuthModal;
        serverSavedIds = [];
        updateSavedCount();
        renderPlaces(currentPlacesData);
    }
}

// ===== 실시간 구글 데이터 커넥터 =====
async function loadLiveGooglePlaces() {
    const url = "https://places.googleapis.com/v1/places:searchText";
    const apiKey = "AIzaSyBscd9CRA6SNMFDu-_U58LSRcAe4629X80";
    const requestData = { textQuery: "부산 맛집", languageCode: "ko", maxResultCount: 20 };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": apiKey,
                // 💡 [필드마스크 확장] 끝부분에 'places.reviews'를 추가하여 실제 유저 리뷰를 연동합니다!
                "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.photos,places.reviews,places.nationalPhoneNumber"

            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) throw new Error(`서버 응답 에러: ${response.status}`);
        const data = await response.json();

        if (data.places && data.places.length > 0) {
            currentPlacesData = data.places.map((place, index) => {
                let region = "기타";
                if (place.formattedAddress.includes("해운대")) region = "해운대";
                else if (place.formattedAddress.includes("수영") || place.formattedAddress.includes("광안")) region = "광안리";
                else if (place.formattedAddress.includes("부산진") || place.formattedAddress.includes("서면")) region = "서면";
                else if (place.formattedAddress.includes("중구") || place.formattedAddress.includes("남포")) region = "남포동";
                else if (place.formattedAddress.includes("기장")) region = "송정";

                let imgUrl = "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23ddd%22 width=%22400%22 height=%22300%22/%3E%3C/svg%3E";
                if (place.photos && place.photos.length > 0) {
                    const photoId = place.photos[0].name.split('/').pop();
                    imgUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoId}&key=${apiKey}`;
                }

                return {
                    id: index + 1,
                    title: place.displayName.text,
                    region: region,
                    atmosphere: index % 2 === 0 ? "데이트" : "모임",
                    price: index % 3 === 0 ? "moderate" : "budget",
                    mealType: "한식",
                    image: imgUrl,
                    description: `부산에서 알아주는 맛집입니다`,
                    rating: place.rating ? place.rating.toFixed(1) : "4.3",
                    reviews: place.userRatingCount || 0,
                    address: place.formattedAddress || "부산 주소지 확인 중",
                    phone: place.nationalPhoneNumber || "전화번호 정보가 없습니다.",
                    latitude: place.location.latitude,
                    longitude: place.location.longitude,

                    // 💡 [구글 진짜 리뷰 매핑] 구글 서버에서 가져온 실제 리뷰 배열(place.reviews)이 있으면 가공하고, 없으면 기본 메시지를 띄웁니다.
                    googleReviews: place.reviews ? place.reviews.map(r => ({
                        author: r.authorAttribution?.displayName || "익명의 구글 사용자",
                        date: r.relativePublishTimeDescription || "최근",
                        text: r.text?.text || "텍스트 리뷰가 없습니다.",
                        starRating: r.rating || 5
                    })) : [{ author: "안내", date: "현재", text: "등록된 구글 텍스트 리뷰가 없습니다.", starRating: 5 }]
                };
            });
        }
    } catch (error) {
        console.error('API 호출 실패:', error);
        document.getElementById('placesGrid').innerHTML = `<div class="empty-message">실시간 데이터를 로드하지 못했습니다.</div>`;
        return;
    }
    currentPage = 1;
    renderPlaces(currentPlacesData);
}
// ===== 🎰 9개씩 분면 처리하는 조작 시스템 =====
function renderPlaces(places) {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    renderPlacesInGrid(places.slice(start, end), 'placesGrid');
    renderPaginationBar(places.length);
}

// ===== 하단 인터페이스 버튼 네비게이션 생성기 =====
function renderPaginationBar(totalItems) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const grid = document.getElementById('placesGrid');
    if (!grid) return;

    let bar = document.getElementById('paginationBar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'paginationBar';
        bar.style.cssText = "display: flex; justify-content: center; align-items: center; gap: 10px; margin-top: 40px; width: 100%; grid-column: 1 / -1;";
        grid.parentNode.insertBefore(bar, grid.nextSibling);
    }
    if (totalPages <= 1) { bar.innerHTML = ''; return; }

    let html = `<button class="reset-filters" style="padding: 6px 12px; background: ${currentPage === 1 ? '#ccc' : 'var(--dark)'};" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>이전</button>`;
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="reset-filters" style="padding: 6px 14px; background: ${currentPage === i ? 'var(--primary)' : 'var(--dark)'}; font-weight: ${currentPage === i ? '700' : '500'};" onclick="changePage(${i})">${i}</button>`;
    }
    html += `<button class="reset-filters" style="padding: 6px 12px; background: ${currentPage === totalPages ? '#ccc' : 'var(--dark)'};" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>다음</button>`;
    bar.innerHTML = html;
}

function changePage(pageNumber) {
    currentPage = pageNumber;
    renderPlaces(currentPlacesData);
    document.getElementById('explore').scrollIntoView({ behavior: 'smooth' });
}

// ===== 💡 [자세히 보기 버튼 완벽 복구 버전] UI 카드 렌더링 파이프라인 =====
function renderPlacesInGrid(places, gridId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    if (places.length === 0) { grid.innerHTML = '<p class="empty-message">결과가 없습니다.</p>'; return; }

    // 메인화면의 하트 단추는 흔적도 없이 지웠고, [자세히 보기] 단추의 호출 메커니즘을 100% 무결하게 복구했습니다.
    grid.innerHTML = places.map(place => `
        <div class="place-card">
            <div class="place-image">
                <img src="${place.image}" alt="${place.title}">
            </div>
            <div class="place-content">
                <h3 class="place-title">${place.title}</h3>
                <div class="place-meta"><span class="badge region">${place.region}</span><span class="badge atmosphere">${place.atmosphere}</span></div>
                <p class="place-description">${place.description}</p>
                <div class="place-rating"><span class="stars">★★★★★</span><span>${place.rating} (${place.reviews}개)</span></div>
                <div class="place-actions">
                    <button class="btn-secondary" style="width:100%; cursor:pointer;" onclick="openPlaceModal(event, ${place.id})">자세히 보기</button>
                </div>
            </div>
        </div>
    `).join('');
}

// ===== 📡 [서버 DB 연동 위시리스트 스토리지 서브시스템] =====
async function loadSavedPlaces() {
    const token = localStorage.getItem("userToken");
    if (!token) return;

    try {
        const res = await fetch(`${SERVER_URL}/api/wishlist/${token}`);
        if (res.ok) {
            serverSavedIds = await res.json();
            updateSavedCount();

            // 저장됨 탭 그리드 동적 반영
            const savedPlaces = currentPlacesData.filter(p => serverSavedIds.includes(p.id));
            const savedGrid = document.getElementById('savedGrid');
            if (savedGrid) {
                if (savedPlaces.length === 0) savedGrid.innerHTML = '<p class="empty-message">저장된 장소가 없습니다.</p>';
                else renderPlacesInGrid(savedPlaces, 'savedGrid');
            }
        }
    } catch (e) { console.error("위시리스트 동기화 실패:", e); }
}

function isSavedPlace(id) { return serverSavedIds.includes(id); }
function updateSavedCount() { document.getElementById('savedCount').textContent = serverSavedIds.length; }

// 메인 화면 하트와 모달 저장 버튼 통합 제어기
// 💡 [새로고침 차단 완비] 메인 화면 하트와 모달 저장 버튼 통합 제어기
async function toggleModalSave(e, id) {
    // 💡 브라우저가 화면을 리로드하거나 위로 튕겨버리는 기본 액션을 원천 차단합니다!
    if (e && e.preventDefault) e.preventDefault();

    const token = localStorage.getItem("userToken");
    if (!token) { alert("로그인이 필요한 기능입니다."); openAuthModal(new Event('click')); return; }

    try {
        const res = await fetch(`${SERVER_URL}/api/wishlist/toggle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userEmail: token, placeId: id })
        });
        if (res.ok) {
            await loadSavedPlaces();          // 서버 장부 리로드
            updateModalSaveButton(id);        // 모달창 내부 단추 텍스트 토글 갱신

        }
    } catch { alert("서버 위시리스트 처리 통신 실패"); }
}
function updateModalSaveButton(id) {
    const b = document.getElementById('modalSaveBtn');
    if (!b) return;
    b.textContent = isSavedPlace(id) ? '✓ 저장됨' : '저장하기';
    b.style.background = isSavedPlace(id) ? 'var(--primary)' : '';
    b.style.color = isSavedPlace(id) ? 'white' : 'var(--primary)';
    b.style.borderColor = isSavedPlace(id) ? 'var(--primary)' : '';
}

// ===== 🔐 [로그인/회원가입 모달 제어 기능] =====
function openAuthModal(e) { if (e && e.preventDefault) e.preventDefault(); document.getElementById('authModal').style.display = 'flex'; switchAuthMode('login'); }
function closeAuthModal() { document.getElementById('authModal').style.display = 'none'; }
function switchAuthMode(mode) {
    document.getElementById('loginSection').style.display = mode === 'login' ? 'block' : 'none';
    document.getElementById('registerSection').style.display = mode === 'register' ? 'block' : 'none';
}

async function handleRegister() {
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    if (!name || !email || !password) return alert("모든 칸을 입력해 주십시오.");
    try {
        const res = await fetch(`${SERVER_URL}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (res.ok) { alert("회원가입 성공! 로그인해 주세요."); switchAuthMode('login'); }
        else { alert(data.message || "가입 실패"); }
    } catch { alert("백엔드 서버 가동 상태를 확인하십시오."); }
}

async function handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    try {
        const res = await fetch(`${SERVER_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok) {
            alert(`환영합니다, ${data.name}님!`);
            localStorage.setItem("userToken", data.token);
            updateAuthUI();
            closeAuthModal();
        } else { alert(data.message); }
    } catch { alert("백엔드 서버 연결 실패."); }
}

function handleLogout(e) {
    if (e && e.preventDefault) e.preventDefault();
    localStorage.removeItem("userToken");
    alert("로그아웃 되었습니다.");
    location.reload();
}

// ===== 필터 및 이벤트 시스템 =====
function setupEventListeners() {
    document.getElementById('regionFilter').onchange = applyFilters;
    document.getElementById('atmosphereFilter').onchange = applyFilters;
    document.getElementById('priceFilter').onchange = applyFilters;
    document.getElementById('mealTypeFilter').onchange = applyFilters;
    document.querySelector('.reset-filters').onclick = resetFilters;
    document.getElementById('searchInput').oninput = debounce(searchPlaces, 300);
    document.querySelector('.search-btn').onclick = searchPlaces;
    document.getElementById('savedNav').onclick = toggleSavedSection;
}

function applyFilters() {
    currentPage = 1;
    const r = document.getElementById('regionFilter').value;
    const a = document.getElementById('atmosphereFilter').value;
    const p = document.getElementById('priceFilter').value;
    const m = document.getElementById('mealTypeFilter').value;
    let filtered = currentPlacesData.filter(pl => {
        return (!r || pl.region === r) && (!a || pl.atmosphere === a) && (!p || pl.price === p) && (!m || pl.mealType === m);
    });
    renderPlaces(filtered);
}

function resetFilters() {
    document.getElementById('regionFilter').value = ''; document.getElementById('atmosphereFilter').value = '';
    document.getElementById('priceFilter').value = ''; document.getElementById('mealTypeFilter').value = '';
    currentPage = 1; renderPlaces(currentPlacesData);
}

function searchPlaces() {
    currentPage = 1;
    const q = document.getElementById('searchInput').value.toLowerCase().trim();
    if (!q) { renderPlaces(currentPlacesData); return; }
    renderPlaces(currentPlacesData.filter(p => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)));
}

function debounce(func, wait) {
    let t; return function (...args) { clearTimeout(t); t = setTimeout(() => func(...args), wait); };
}

function toggleSavedSection(e) {
    if (e && e.preventDefault) e.preventDefault();
    const s = document.getElementById('saved'); const ex = document.getElementById('explore');
    if (s.style.display === 'none') {
        s.style.display = 'block'; ex.style.display = 'none';
        document.querySelector('.nav a.active').classList.remove('active'); document.getElementById('savedNav').classList.add('active'); loadSavedPlaces();
    } else {
        s.style.display = 'none'; ex.style.display = 'block';
        document.querySelector('.nav a.active').classList.remove('active'); document.querySelector('a[href="/"]').classList.add('active');
    }
}

let selectedPlaceForMap = null;
function openPlaceModal(e, id) {
    if (e && e.preventDefault) e.preventDefault();
    const pl = currentPlacesData.find(p => p.id === id);
    if (!pl) return;

    selectedPlaceForMap = pl;
    
    // 1. 상단 이미지 및 제목 기본 정보 바인딩
    document.getElementById('modalImage').src = pl.image;
    document.getElementById('modalTitle').textContent = pl.title;
    document.getElementById('modalMeta').innerHTML = `<span class="badge region">${pl.region}</span><span class="badge atmosphere">${pl.atmosphere}</span>`;
    document.getElementById('modalRating').innerHTML = `<span class="stars">★★★★★</span> ${pl.rating} / 5.0 (${pl.reviews}개 리뷰)`;
    document.getElementById('modalDescription').textContent = pl.description;


    const realAddress = pl.description.replace("주소: [", "").replace("]", "") || "부산 주소지 확인 중";
    document.getElementById('modalAddress').innerHTML = `
        <strong>📍 도로명주소:</strong> ${pl.address}<br>
        <strong style="display:inline-block; margin-top:8px;">📞 전화번호:</strong> ${pl.phone}
    `;

    // 2. 구글맵 실시간 생생 리뷰 UI 렌더링 파이프라인
    document.getElementById('reviewsTab').innerHTML = `
        <h3>구글맵 실시간 생생 리뷰</h3>
        <div class="modal-reviews">
            ${pl.googleReviews.map(r => `
                <div class="review-item">
                    <div class="review-header">
                        <span class="review-author">${r.author}</span>
                        <span class="review-date">${r.date}</span>
                    </div>
                    <div style="color: #FF6B6B; font-size: 13px; margin: 2px 0 6px 0;">
                        ${'★'.repeat(r.starRating)}${'☆'.repeat(5 - r.starRating)}
                    </div>
                    <p class="review-text">${r.text}</p>
                </div>
            `).join('')}
        </div>
    `;

    // 3. 인터페이스 인터랙션 활성화 및 모달 소환
    updateModalSaveButton(id);
    document.getElementById('placeModal').style.display = 'flex';
    switchModalTab('info');
    document.body.style.overflow = 'hidden';

    document.getElementById('modalSaveBtn').onclick = function (event) {
        toggleModalSave(event, id);
    };
}
function closePlaceModal() { document.getElementById('placeModal').style.display = 'none'; document.body.style.overflow = 'auto'; }
function switchModalTab(tName) {
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
    const tId = tName === 'info' ? 'infoTab' : tName === 'map' ? 'mapTab' : 'reviewsTab';
    document.getElementById(tId).classList.add('active');
    const btns = document.querySelectorAll('.modal-tab-btn');
    if (tName === 'info') btns[0].classList.add('active');
    else if (tName === 'map') btns[1].classList.add('active');
    else if (tName === 'reviews') btns[2].classList.add('active');
    if (tName === 'map' && selectedPlaceForMap) renderGoogleMapForPlace(selectedPlaceForMap);
}

function renderGoogleMapForPlace(pl) {
    if (pl.latitude && pl.longitude) {
        const target = new google.maps.LatLng(pl.latitude, pl.longitude);
        googleMapObj = new google.maps.Map(document.getElementById('googleMapDisplay'), { center: target, zoom: 16 });
        const marker = new google.maps.Marker({ position: target, map: googleMapObj, title: pl.title });
        const info = new google.maps.InfoWindow({ content: `<div style="padding:5px; color:#1d1d1d;"><strong>${pl.title}</strong><br><span style="font-size:12px;">${pl.address}</span></div>` });
        info.open(googleMapObj, marker);
    }
}

async function fetchWeatherData() {
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=35.1595&longitude=129.1606&current=temperature_2m,weather_code&temperature_unit=celsius`);
        const d = await res.json();
        if (d.current) {
            document.getElementById('weatherInfo').textContent = `부산 현재 날씨: ${getWeatherDescription(d.current.weather_code)} ${d.current.temperature_2m}°C`;
            document.getElementById('weatherTime').textContent = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        }
    } catch { document.getElementById('weatherInfo').textContent = '부산 날씨: 맑음'; }
}

function getWeatherDescription(c) {
    const codes = { 0: '맑음', 1: '대체로 맑음', 2: '구름조금', 3: '흐림', 45: '안개', 51: '이슬비', 61: '비', 71: '눈', 85: '소나기' };
    return codes[c] || '맑음';
}
function initMap() { console.log("구글 고급 지도 코어 시스템 부팅 성공."); }
