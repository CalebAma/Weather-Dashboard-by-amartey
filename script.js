// ============================================================
//  CONSTANTS
// ============================================================
const API_BASE   = 'https://api.open-meteo.com/v1/forecast';
const GEO_API    = 'https://geocoding-api.open-meteo.com/v1/search';
const NOMINATIM  = 'https://nominatim.openstreetmap.org/reverse';

const KEY_CITY   = 'wd_last_city';
const KEY_FAVS   = 'wd_favorites';
const KEY_UNIT   = 'wd_unit';

// ============================================================
//  STATE
// ============================================================
let unit        = localStorage.getItem(KEY_UNIT) || 'C';
let currentData = null;
let currentCity = null;
let hourlyChart = null;
let acTimeout   = null;
let favorites   = JSON.parse(localStorage.getItem(KEY_FAVS) || '[]');

// ============================================================
//  DOM HELPERS
// ============================================================
const $ = id => document.getElementById(id);

// Header
const cityNameEl    = $('city-name');
const dateEl        = $('current-date');

// Search
const searchOverlay = $('search-overlay');
const searchInput   = $('search-input');
const searchBtn     = $('search-btn');
const searchToggle  = $('search-toggle');
const searchClose   = $('search-close');
const geoBtn        = $('geo-btn');
const acList        = $('autocomplete-list');

// States
const loadingEl     = $('loading');
const weatherEl     = $('weather-content');
const errorMsg      = $('error-message');
const errorText     = $('error-text');

// Hero
const tempEl        = $('current-temp');
const descEl        = $('weather-desc');
const iconEl        = $('weather-icon');
const badgeEl       = $('day-night-badge');
const favBtn        = $('fav-btn');

// Pills
const feelsEl       = $('feels-like');
const humidityEl    = $('humidity');
const humidityBar   = $('humidity-bar');
const windSpeedEl   = $('wind-speed');
const windDirEl     = $('wind-direction');
const uvEl          = $('uv-index');
const uvLabelEl     = $('uv-label');
const pressureEl    = $('pressure');
const visEl         = $('visibility');
const precipEl      = $('precip-prob');
const precipBar     = $('precip-bar');

// Cards
const sunriseEl     = $('sunrise');
const sunsetEl      = $('sunset');
const forecastEl    = $('forecast-container');

// Favorites
const favBar        = $('favorites-bar');
const favList       = $('favorites-list');

// ============================================================
//  TEMPERATURE HELPERS
// ============================================================
const toDisplay  = c => unit === 'F' ? Math.round(c * 9 / 5 + 32) : Math.round(c);
const unitSuffix = () => unit === 'F' ? '°F' : '°C';

// ============================================================
//  UNIT TOGGLE
// ============================================================
function initUnitToggle () {
    const btnC = $('btn-celsius');
    const btnF = $('btn-fahrenheit');

    const apply = u => {
        unit = u;
        localStorage.setItem(KEY_UNIT, u);
        btnC.classList.toggle('active', u === 'C');
        btnF.classList.toggle('active', u === 'F');
        if (currentData && currentCity) {
            updateUI(currentCity.name, currentCity.country, currentData);
        }
    };

    btnC.addEventListener('click', () => apply('C'));
    btnF.addEventListener('click', () => apply('F'));
    apply(unit);
}

// ============================================================
//  SEARCH OVERLAY TOGGLE
// ============================================================
function openSearch () {
    searchOverlay.classList.remove('hidden');
    searchInput.focus();
    searchToggle.querySelector('i').className = 'fas fa-times';
}
function closeSearch () {
    searchOverlay.classList.add('hidden');
    hideAC();
    searchToggle.querySelector('i').className = 'fas fa-search';
}

searchToggle.addEventListener('click', () => {
    searchOverlay.classList.contains('hidden') ? openSearch() : closeSearch();
});
searchClose.addEventListener('click', closeSearch);

// ============================================================
//  WEATHER CODE HELPERS
// ============================================================
function getIcon (code) {
    if (code === 0)                 return 'fa-sun';
    if (code <= 3)                  return 'fa-cloud-sun';
    if (code === 45 || code === 48) return 'fa-smog';
    if (code >= 51 && code <= 55)   return 'fa-cloud-rain';
    if (code >= 61 && code <= 65)   return 'fa-cloud-showers-heavy';
    if (code >= 71 && code <= 77)   return 'fa-snowflake';
    if (code >= 80 && code <= 82)   return 'fa-cloud-showers-water';
    if (code >= 95)                 return 'fa-bolt';
    return 'fa-cloud';
}

function getDesc (code) {
    const m = {
        0:'Clear Sky', 1:'Mainly Clear', 2:'Partly Cloudy', 3:'Overcast',
        45:'Foggy', 48:'Rime Fog',
        51:'Light Drizzle', 53:'Moderate Drizzle', 55:'Dense Drizzle',
        61:'Slight Rain', 63:'Moderate Rain', 65:'Heavy Rain',
        71:'Slight Snow', 73:'Moderate Snow', 75:'Heavy Snow', 77:'Snow Grains',
        80:'Rain Showers', 81:'Moderate Showers', 82:'Violent Showers',
        95:'Thunderstorm', 96:'Thunderstorm + Hail', 99:'Heavy Thunderstorm'
    };
    return m[code] || 'Unknown';
}

function getIconColor (code, isDay) {
    if (!isDay)       return '#818cf8';
    if (code === 0)   return '#fbbf24';
    if (code <= 3)    return '#93c5fd';
    if (code >= 51 && code <= 82) return '#60a5fa';
    if (code >= 71 && code <= 77) return '#bfdbfe';
    if (code >= 95)   return '#c084fc';
    return '#93c5fd';
}

// ============================================================
//  DYNAMIC THEME
// ============================================================
const THEMES = ['theme-sunny','theme-clear','theme-cloudy','theme-rainy','theme-snow','theme-thunder','theme-night'];

function applyTheme (code, isDay) {
    document.body.classList.remove(...THEMES);
    if (!isDay)                                          document.body.classList.add('theme-night');
    else if (code === 0)                                 document.body.classList.add('theme-sunny');
    else if (code <= 3)                                  document.body.classList.add('theme-clear');
    else if (code === 45 || code === 48)                 document.body.classList.add('theme-cloudy');
    else if ((code >= 51 && code <= 65) || code >= 80 && code <= 82) document.body.classList.add('theme-rainy');
    else if (code >= 71 && code <= 77)                   document.body.classList.add('theme-snow');
    else if (code >= 95)                                 document.body.classList.add('theme-thunder');
    else                                                 document.body.classList.add('theme-clear');
}

function applyBlobs (code, isDay) {
    const map = {
        night:   ['#1e1b4b','#312e81','#0f172a'],
        sunny:   ['#f59e0b','#ef4444','#f97316'],
        clear:   ['#3b82f6','#6366f1','#2563eb'],
        cloudy:  ['#374151','#4b5563','#6b7280'],
        rainy:   ['#1e40af','#1d4ed8','#2563eb'],
        snow:    ['#94a3b8','#bfdbfe','#e2e8f0'],
        thunder: ['#5b21b6','#7c3aed','#4c1d95'],
    };
    let key = 'clear';
    if (!isDay)                                          key = 'night';
    else if (code === 0)                                 key = 'sunny';
    else if (code <= 3)                                  key = 'clear';
    else if (code === 45 || code === 48)                 key = 'cloudy';
    else if ((code >= 51 && code <= 82))                 key = 'rainy';
    else if (code >= 71 && code <= 77)                   key = 'snow';
    else if (code >= 95)                                 key = 'thunder';

    const colors = map[key];
    [$('blob-1'), $('blob-2'), $('blob-3')].forEach((b, i) => {
        if (b) b.style.background = colors[i];
    });
}

// ============================================================
//  WIND DIRECTION
// ============================================================
const windDir = deg => ['N','NE','E','SE','S','SW','W','NW'][Math.round(deg / 45) % 8];

// ============================================================
//  UV INDEX
// ============================================================
function uvInfo (uv) {
    if (uv <= 2)  return { text: 'Low',       cls: 'uv-low'    };
    if (uv <= 5)  return { text: 'Moderate',  cls: 'uv-mod'    };
    if (uv <= 7)  return { text: 'High',      cls: 'uv-high'   };
    if (uv <= 10) return { text: 'Very High', cls: 'uv-vhigh'  };
    return             { text: 'Extreme',   cls: 'uv-extreme' };
}

// ============================================================
//  FAVORITES
// ============================================================
const saveFavs  = () => localStorage.setItem(KEY_FAVS, JSON.stringify(favorites));
const isFav     = n  => favorites.some(f => f.name.toLowerCase() === n.toLowerCase());

function toggleFav () {
    if (!currentCity) return;
    const { name, country } = currentCity;
    if (isFav(name)) favorites = favorites.filter(f => f.name.toLowerCase() !== name.toLowerCase());
    else favorites.push({ name, country });
    saveFavs();
    updateFavBtn();
    renderFavBar();
}

function updateFavBtn () {
    if (!currentCity) return;
    favBtn.querySelector('i').style.color = isFav(currentCity.name) ? '#fbbf24' : '';
}

function renderFavBar () {
    if (!favorites.length) { favBar.classList.add('hidden'); return; }
    favBar.classList.remove('hidden');
    favList.innerHTML = '';
    favorites.forEach(fav => {
        const pill = document.createElement('button');
        pill.className = 'fav-pill';
        pill.innerHTML = `<span>${fav.name}</span><span class="text-gray-500 text-xs">${fav.country}</span><i class="fas fa-times remove-fav"></i>`;
        pill.addEventListener('click', e => {
            if (e.target.classList.contains('remove-fav')) {
                favorites = favorites.filter(f => f.name !== fav.name);
                saveFavs(); updateFavBtn(); renderFavBar();
            } else {
                fetchWeather(fav.name);
            }
        });
        favList.appendChild(pill);
    });
}

favBtn.addEventListener('click', toggleFav);

// ============================================================
//  AUTOCOMPLETE
// ============================================================
searchInput.addEventListener('input', () => {
    clearTimeout(acTimeout);
    const q = searchInput.value.trim();
    if (q.length < 2) { hideAC(); return; }
    acTimeout = setTimeout(() => fetchAC(q), 300);
});

async function fetchAC (q) {
    try {
        const res  = await fetch(`${GEO_API}?name=${encodeURIComponent(q)}&count=5&language=en&format=json`);
        const data = await res.json();
        if (!data.results?.length) { hideAC(); return; }
        renderAC(data.results);
    } catch { hideAC(); }
}

function renderAC (results) {
    acList.innerHTML = '';
    acList.classList.remove('hidden');
    results.forEach(r => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.setAttribute('tabindex', '0');
        item.innerHTML = `
            <i class="fas fa-map-marker-alt text-blue-400 text-xs shrink-0"></i>
            <div class="city-info">
                <span class="city-name-ac">${r.name}</span>
                <span class="city-sub">${r.admin1 ? r.admin1 + ', ' : ''}${r.country}</span>
            </div>`;
        const choose = () => { searchInput.value = r.name; hideAC(); closeSearch(); fetchWeather(r.name); };
        item.addEventListener('click', choose);
        item.addEventListener('keypress', e => e.key === 'Enter' && choose());
        acList.appendChild(item);
    });
}

function hideAC () { acList.classList.add('hidden'); acList.innerHTML = ''; }
document.addEventListener('click', e => {
    if (!e.target.closest('#search-overlay')) hideAC();
});

// ============================================================
//  GEOLOCATION
// ============================================================
geoBtn.addEventListener('click', () => {
    if (!navigator.geolocation) { showError('Geolocation not supported.'); return; }
    geoBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    geoBtn.disabled  = true;
    navigator.geolocation.getCurrentPosition(
        async ({ coords: { latitude: lat, longitude: lon } }) => {
            await fetchByCoords(lat, lon);
            geoBtn.innerHTML = '<i class="fas fa-location-crosshairs"></i>';
            geoBtn.disabled  = false;
        },
        () => {
            showError('Location access denied. Please search manually.');
            geoBtn.innerHTML = '<i class="fas fa-location-crosshairs"></i>';
            geoBtn.disabled  = false;
        }
    );
});

async function fetchByCoords (lat, lon) {
    showLoading(true); hideError();
    try {
        let name = `${lat.toFixed(1)}°N ${lon.toFixed(1)}°E`, country = '';
        try {
            const rev  = await fetch(`${NOMINATIM}?lat=${lat}&lon=${lon}&format=json`);
            const revD = await rev.json();
            name    = revD.address?.city || revD.address?.town || revD.address?.village || name;
            country = revD.address?.country_code?.toUpperCase() || '';
        } catch { /* keep coord string */ }

        const wRes  = await fetch(buildURL(lat, lon));
        if (!wRes.ok) throw new Error('Weather data unavailable');
        const wData = await wRes.json();

        currentCity = { name, country };
        currentData = wData;
        localStorage.setItem(KEY_CITY, name);
        updateUI(name, country, wData);
    } catch (err) { showError(err.message); }
    finally { showLoading(false); }
}

// ============================================================
//  WEATHER API
// ============================================================
function buildURL (lat, lon) {
    return `${API_BASE}?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,` +
        `surface_pressure,wind_speed_10m,wind_direction_10m,is_day,visibility` +
        `&hourly=temperature_2m,precipitation_probability,weather_code` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,` +
        `precipitation_probability_max,uv_index_max` +
        `&timezone=auto&forecast_days=7`;
}

searchBtn.addEventListener('click', () => {
    const city = searchInput.value.trim();
    if (city) { hideAC(); closeSearch(); fetchWeather(city); }
});
searchInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') {
        const city = searchInput.value.trim();
        if (city) { hideAC(); closeSearch(); fetchWeather(city); }
    }
});

async function fetchWeather (city) {
    showLoading(true); hideError();
    try {
        const gRes  = await fetch(`${GEO_API}?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
        const gData = await gRes.json();
        if (!gData.results?.length) throw new Error('City not found. Please try again.');

        const { latitude, longitude, name, country } = gData.results[0];
        const wRes  = await fetch(buildURL(latitude, longitude));
        if (!wRes.ok) throw new Error('Weather data unavailable.');
        const wData = await wRes.json();

        currentCity = { name, country };
        currentData = wData;
        localStorage.setItem(KEY_CITY, name);
        updateUI(name, country, wData);
    } catch (err) { showError(err.message); }
    finally { showLoading(false); }
}

// ============================================================
//  UPDATE UI
// ============================================================
function updateUI (city, country, data) {
    const cur   = data.current;
    const daily = data.daily;
    const hrly  = data.hourly;

    // Header
    cityNameEl.textContent = country ? `${city}, ${country}` : city;
    dateEl.textContent = new Date().toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    // Hero
    tempEl.textContent = `${toDisplay(cur.temperature_2m)}${unitSuffix()}`;
    descEl.textContent = getDesc(cur.weather_code);
    iconEl.className   = `fas ${getIcon(cur.weather_code)} hero-icon floating-icon`;
    iconEl.style.color = getIconColor(cur.weather_code, cur.is_day);

    // Day/night badge
    badgeEl.classList.remove('hidden', 'badge-day', 'badge-night');
    if (cur.is_day) {
        badgeEl.classList.add('badge-day');
        badgeEl.innerHTML = '<i class="fas fa-sun mr-1"></i>Daytime';
    } else {
        badgeEl.classList.add('badge-night');
        badgeEl.innerHTML = '<i class="fas fa-moon mr-1"></i>Nighttime';
    }

    // Pills
    feelsEl.textContent    = `${toDisplay(cur.apparent_temperature)}${unitSuffix()}`;
    humidityEl.textContent = `${cur.relative_humidity_2m}%`;
    humidityBar.style.width = `${cur.relative_humidity_2m}%`;
    windSpeedEl.textContent = `${cur.wind_speed_10m} km/h`;
    windDirEl.textContent   = windDir(cur.wind_direction_10m);
    pressureEl.textContent  = `${Math.round(cur.surface_pressure)} hPa`;

    // UV
    const uv = daily.uv_index_max ? Math.round(daily.uv_index_max[0]) : null;
    uvEl.textContent = uv ?? '--';
    if (uv !== null) {
        const info = uvInfo(uv);
        uvLabelEl.textContent = info.text;
        uvLabelEl.className   = `pill-sub font-medium ${info.cls}`;
    }

    // Visibility
    visEl.textContent = cur.visibility != null
        ? `${(cur.visibility / 1000).toFixed(1)} km`
        : 'N/A';

    // Rain chance (today)
    const todayPrecip = daily.precipitation_probability_max?.[0] ?? 0;
    precipEl.textContent   = `${todayPrecip}%`;
    precipBar.style.width  = `${todayPrecip}%`;

    // Sunrise / Sunset
    sunriseEl.textContent = new Date(daily.sunrise[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    sunsetEl.textContent  = new Date(daily.sunset[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Theme
    applyTheme(cur.weather_code, cur.is_day);
    applyBlobs(cur.weather_code, cur.is_day);

    // Fav button
    updateFavBtn();

    // Chart + Forecast
    renderHourlyChart(hrly);
    renderForecast(daily);

    weatherEl.classList.remove('hidden');
}

// ============================================================
//  HOURLY CHART
// ============================================================
function renderHourlyChart (hrly) {
    const now      = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const curHr    = now.getHours();

    let start = hrly.time.findIndex(t => t.startsWith(todayStr) && parseInt(t.split('T')[1]) >= curHr);
    if (start === -1) start = 0;
    const end = Math.min(start + 24, hrly.time.length);

    const labels = [], temps = [], precips = [];
    for (let i = start; i < end; i++) {
        labels.push(new Date(hrly.time[i]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }));
        temps.push(toDisplay(hrly.temperature_2m[i]));
        precips.push(hrly.precipitation_probability[i] ?? 0);
    }

    if (hourlyChart) hourlyChart.destroy();

    const ctx  = $('hourly-chart').getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 195);
    grad.addColorStop(0, 'rgba(99,102,241,0.4)');
    grad.addColorStop(1, 'rgba(99,102,241,0.01)');

    hourlyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: `Temp (${unitSuffix()})`,
                    data: temps,
                    borderColor: '#818cf8',
                    backgroundColor: grad,
                    borderWidth: 2.5,
                    pointRadius: 3,
                    pointBackgroundColor: '#818cf8',
                    tension: 0.45,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: 'Rain (%)',
                    data: precips,
                    borderColor: '#38bdf8',
                    backgroundColor: 'rgba(56,189,248,0.06)',
                    borderWidth: 2,
                    pointRadius: 2,
                    pointBackgroundColor: '#38bdf8',
                    tension: 0.45,
                    fill: false,
                    yAxisID: 'y1',
                    borderDash: [5, 4]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: 'rgba(255,255,255,0.6)', font: { family: 'Outfit', size: 11 }, boxWidth: 12 } },
                tooltip: {
                    backgroundColor: 'rgba(8,8,22,0.95)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    titleColor: '#fff',
                    bodyColor: 'rgba(255,255,255,0.7)',
                    titleFont: { family: 'Outfit', weight: '600' },
                    bodyFont:  { family: 'Outfit' },
                    padding: 10,
                    cornerRadius: 10
                }
            },
            scales: {
                x:  { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(255,255,255,0.4)', font: { family: 'Outfit', size: 10 }, maxTicksLimit: 7 } },
                y:  { position: 'left',  grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(255,255,255,0.4)', font: { family: 'Outfit', size: 10 }, callback: v => `${v}${unitSuffix()}` } },
                y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { color: 'rgba(56,189,248,0.65)', font: { family: 'Outfit', size: 10 }, callback: v => `${v}%` } }
            }
        }
    });
}

// ============================================================
//  7-DAY FORECAST
// ============================================================
function renderForecast (daily) {
    forecastEl.innerHTML = '';
    for (let i = 0; i <= 6; i++) {
        if (!daily.time[i]) break;
        const date    = new Date(daily.time[i] + 'T12:00:00');
        const dayName = i === 0 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' });
        const maxT    = toDisplay(daily.temperature_2m_max[i]);
        const minT    = toDisplay(daily.temperature_2m_min[i]);
        const code    = daily.weather_code[i];
        const precip  = daily.precipitation_probability_max?.[i] ?? 0;

        const card = document.createElement('div');
        card.className = 'forecast-card';
        card.innerHTML = `
            <p style="font-size:.8rem;font-weight:600;color:rgba(255,255,255,.75)">${dayName}</p>
            <i class="fas ${getIcon(code)}" style="font-size:1.4rem;color:${getIconColor(code,true)}"></i>
            <p style="font-size:1rem;font-weight:700;line-height:1.1">${maxT}°</p>
            <p style="font-size:.75rem;color:rgba(255,255,255,.4)">${minT}°</p>
            <div>
                <p style="font-size:.65rem;color:#7dd3fc;margin-bottom:2px">${precip}%</p>
                <div class="precip-bar"><div class="precip-fill" style="width:${precip}%"></div></div>
            </div>`;
        forecastEl.appendChild(card);
    }
}

// ============================================================
//  LOADING / ERROR
// ============================================================
function showLoading (show) {
    if (show) { loadingEl.classList.remove('hidden'); weatherEl.classList.add('hidden'); }
    else       { loadingEl.classList.add('hidden'); }
}

function showError (msg) {
    errorText.textContent = msg;
    errorMsg.classList.remove('hidden');
    weatherEl.classList.add('hidden');
    setTimeout(() => errorMsg.classList.add('hidden'), 5000);
}

function hideError () { errorMsg.classList.add('hidden'); }

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initUnitToggle();
    renderFavBar();
    fetchWeather(localStorage.getItem(KEY_CITY) || 'London');
});
