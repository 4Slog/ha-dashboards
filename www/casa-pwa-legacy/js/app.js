/**
 * Casa de Sowu PWA - v3 with OAuth Authentication
 */

const CONFIG = {
  STORAGE_KEY: 'casa_de_sowu_config',
  RECONNECT_INTERVAL: 5000,
  CAMERA_REFRESH_INTERVAL: 2000,
  MAP_UPDATE_INTERVAL: 10000,
  HOME_COORDS: [33.3552, -82.1134],
  // OAuth Configuration
  HA_URL: 'https://ha.casadesowu.com',
  REDIRECT_URI: window.location.origin + window.location.pathname,
  CLIENT_ID: window.location.origin + '/',
};

const ENTITIES = {
  spotify: 'media_player.spotify_paul_sowu',
  spotifyPlus: 'media_player.spotifyplus_paul_sowu',
  speakers: [
    { entity: 'media_player.great_room_dot', name: 'Great Room dot', icon: 'speaker' },
    { entity: 'media_player.office', name: 'Great Room show', icon: 'tablet' },
    { entity: 'media_player.living_room_tv', name: 'Living Room TV', icon: 'television' },
    { entity: 'media_player.living_room', name: 'Living Room', icon: 'speaker' },
    { entity: 'media_player.show_8', name: 'Show 8', icon: 'tablet' },
    { entity: 'media_player.mauriece_dot', name: 'Mauriece dot', icon: 'speaker' },
    { entity: 'media_player.vlc_telnet', name: 'Server Speaker', icon: 'bluetooth-audio' },
  ],
  commonLights: [
    'light.great_room_fan_and_light',
    'light.dining_room_main_light', 
    'light.kitchen_light_switch',
    'switch.master_hallway',
  ],
  blinds: 'cover.blind_tilt_5b8c',
  masterScript: 'script.toggle_main_lights',
  weather: 'weather.forecast_home',
  thermostat: 'climate.thermostat',
  autoComfort: 'input_boolean.hvac_auto_comfort',
  temps: {
    master: 'sensor.lumi_lumi_weather_temperature',
    galley: 'sensor.temp_bedroom_wing_temperature',
    blue: 'sensor.temp_bedroom_wing_temperature_2',
    average: 'sensor.average_home_temperature',
  },
  persons: [
    { entity: 'person.paul', name: 'Paul', tracker: 'device_tracker.paul_360', color: '#667eea' },
    { entity: 'person.tuella_sowu', name: 'Tuella', tracker: 'device_tracker.tuella_360', color: '#f093fb' },
    { entity: 'person.mauriece', name: 'Mauriece', tracker: 'device_tracker.mauriece_360', color: '#4facfe' },
  ],
  calendars: [
    'calendar.thesowus_gmail_com',
    'calendar.sowu_paul_gmail_com',
    'calendar.family',
    'calendar.augusta_eagles_varsity_boys_basketball',
  ],
  tasks: {
    house: 'todo.house_tasks',
    paul: 'todo.paul',
    tuella: 'todo.tuella',
  },
  cameras: {
    main: 'camera.10_0_0_60',
    wyze: 'camera.wyze_cam',
    pan: 'camera.pan_cam',
    redbase: 'camera.redbase',
  },
};

// ============================================
// APP STATE
// ============================================
class AppState {
  constructor() {
    this.haUrl = CONFIG.HA_URL;
    this.haToken = '';
    this.refreshToken = '';
    this.tokenExpiry = 0;
    this.ws = null;
    this.wsId = 1;
    this.connected = false;
    this.states = {};
    this.currentPage = 'lights';
    this.pendingRequests = new Map();
    this.cameraIntervals = {};
    this.map = null;
    this.mapMarkers = {};
    this.mapLayer = 'satellite';
    this.selectedDevice = null;
    this.currentModalEntity = null;
    this.playlists = [];
    this.progressDragging = false;
    this.progressInterval = null;
    this.selectedSpeaker = { entity: 'media_player.spotify_paul_sowu', name: 'Casa de Sowu', type: 'spotify' };
  }
  
  loadConfig() {
    try {
      const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (saved) {
        const config = JSON.parse(saved);
        this.haUrl = config.haUrl || CONFIG.HA_URL;
        this.haToken = config.haToken || '';
        this.refreshToken = config.refreshToken || '';
        this.tokenExpiry = config.tokenExpiry || 0;
        this.selectedDevice = config.selectedDevice || null;
        this.selectedSpeaker = config.selectedSpeaker || { entity: 'media_player.spotify_paul_sowu', name: 'Casa de Sowu', type: 'spotify' };
        return this.haToken ? true : false;
      }
    } catch (e) { console.error('Load config failed:', e); }
    return false;
  }
  
  saveConfig() {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({
        haUrl: this.haUrl,
        haToken: this.haToken,
        refreshToken: this.refreshToken,
        tokenExpiry: this.tokenExpiry,
        selectedDevice: this.selectedDevice,
        selectedSpeaker: this.selectedSpeaker,
      }));
    } catch (e) { console.error('Save config failed:', e); }
  }
  
  clearConfig() {
    localStorage.removeItem(CONFIG.STORAGE_KEY);
    this.haToken = '';
    this.refreshToken = '';
    this.tokenExpiry = 0;
  }
}

const state = new AppState();
let DOM = {};

// ============================================
// OAUTH AUTHENTICATION
// ============================================
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function startOAuthFlow() {
  const oauthState = generateRandomString(32);
  sessionStorage.setItem('oauth_state', oauthState);
  
  const authUrl = new URL(`${CONFIG.HA_URL}/auth/authorize`);
  authUrl.searchParams.set('client_id', CONFIG.CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', CONFIG.REDIRECT_URI);
  authUrl.searchParams.set('state', oauthState);
  authUrl.searchParams.set('response_type', 'code');
  
  setLoginStatus('Redirecting to Home Assistant...', 'info');
  window.location.href = authUrl.toString();
}

async function handleOAuthCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const returnedState = urlParams.get('state');
  const error = urlParams.get('error');
  
  // Clear URL parameters
  window.history.replaceState({}, document.title, window.location.pathname);
  
  if (error) {
    setLoginStatus(`Login failed: ${error}`, 'error');
    return false;
  }
  
  if (!code) return false;
  
  // Verify state
  const savedState = sessionStorage.getItem('oauth_state');
  sessionStorage.removeItem('oauth_state');
  
  if (returnedState !== savedState) {
    setLoginStatus('Security error: State mismatch', 'error');
    return false;
  }
  
  setLoginStatus('Completing sign in...', 'info');
  
  try {
    // Exchange code for token
    const tokenResponse = await fetch(`${CONFIG.HA_URL}/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: CONFIG.CLIENT_ID,
        redirect_uri: CONFIG.REDIRECT_URI,
      }),
    });
    
    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }
    
    const tokenData = await tokenResponse.json();
    
    state.haToken = tokenData.access_token;
    state.refreshToken = tokenData.refresh_token || '';
    state.tokenExpiry = Date.now() + (tokenData.expires_in * 1000);
    state.saveConfig();
    
    setLoginStatus('Signed in successfully!', 'success');
    return true;
    
  } catch (e) {
    console.error('OAuth token exchange failed:', e);
    setLoginStatus('Sign in failed. Please try again.', 'error');
    return false;
  }
}

async function refreshAccessToken() {
  if (!state.refreshToken) return false;
  
  try {
    const response = await fetch(`${CONFIG.HA_URL}/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: state.refreshToken,
        client_id: CONFIG.CLIENT_ID,
      }),
    });
    
    if (!response.ok) {
      throw new Error('Token refresh failed');
    }
    
    const data = await response.json();
    state.haToken = data.access_token;
    state.refreshToken = data.refresh_token || state.refreshToken;
    state.tokenExpiry = Date.now() + (data.expires_in * 1000);
    state.saveConfig();
    
    return true;
  } catch (e) {
    console.error('Token refresh failed:', e);
    state.clearConfig();
    return false;
  }
}

function isTokenExpired() {
  // Consider token expired 5 minutes before actual expiry
  return state.tokenExpiry > 0 && Date.now() > (state.tokenExpiry - 300000);
}

function setLoginStatus(message, type = 'info') {
  if (DOM.loginStatus) {
    DOM.loginStatus.textContent = message;
    DOM.loginStatus.className = `login-status ${type}`;
  }
}

function logout() {
  state.clearConfig();
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  state.connected = false;
  showSetupScreen();
  setLoginStatus('Signed out', 'info');
}

// ============================================
// DOM ELEMENTS
// ============================================
function cacheDOMElements() {
  DOM = {
    setupScreen: document.getElementById('setup-screen'),
    mainApp: document.getElementById('main-app'),
    connectionBanner: document.getElementById('connection-banner'),
    setupForm: document.getElementById('setup-form'),
    haUrlInput: document.getElementById('ha-url'),
    haTokenInput: document.getElementById('ha-token'),
    btnLogin: document.getElementById('btn-login'),
    loginStatus: document.getElementById('login-status'),
    headerDate: document.getElementById('header-date'),
    headerTime: document.getElementById('header-time'),
    headerGreeting: document.getElementById('header-greeting'),
    pagesContainer: document.getElementById('pages-container'),
    topNavButtons: document.querySelectorAll('.top-nav-btn'),
    navButtons: document.querySelectorAll('.nav-btn'),
    albumArt: document.getElementById('album-art'),
    trackTitle: document.getElementById('track-title'),
    trackArtist: document.getElementById('track-artist'),
    btnPlay: document.getElementById('btn-play'),
    btnPrev: document.getElementById('btn-prev'),
    btnNext: document.getElementById('btn-next'),
    btnShuffle: document.getElementById('btn-shuffle'),
    btnRepeat: document.getElementById('btn-repeat'),
    deviceSelectBtn: document.getElementById('device-select-btn'),
    currentDevice: document.getElementById('current-device'),
    masterState: document.getElementById('master-state'),
    weatherTemp: document.getElementById('weather-temp'),
    weatherCondition: document.getElementById('weather-condition'),
    weatherHumidity: document.getElementById('weather-humidity'),
    weatherWind: document.getElementById('weather-wind'),
    thermostatCurrent: document.getElementById('thermostat-current'),
    thermostatTarget: document.getElementById('thermostat-target'),
    hvacMode: document.getElementById('hvac-mode'),
    tempUp: document.getElementById('temp-up'),
    tempDown: document.getElementById('temp-down'),
    comfortCard: document.getElementById('comfort-card'),
    tempMaster: document.getElementById('temp-master'),
    tempGalley: document.getElementById('temp-galley'),
    tempBlue: document.getElementById('temp-blue'),
    tempAvg: document.getElementById('temp-avg'),
    calendarEvents: document.getElementById('calendar-events'),
    familyMap: document.getElementById('family-map'),
    mapSatellite: document.getElementById('map-satellite'),
    mapStreet: document.getElementById('map-street'),
    mapCenter: document.getElementById('map-center'),
    cameraMainImg: document.getElementById('camera-main-img'),
    cameraWyzeImg: document.getElementById('camera-wyze-img'),
    cameraPanImg: document.getElementById('camera-pan-img'),
    cameraRedbaseImg: document.getElementById('camera-redbase-img'),
    cameraMainLoading: document.getElementById('camera-main-loading'),
    deviceModal: document.getElementById('device-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalClose: document.getElementById('modal-close'),
    lightControls: document.getElementById('light-controls'),
    fanControls: document.getElementById('fan-controls'),
    brightnessSlider: document.getElementById('brightness-slider'),
    brightnessValue: document.getElementById('brightness-value'),
    colorTempSlider: document.getElementById('color-temp-slider'),
    colorTempValue: document.getElementById('color-temp-value'),
    colorTempRow: document.getElementById('color-temp-row'),
    fanSpeedSlider: document.getElementById('fan-speed-slider'),
    fanSpeedValue: document.getElementById('fan-speed-value'),
    // Spotify elements
    trackAlbum: document.getElementById('track-album'),
    progressBar: document.getElementById('progress-bar'),
    progressFill: document.getElementById('progress-fill'),
    progressHandle: document.getElementById('progress-handle'),
    progressCurrent: document.getElementById('progress-current'),
    progressTotal: document.getElementById('progress-total'),
    volumeBar: document.getElementById('volume-bar'),
    volumeFill: document.getElementById('volume-fill'),
    volumeHandle: document.getElementById('volume-handle'),
    volumePercent: document.getElementById('volume-percent'),
    volumeIcon: document.getElementById('volume-icon'),
    speakerGrid: document.getElementById('speaker-grid'),
    browsePlaylistsBtn: document.getElementById('browse-playlists-btn'),
    playlistCount: document.getElementById('playlist-count'),
    playlistModal: document.getElementById('playlist-modal'),
    playlistModalClose: document.getElementById('playlist-modal-close'),
    playlistBrowser: document.getElementById('playlist-browser'),
    playlistSearchInput: document.getElementById('playlist-search-input'),
    queueList: document.getElementById('queue-list'),
    refreshQueueBtn: document.getElementById('refresh-queue-btn'),
  };
}

// ============================================
// WEBSOCKET
// ============================================
async function connectWebSocket() {
  // Check if token needs refresh
  if (isTokenExpired() && state.refreshToken) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      showSetupScreen();
      setLoginStatus('Session expired. Please sign in again.', 'error');
      return;
    }
  }
  
  const wsUrl = state.haUrl.replace(/^http/, 'ws') + '/api/websocket';
  console.log('Connecting to:', wsUrl);
  
  try { state.ws = new WebSocket(wsUrl); }
  catch (e) { console.error('WebSocket failed:', e); showConnectionError(); return; }
  
  state.ws.onopen = () => console.log('WebSocket connected');
  state.ws.onmessage = (e) => { try { handleWebSocketMessage(JSON.parse(e.data)); } catch (err) { console.error('Parse error:', err); } };
  state.ws.onclose = () => { 
    console.log('WebSocket closed'); 
    state.connected = false; 
    showConnectionError(); 
    setTimeout(connectWebSocket, CONFIG.RECONNECT_INTERVAL); 
  };
  state.ws.onerror = (e) => console.error('WebSocket error:', e);
}

function handleWebSocketMessage(msg) {
  switch (msg.type) {
    case 'auth_required':
      sendMessage({ type: 'auth', access_token: state.haToken });
      break;
    case 'auth_ok':
      console.log('Authenticated');
      state.connected = true;
      hideConnectionError();
      sendMessage({ id: state.wsId++, type: 'subscribe_events', event_type: 'state_changed' });
      const id = state.wsId++;
      state.pendingRequests.set(id, 'get_states');
      sendMessage({ id, type: 'get_states' });
      break;
    case 'auth_invalid':
      console.error('Auth invalid');
      state.clearConfig();
      showSetupScreen();
      setLoginStatus('Session expired. Please sign in again.', 'error');
      break;
    case 'result':
      handleResult(msg);
      break;
    case 'event':
      if (msg.event?.event_type === 'state_changed' && msg.event.data?.new_state) {
        state.states[msg.event.data.entity_id] = msg.event.data.new_state;
        updateEntityUI(msg.event.data.entity_id);
      }
      break;
  }
}

function sendMessage(msg) {
  if (state.ws?.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify(msg));
}

function handleResult(msg) {
  const type = state.pendingRequests.get(msg.id);
  state.pendingRequests.delete(msg.id);
  
  if (type === 'get_states' && msg.result) {
    msg.result.forEach(e => state.states[e.entity_id] = e);
    updateAllUI();
  }
  
  if (type === 'calendar' && msg.result?.response) {
    // New format: response contains calendar entities with their events
    // Include calendar source for color coding
    const allEvents = [];
    Object.entries(msg.result.response).forEach(([calendarId, cal]) => {
      if (cal.events) {
        cal.events.forEach(event => {
          allEvents.push({ ...event, calendar: calendarId });
        });
      }
    });
    updateCalendarEvents(allEvents);
  }
  
  if (type === 'playlists' && msg.result?.response) {
    handlePlaylistResponse(msg.result.response);
  }
  
  if (type?.type === 'queue' && msg.result?.response) {
    handleQueueResponse(msg.result.response);
  }
  
  if (type?.startsWith('todo_') && msg.result?.items) updateTaskList(type.replace('todo_', ''), msg.result.items);
}

// ============================================
// SERVICE CALLS
// ============================================
function callService(domain, service, data = {}) {
  if (!state.connected) return;
  console.log(`Calling ${domain}.${service}`, data);
  sendMessage({ id: state.wsId++, type: 'call_service', domain, service, service_data: data });
}

function toggleEntity(entityId) {
  const domain = entityId.split('.')[0];
  const entity = state.states[entityId];
  
  if (domain === 'script') callService('script', 'turn_on', { entity_id: entityId });
  else if (domain === 'cover') {
    const pos = entity?.attributes?.current_tilt_position || 0;
    callService('cover', 'set_cover_tilt_position', { entity_id: entityId, tilt_position: (pos <= 5 || pos >= 95) ? 70 : 100 });
  }
  else if (domain === 'input_boolean') callService('input_boolean', 'toggle', { entity_id: entityId });
  else callService(domain, 'toggle', { entity_id: entityId });
}

// ============================================
// UI UPDATES
// ============================================
function updateAllUI() {
  updateDateTime();
  updateMediaUI();
  updateLightsUI();
  updateWeatherUI();
  updateFamilyUI();
  initMap();
  fetchCalendarEvents();
  fetchTodoItems(ENTITIES.tasks.house, 'house');
  fetchTodoItems(ENTITIES.tasks.paul, 'paul');
  fetchTodoItems(ENTITIES.tasks.tuella, 'tuella');
  if (state.currentPage === 'cameras') startCameraRefresh();
  
  // Start progress bar timer
  startProgressTimer();
}

function startProgressTimer() {
  if (state.progressInterval) clearInterval(state.progressInterval);
  state.progressInterval = setInterval(() => {
    const spotify = state.states[ENTITIES.spotify];
    if (spotify?.state === 'playing' && !state.progressDragging) {
      const attrs = spotify.attributes || {};
      const duration = attrs.media_duration || 0;
      const position = attrs.media_position || 0;
      const updated = attrs.media_position_updated_at;
      
      if (updated && duration > 0) {
        const elapsed = (Date.now() - new Date(updated).getTime()) / 1000;
        const currentPos = Math.min(position + elapsed, duration);
        const percent = (currentPos / duration) * 100;
        
        if (DOM.progressFill) DOM.progressFill.style.width = `${percent}%`;
        if (DOM.progressHandle) DOM.progressHandle.style.left = `${percent}%`;
        if (DOM.progressCurrent) DOM.progressCurrent.textContent = formatTime(currentPos);
      }
    }
  }, 1000);
}

function updateEntityUI(entityId) {
  if (entityId === ENTITIES.spotify) updateMediaUI();
  else if (entityId.match(/^(light|fan|switch|cover)\./)) updateLightsUI();
  else if (entityId.match(/^(climate|weather|sensor|input_boolean)\./)) updateWeatherUI();
  else if (entityId.match(/^(person|device_tracker)\./)) { updateFamilyUI(); updateMapMarkers(); }
}

function updateDateTime() {
  const now = new Date();
  if (DOM.headerDate) DOM.headerDate.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (DOM.headerTime) DOM.headerTime.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (DOM.headerGreeting) {
    const h = now.getHours();
    DOM.headerGreeting.textContent = h >= 5 && h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Good night';
  }
}

function updateMediaUI() {
  const spotify = state.states[ENTITIES.spotify];
  if (!spotify) return;
  
  const playing = spotify.state === 'playing';
  const paused = spotify.state === 'paused';
  const attrs = spotify.attributes || {};
  
  // Album Art
  if (DOM.albumArt) {
    DOM.albumArt.innerHTML = attrs.entity_picture 
      ? `<img src="${state.haUrl}${attrs.entity_picture}" alt="Album">` 
      : '<span class="mdi mdi-music"></span>';
  }
  
  // Track Info
  if (DOM.trackTitle) DOM.trackTitle.textContent = attrs.media_title || 'Not Playing';
  if (DOM.trackArtist) DOM.trackArtist.textContent = attrs.media_artist || 'Select a speaker to start';
  if (DOM.trackAlbum) DOM.trackAlbum.textContent = attrs.media_album_name ? `Album: ${attrs.media_album_name}` : '';
  
  // Play/Pause Button
  if (DOM.btnPlay) DOM.btnPlay.querySelector('.mdi').className = `mdi mdi-${playing ? 'pause' : 'play'}`;
  
  // Shuffle Button
  if (DOM.btnShuffle) DOM.btnShuffle.classList.toggle('active', attrs.shuffle === true);
  
  // Repeat Button
  if (DOM.btnRepeat) {
    const repeat = attrs.repeat || 'off';
    DOM.btnRepeat.classList.toggle('active', repeat !== 'off');
    DOM.btnRepeat.querySelector('.mdi').className = `mdi mdi-${repeat === 'one' ? 'repeat-once' : 'repeat'}`;
  }
  
  // Progress Bar
  if (playing || paused) {
    updateProgressBar(attrs);
  }
  
  // Volume
  if (attrs.volume_level !== undefined) {
    const vol = Math.round(attrs.volume_level * 100);
    if (DOM.volumeFill) DOM.volumeFill.style.width = `${vol}%`;
    if (DOM.volumeHandle) DOM.volumeHandle.style.left = `${vol}%`;
    if (DOM.volumePercent) DOM.volumePercent.textContent = `${vol}%`;
    if (DOM.volumeIcon) {
      DOM.volumeIcon.className = `mdi mdi-volume-${vol === 0 ? 'off' : vol < 50 ? 'medium' : 'high'}`;
    }
  }
  
  // Update speaker status
  updateSpeakerStatus();
}

function updateProgressBar(attrs) {
  const duration = attrs.media_duration || 0;
  const position = attrs.media_position || 0;
  
  if (duration > 0 && !state.progressDragging) {
    const percent = (position / duration) * 100;
    if (DOM.progressFill) DOM.progressFill.style.width = `${percent}%`;
    if (DOM.progressHandle) DOM.progressHandle.style.left = `${percent}%`;
  }
  
  if (DOM.progressCurrent) DOM.progressCurrent.textContent = formatTime(position);
  if (DOM.progressTotal) DOM.progressTotal.textContent = formatTime(duration);
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updateSpeakerStatus() {
  const spotify = state.states[ENTITIES.spotify];
  const vlc = state.states['media_player.vlc_telnet'];
  const currentSource = spotify?.attributes?.source;
  const spotifyPlaying = spotify?.state === 'playing' || spotify?.state === 'paused';
  const vlcPlaying = vlc?.state === 'playing' || vlc?.state === 'paused';
  
  document.querySelectorAll('.speaker-item').forEach(item => {
    const name = item.dataset.name;
    const type = item.dataset.type;
    const statusEl = item.querySelector('.speaker-status');
    const radio = item.querySelector('.speaker-radio');
    
    let isActive = false;
    let statusText = '';
    
    if (type === 'vlc') {
      // VLC/Game Day Lights speaker
      if (vlcPlaying) {
        isActive = true;
        statusText = vlc.state === 'playing' ? '♪ Playing' : '❚❚ Paused';
      }
    } else if (type === 'spotify') {
      // Spotify Connect device
      isActive = currentSource === name;
      if (isActive && spotify?.state === 'playing') {
        statusText = '♪ Playing';
      } else if (isActive && spotify?.state === 'paused') {
        statusText = '❚❚ Paused';
      }
    }
    
    // Update status text
    if (statusEl) {
      statusEl.textContent = statusText;
    }
  });
}

function updateLightsUI() {
  let onCount = ENTITIES.commonLights.filter(id => state.states[id]?.state === 'on').length;
  if (DOM.masterState) DOM.masterState.textContent = `${onCount}/${ENTITIES.commonLights.length} On`;
  
  const masterCard = document.querySelector('[data-entity="script.toggle_main_lights"]');
  if (masterCard) masterCard.classList.toggle('on', onCount > 0);
  
  document.querySelectorAll('.device-card').forEach(card => {
    const entityId = card.dataset.entity;
    if (!entityId || entityId === ENTITIES.masterScript) return;
    
    const entity = state.states[entityId];
    if (!entity) return;
    
    const isOn = entity.state === 'on';
    const stateEl = card.querySelector('.device-state');
    card.classList.toggle('on', isOn);
    
    if (entityId === ENTITIES.blinds) {
      const pos = entity.attributes?.current_tilt_position || 0;
      card.classList.remove('open', 'opening', 'closing');
      if (entity.state === 'opening') { card.classList.add('opening'); if (stateEl) stateEl.textContent = 'Opening...'; }
      else if (entity.state === 'closing') { card.classList.add('closing'); if (stateEl) stateEl.textContent = 'Closing...'; }
      else if (pos > 5 && pos < 95) { card.classList.add('open'); if (stateEl) stateEl.textContent = `Open ${pos}%`; }
      else { if (stateEl) stateEl.textContent = 'Closed'; }
    } else {
      if (stateEl) {
        if (isOn && entity.attributes?.brightness) stateEl.textContent = `${Math.round((entity.attributes.brightness / 255) * 100)}%`;
        else stateEl.textContent = isOn ? 'On' : 'Off';
      }
    }
  });
}

function updateWeatherUI() {
  const w = state.states[ENTITIES.weather];
  if (w) {
    if (DOM.weatherTemp) DOM.weatherTemp.textContent = `${Math.round(w.attributes?.temperature || 0)}°`;
    if (DOM.weatherCondition) DOM.weatherCondition.textContent = (w.state || '').replace(/_/g, ' ');
    if (DOM.weatherHumidity) DOM.weatherHumidity.textContent = w.attributes?.humidity || '--';
    if (DOM.weatherWind) DOM.weatherWind.textContent = Math.round(w.attributes?.wind_speed || 0);
    const iconMap = { sunny: 'weather-sunny', 'clear-night': 'weather-night', partlycloudy: 'weather-partly-cloudy', cloudy: 'weather-cloudy', rainy: 'weather-rainy' };
    const weatherIcon = document.querySelector('.forecast-card .weather-icon');
    if (weatherIcon) weatherIcon.className = `weather-icon mdi mdi-${iconMap[w.state] || 'weather-cloudy'}`;
  }
  
  const t = state.states[ENTITIES.thermostat];
  if (t) {
    if (DOM.thermostatCurrent) DOM.thermostatCurrent.textContent = `${Math.round(t.attributes?.current_temperature || 0)}°`;
    if (DOM.thermostatTarget) DOM.thermostatTarget.textContent = Math.round(t.attributes?.temperature || 0);
    if (DOM.hvacMode) DOM.hvacMode.textContent = (t.state || 'off').toUpperCase();
  }
  
  const c = state.states[ENTITIES.autoComfort];
  if (c && DOM.comfortCard) DOM.comfortCard.classList.toggle('on', c.state === 'on');
  
  [['tempMaster', 'master'], ['tempGalley', 'galley'], ['tempBlue', 'blue'], ['tempAvg', 'average']].forEach(([dom, key]) => {
    const s = state.states[ENTITIES.temps[key]];
    if (s && DOM[dom]) DOM[dom].textContent = `${Math.round(parseFloat(s.state) || 0)}°`;
  });
}

function fetchCalendarEvents() {
  if (!state.connected) return;
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 90); // 90 days of events
  
  const id = state.wsId++;
  state.pendingRequests.set(id, 'calendar');
  sendMessage({
    id,
    type: 'call_service',
    domain: 'calendar',
    service: 'get_events',
    target: {
      entity_id: ENTITIES.calendars
    },
    service_data: {
      start_date_time: now.toISOString(),
      end_date_time: end.toISOString()
    },
    return_response: true
  });
}

function updateCalendarEvents(events) {
  if (!DOM.calendarEvents) return;
  
  if (!events?.length) { 
    DOM.calendarEvents.innerHTML = '<div class="no-events"><span class="mdi mdi-calendar-blank"></span><p>No upcoming events</p></div>'; 
    return; 
  }
  
  // Sort by start time
  events.sort((a, b) => {
    const aStart = a.start?.dateTime || a.start?.date || a.start;
    const bStart = b.start?.dateTime || b.start?.date || b.start;
    return new Date(aStart) - new Date(bStart);
  });
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  DOM.calendarEvents.innerHTML = events.map(e => {
    const startStr = e.start?.dateTime || e.start?.date || e.start;
    const endStr = e.end?.dateTime || e.end?.date || e.end;
    const startDate = new Date(startStr);
    const endDate = new Date(endStr);
    const isAllDay = !startStr.includes('T');
    
    // Determine calendar color class
    let colorClass = 'cal-other';
    if (e.calendar?.includes('basketball') || e.calendar?.includes('eagles')) {
      colorClass = 'cal-basketball';
    } else if (e.calendar?.includes('sowu_paul')) {
      colorClass = 'cal-paul';
    } else if (e.calendar?.includes('family')) {
      colorClass = 'cal-family';
    } else if (e.calendar?.includes('thesowus')) {
      colorClass = 'cal-thesowus';
    }
    
    // Format weekday: "MON"
    const weekdayStr = startDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    
    // Format date: "Jan 5"
    const dateStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    // Calculate relative date
    const eventDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const diffDays = Math.round((eventDay - today) / (1000 * 60 * 60 * 24));
    let relativeStr = '';
    if (diffDays === 0) relativeStr = 'Today';
    else if (diffDays === 1) relativeStr = 'Tomorrow';
    else if (diffDays > 1 && diffDays <= 7) relativeStr = `in ${diffDays} days`;
    else if (diffDays > 7) {
      const weeks = Math.floor(diffDays / 7);
      relativeStr = weeks === 1 ? 'in 1 week' : `in ${weeks} weeks`;
    }
    
    // Format time
    let timeHtml = '';
    if (isAllDay) {
      timeHtml = '<span class="event-allday">All day</span>';
    } else {
      const startTime = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const endTime = endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      timeHtml = `<span class="event-time-start">${startTime}</span><span class="event-time-end">- ${endTime}</span>`;
    }
    
    // Location (extract venue name)
    let locationHtml = '';
    if (e.location) {
      const loc = e.location.split(',')[0];
      locationHtml = `<div class="event-location"><span class="mdi mdi-map-marker"></span><span>${loc}</span></div>`;
    }
    
    return `
      <div class="event-bubble ${colorClass}">
        <div class="event-date-block">
          <span class="event-date-weekday">${weekdayStr}</span>
          <span class="event-date-day">${dateStr}</span>
          ${relativeStr ? `<span class="event-date-relative">${relativeStr}</span>` : ''}
        </div>
        <div class="event-content">
          <div class="event-title" title="${e.summary || 'Untitled'}">${e.summary || 'Untitled'}</div>
          ${locationHtml}
        </div>
        <div class="event-time-block">${timeHtml}</div>
      </div>
    `;
  }).join('');
}

function fetchTodoItems(entity, listId) {
  if (!state.connected) return;
  const id = state.wsId++;
  state.pendingRequests.set(id, `todo_${listId}`);
  sendMessage({ id, type: 'todo/item/list', entity_id: entity });
}

function updateTaskList(listId, items) {
  const container = document.getElementById(`tasks-${listId}`);
  const itemsEl = container?.querySelector('.task-items');
  if (!itemsEl) return;
  if (!items?.length) { itemsEl.innerHTML = '<div class="task-item" style="color: var(--text-muted);">No tasks</div>'; return; }
  itemsEl.innerHTML = items.slice(0, 5).map(i => {
    const done = i.status === 'completed';
    return `<div class="task-item ${done ? 'done' : ''}"><span class="mdi mdi-${done ? 'checkbox-marked' : 'checkbox-blank-outline'}"></span><span>${i.summary || i.name || ''}</span></div>`;
  }).join('');
}

function updateFamilyUI() {
  ENTITIES.persons.forEach(p => {
    const entity = state.states[p.entity];
    const tracker = state.states[p.tracker];
    if (!entity) return;
    
    const name = p.name.toLowerCase();
    const statusEl = document.getElementById(`status-${name}`);
    const locationEl = document.getElementById(`location-${name}`);
    const batteryEl = document.getElementById(`battery-${name}`);
    const card = document.querySelector(`[data-person="${p.entity}"]`);
    
    const isHome = entity.state === 'home';
    const isDriving = tracker?.attributes?.driving;
    
    if (card) { card.classList.toggle('home', isHome); card.classList.toggle('away', !isHome); }
    if (statusEl) statusEl.innerHTML = isHome ? '🏠 Home' : isDriving ? '🚗 Driving' : '📍 Away';
    if (locationEl) {
      const addr = tracker?.attributes?.address;
      locationEl.textContent = addr ? (addr.length > 40 ? addr.substring(0, 37) + '...' : addr) : (!isHome ? entity.state : '');
    }
    if (batteryEl && tracker?.attributes?.battery_level !== undefined) {
      batteryEl.textContent = `${tracker.attributes.battery_charging ? '⚡' : '🔋'} ${tracker.attributes.battery_level}%`;
    }
  });
}

// ============================================
// LEAFLET MAP
// ============================================
function initMap() {
  if (state.map || !DOM.familyMap) return;
  
  state.map = L.map('family-map', { center: CONFIG.HOME_COORDS, zoom: 15, zoomControl: false });
  L.control.zoom({ position: 'bottomright' }).addTo(state.map);
  
  state.mapLayers = {
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri', maxZoom: 19 }),
    street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }),
  };
  
  state.mapLayers.satellite.addTo(state.map);
  if (DOM.mapSatellite) DOM.mapSatellite.classList.add('active');
  
  updateMapMarkers();
  setTimeout(() => fitMapToMarkers(), 500);
}

function updateMapMarkers() {
  if (!state.map) return;
  
  ENTITIES.persons.forEach(p => {
    const tracker = state.states[p.tracker];
    if (!tracker?.attributes?.latitude) return;
    
    const lat = tracker.attributes.latitude;
    const lng = tracker.attributes.longitude;
    const isDriving = tracker.attributes.driving;
    const picture = tracker.attributes.entity_picture;
    
    if (state.mapMarkers[p.name]) {
      state.mapMarkers[p.name].setLatLng([lat, lng]);
    } else {
      const iconHtml = picture 
        ? `<div class="person-marker ${isDriving ? 'driving' : ''}" style="background-image: url('${picture}')"></div>`
        : `<div class="person-marker ${isDriving ? 'driving' : ''}" style="background: ${p.color}; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 16px;">${p.name[0]}</div>`;
      
      const icon = L.divIcon({ html: iconHtml, className: 'person-marker-container', iconSize: [40, 40], iconAnchor: [20, 20], popupAnchor: [0, -25] });
      
      state.mapMarkers[p.name] = L.marker([lat, lng], { icon })
        .addTo(state.map)
        .bindPopup(() => {
          const t = state.states[p.tracker];
          const driving = t?.attributes?.driving;
          const spd = t?.attributes?.speed || 0;
          const address = t?.attributes?.address || 'Unknown';
          return `<div class="popup-content"><div class="name">${p.name}</div><div class="status">${driving ? '🚗 Driving' : '📍 Stationary'}</div>${driving ? `<div class="speed">${Math.round(spd)} mph</div>` : ''}<div class="address">${address}</div></div>`;
        });
    }
    
    const markerEl = state.mapMarkers[p.name].getElement();
    if (markerEl) {
      const innerMarker = markerEl.querySelector('.person-marker');
      if (innerMarker) innerMarker.classList.toggle('driving', isDriving);
    }
  });
}

function fitMapToMarkers() {
  if (!state.map || Object.keys(state.mapMarkers).length === 0) return;
  const bounds = L.latLngBounds([]);
  Object.values(state.mapMarkers).forEach(marker => bounds.extend(marker.getLatLng()));
  if (bounds.isValid()) state.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
}

function setMapLayer(layerName) {
  if (!state.map || !state.mapLayers) return;
  Object.values(state.mapLayers).forEach(layer => { if (state.map.hasLayer(layer)) state.map.removeLayer(layer); });
  if (state.mapLayers[layerName]) state.mapLayers[layerName].addTo(state.map);
  DOM.mapSatellite?.classList.toggle('active', layerName === 'satellite');
  DOM.mapStreet?.classList.toggle('active', layerName === 'street');
}

// ============================================
// CAMERAS
// ============================================
function startCameraRefresh() {
  stopCameraRefresh();
  const cameras = [
    { id: 'main', entity: ENTITIES.cameras.main, img: DOM.cameraMainImg },
    { id: 'wyze', entity: ENTITIES.cameras.wyze, img: DOM.cameraWyzeImg },
    { id: 'pan', entity: ENTITIES.cameras.pan, img: DOM.cameraPanImg },
    { id: 'redbase', entity: ENTITIES.cameras.redbase, img: DOM.cameraRedbaseImg },
  ];
  cameras.forEach(c => {
    if (c.img) {
      refreshCamera(c.entity, c.img);
      state.cameraIntervals[c.id] = setInterval(() => refreshCamera(c.entity, c.img), CONFIG.CAMERA_REFRESH_INTERVAL);
    }
  });
}

function refreshCamera(entityId, imgEl) {
  if (!imgEl || !state.haUrl || !state.haToken) return;
  fetch(`${state.haUrl}/api/camera_proxy/${entityId}?t=${Date.now()}`, { headers: { 'Authorization': `Bearer ${state.haToken}` } })
    .then(r => r.blob())
    .then(blob => { imgEl.src = URL.createObjectURL(blob); if (DOM.cameraMainLoading) DOM.cameraMainLoading.classList.add('hidden'); })
    .catch(e => console.error('Camera error:', e));
}

function stopCameraRefresh() {
  Object.values(state.cameraIntervals).forEach(clearInterval);
  state.cameraIntervals = {};
}

// ============================================
// MODALS
// ============================================
function openDeviceModal(entityId) {
  const entity = state.states[entityId];
  if (!entity) return;
  
  state.currentModalEntity = entityId;
  const domain = entityId.split('.')[0];
  const name = entity.attributes?.friendly_name || entityId;
  
  if (DOM.modalTitle) DOM.modalTitle.textContent = name;
  
  const isLight = domain === 'light';
  const isFan = domain === 'fan';
  
  if (DOM.lightControls) DOM.lightControls.classList.toggle('hidden', !isLight);
  if (DOM.fanControls) DOM.fanControls.classList.toggle('hidden', !isFan);
  
  if (isLight) {
    const brightness = entity.attributes?.brightness || 0;
    const pct = Math.round((brightness / 255) * 100);
    if (DOM.brightnessSlider) DOM.brightnessSlider.value = pct;
    if (DOM.brightnessValue) DOM.brightnessValue.textContent = `${pct}%`;
    
    const hasColorTemp = entity.attributes?.supported_color_modes?.includes('color_temp');
    if (DOM.colorTempRow) DOM.colorTempRow.classList.toggle('hidden', !hasColorTemp);
    if (hasColorTemp && DOM.colorTempSlider) {
      const kelvin = entity.attributes?.color_temp_kelvin || 4000;
      DOM.colorTempSlider.value = kelvin;
      if (DOM.colorTempValue) DOM.colorTempValue.textContent = `${kelvin}K`;
    }
  }
  
  if (isFan) {
    const pct = entity.attributes?.percentage || 0;
    if (DOM.fanSpeedSlider) DOM.fanSpeedSlider.value = pct;
    if (DOM.fanSpeedValue) DOM.fanSpeedValue.textContent = `${pct}%`;
    
    const preset = entity.attributes?.preset_mode;
    document.querySelectorAll('#fan-presets .preset-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.preset === preset));
    
    const direction = entity.attributes?.direction;
    document.querySelectorAll('#fan-direction .preset-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.direction === direction));
  }
  
  if (DOM.deviceModal) DOM.deviceModal.classList.remove('hidden');
}

function closeDeviceModal() {
  if (DOM.deviceModal) DOM.deviceModal.classList.remove('hidden');
  state.currentModalEntity = null;
}

// ============================================
// SPOTIFY CONTROLS
// ============================================

// Progress bar seeking
function initProgressBar() {
  if (!DOM.progressBar) return;
  
  let dragging = false;
  
  const seek = (e) => {
    const rect = DOM.progressBar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const spotify = state.states[ENTITIES.spotify];
    const duration = spotify?.attributes?.media_duration || 0;
    
    if (DOM.progressFill) DOM.progressFill.style.width = `${percent * 100}%`;
    if (DOM.progressHandle) DOM.progressHandle.style.left = `${percent * 100}%`;
    
    return Math.floor(percent * duration);
  };
  
  DOM.progressBar.addEventListener('mousedown', (e) => {
    dragging = true;
    state.progressDragging = true;
    DOM.progressBar.classList.add('dragging');
    seek(e);
  });
  
  document.addEventListener('mousemove', (e) => {
    if (dragging) seek(e);
  });
  
  document.addEventListener('mouseup', (e) => {
    if (dragging) {
      dragging = false;
      state.progressDragging = false;
      DOM.progressBar.classList.remove('dragging');
      const position = seek(e);
      callService('media_player', 'media_seek', { 
        entity_id: ENTITIES.spotify, 
        seek_position: position 
      });
    }
  });
  
  // Touch support
  DOM.progressBar.addEventListener('touchstart', (e) => {
    dragging = true;
    state.progressDragging = true;
    DOM.progressBar.classList.add('dragging');
  }, { passive: true });
  
  DOM.progressBar.addEventListener('touchmove', (e) => {
    if (dragging && e.touches[0]) {
      const touch = e.touches[0];
      const rect = DOM.progressBar.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
      if (DOM.progressFill) DOM.progressFill.style.width = `${percent * 100}%`;
      if (DOM.progressHandle) DOM.progressHandle.style.left = `${percent * 100}%`;
    }
  }, { passive: true });
  
  DOM.progressBar.addEventListener('touchend', (e) => {
    if (dragging) {
      dragging = false;
      state.progressDragging = false;
      DOM.progressBar.classList.remove('dragging');
      const rect = DOM.progressBar.getBoundingClientRect();
      const fill = DOM.progressFill;
      const percent = parseFloat(fill.style.width) / 100;
      const spotify = state.states[ENTITIES.spotify];
      const duration = spotify?.attributes?.media_duration || 0;
      callService('media_player', 'media_seek', { 
        entity_id: ENTITIES.spotify, 
        seek_position: Math.floor(percent * duration) 
      });
    }
  });
}

// Volume control
function initVolumeBar() {
  if (!DOM.volumeBar) return;
  
  let dragging = false;
  
  const setVolume = (e) => {
    const rect = DOM.volumeBar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    
    if (DOM.volumeFill) DOM.volumeFill.style.width = `${percent * 100}%`;
    if (DOM.volumeHandle) DOM.volumeHandle.style.left = `${percent * 100}%`;
    if (DOM.volumePercent) DOM.volumePercent.textContent = `${Math.round(percent * 100)}%`;
    
    return percent;
  };
  
  DOM.volumeBar.addEventListener('mousedown', (e) => {
    dragging = true;
    DOM.volumeBar.classList.add('dragging');
    setVolume(e);
  });
  
  document.addEventListener('mousemove', (e) => {
    if (dragging) setVolume(e);
  });
  
  document.addEventListener('mouseup', (e) => {
    if (dragging) {
      dragging = false;
      DOM.volumeBar.classList.remove('dragging');
      const volume = setVolume(e);
      callService('media_player', 'volume_set', { 
        entity_id: ENTITIES.spotify, 
        volume_level: volume 
      });
    }
  });
  
  // Touch support
  DOM.volumeBar.addEventListener('touchstart', () => {
    dragging = true;
    DOM.volumeBar.classList.add('dragging');
  }, { passive: true });
  
  DOM.volumeBar.addEventListener('touchmove', (e) => {
    if (dragging && e.touches[0]) {
      const touch = e.touches[0];
      const rect = DOM.volumeBar.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
      if (DOM.volumeFill) DOM.volumeFill.style.width = `${percent * 100}%`;
      if (DOM.volumeHandle) DOM.volumeHandle.style.left = `${percent * 100}%`;
      if (DOM.volumePercent) DOM.volumePercent.textContent = `${Math.round(percent * 100)}%`;
    }
  }, { passive: true });
  
  DOM.volumeBar.addEventListener('touchend', () => {
    if (dragging) {
      dragging = false;
      DOM.volumeBar.classList.remove('dragging');
      const percent = parseFloat(DOM.volumeFill.style.width) / 100;
      callService('media_player', 'volume_set', { 
        entity_id: ENTITIES.spotify, 
        volume_level: percent 
      });
    }
  });
}

// Playlist Browser
function openPlaylistBrowser() {
  if (DOM.playlistModal) DOM.playlistModal.classList.remove('hidden');
  if (!state.playlists || state.playlists.length === 0) {
    fetchPlaylists();
  } else {
    renderPlaylists(state.playlists);
  }
}

function closePlaylistBrowser() {
  if (DOM.playlistModal) DOM.playlistModal.classList.add('hidden');
}

function fetchPlaylists() {
  if (!state.connected) return;
  
  const id = state.wsId++;
  state.pendingRequests.set(id, 'playlists');
  sendMessage({
    id,
    type: 'call_service',
    domain: 'spotifyplus',
    service: 'get_playlist_favorites',
    service_data: {
      entity_id: ENTITIES.spotifyPlus,
      limit: 50
    },
    return_response: true
  });
}

function handlePlaylistResponse(response) {
  if (response?.result?.items) {
    state.playlists = response.result.items;
    if (DOM.playlistCount) DOM.playlistCount.textContent = response.result.total || state.playlists.length;
    renderPlaylists(state.playlists);
  }
}

function renderPlaylists(playlists) {
  if (!DOM.playlistBrowser) return;
  
  const searchTerm = DOM.playlistSearchInput?.value?.toLowerCase() || '';
  const filtered = searchTerm 
    ? playlists.filter(p => p.name.toLowerCase().includes(searchTerm))
    : playlists;
  
  if (filtered.length === 0) {
    DOM.playlistBrowser.innerHTML = '<div class="playlist-loading">No playlists found</div>';
    return;
  }
  
  DOM.playlistBrowser.innerHTML = filtered.map(p => `
    <div class="playlist-browser-item" data-uri="${p.uri}">
      <img src="${p.image_url || ''}" alt="" onerror="this.style.display='none'">
      <div class="playlist-browser-info">
        <div class="playlist-browser-name">${p.name}</div>
        <div class="playlist-browser-tracks">${p.tracks?.total || 0} tracks</div>
      </div>
      <span class="mdi mdi-play"></span>
    </div>
  `).join('');
  
  DOM.playlistBrowser.querySelectorAll('.playlist-browser-item').forEach(item => {
    item.addEventListener('click', () => {
      const uri = item.dataset.uri;
      playPlaylist(uri);
      closePlaylistBrowser();
    });
  });
}

function playPlaylist(uri) {
  const speaker = state.selectedSpeaker;
  
  // Select the speaker source first
  if (speaker?.name) {
    callService('media_player', 'select_source', { 
      entity_id: ENTITIES.spotify, 
      source: speaker.name 
    });
  }
  
  // Small delay to allow source switch, then play
  setTimeout(() => {
    callService('media_player', 'play_media', { 
      entity_id: ENTITIES.spotify, 
      media_content_type: 'playlist', 
      media_content_id: uri 
    });
  }, 500);
}

// Queue functions
function fetchQueue() {
  const btn = document.getElementById('refresh-queue-btn');
  if (btn) btn.classList.add('loading');
  
  const id = state.wsId++;
  state.pendingRequests.set(id, { type: 'queue' });
  
  sendMessage({
    id,
    type: 'call_service',
    domain: 'spotifyplus',
    service: 'get_player_queue_info',
    service_data: { entity_id: ENTITIES.spotifyPlus },
    return_response: true
  });
}

function handleQueueResponse(response) {
  const btn = document.getElementById('refresh-queue-btn');
  if (btn) btn.classList.remove('loading');
  
  const queueList = document.getElementById('queue-list');
  if (!queueList) return;
  
  const result = response?.result;
  const queue = result?.queue || [];
  
  if (queue.length === 0) {
    queueList.innerHTML = '<div class="queue-empty">No tracks in queue</div>';
    return;
  }
  
  // Show up to 10 tracks
  const tracks = queue.slice(0, 10);
  queueList.innerHTML = tracks.map((track, i) => {
    const name = track.name || 'Unknown';
    const artist = track.artists?.[0]?.name || 'Unknown Artist';
    const image = track.image_url || '';
    const duration = formatTime(Math.floor((track.duration_ms || 0) / 1000));
    const uri = track.uri || '';
    
    return `
      <div class="queue-item" data-uri="${uri}">
        <span class="queue-item-number">${i + 1}</span>
        ${image ? `<img src="${image}" alt="">` : '<span class="mdi mdi-music-note"></span>'}
        <div class="queue-item-info">
          <div class="queue-item-name">${name}</div>
          <div class="queue-item-artist">${artist}</div>
        </div>
        <span class="queue-item-duration">${duration}</span>
      </div>
    `;
  }).join('');
  
  // Add click handlers to play track
  queueList.querySelectorAll('.queue-item').forEach(item => {
    item.addEventListener('click', () => {
      const uri = item.dataset.uri;
      if (uri) {
        callService('media_player', 'play_media', {
          entity_id: ENTITIES.spotify,
          media_content_type: 'track',
          media_content_id: uri
        });
      }
    });
  });
}

function getSelectedSpeakers() {
  const selected = [];
  document.querySelectorAll('.speaker-radio:checked').forEach(radio => {
    const item = radio.closest('.speaker-item');
    if (item) {
      selected.push({
        entity: item.dataset.entity,
        name: item.dataset.name,
        type: item.dataset.type
      });
    }
  });
  return selected;
}

function initSpeakerSelection() {
  document.querySelectorAll('.speaker-radio').forEach(radio => {
    radio.addEventListener('change', () => {
      const item = radio.closest('.speaker-item');
      if (!item) return;
      
      const speakerName = item.dataset.name;
      const speakerEntity = item.dataset.entity;
      const speakerType = item.dataset.type;
      
      if (radio.checked) {
        // Store selected speaker for playlist playback
        state.selectedSpeaker = {
          entity: speakerEntity,
          name: speakerName,
          type: speakerType
        };
        state.saveConfig();
        
        // If Spotify is currently playing, transfer playback
        const spotify = state.states[ENTITIES.spotify];
        if (spotify?.state === 'playing') {
          transferToSpeaker(speakerName, speakerEntity, speakerType);
        }
      }
    });
  });
  
  // Load saved speaker selection
  if (state.selectedSpeaker) {
    const radio = document.querySelector(`.speaker-item[data-entity="${state.selectedSpeaker.entity}"] .speaker-radio`);
    if (radio) radio.checked = true;
  }
}

function transferToSpeaker(speakerName, speakerEntity, speakerType) {
  if (speakerType === 'spotify') {
    // Use Spotify select_source for Spotify Connect devices
    callService('media_player', 'select_source', { 
      entity_id: ENTITIES.spotify, 
      source: speakerName 
    });
  } else if (speakerType === 'vlc') {
    // VLC/Game Day Lights - can't transfer Spotify directly
    // This speaker is for manual playlist selection
    console.log('VLC speaker selected - use for local playback');
  }
}

function transferViaSpotifyPlus(deviceName) {
  // Use SpotifyPlus to transfer - it accepts device name
  const id = state.wsId++;
  sendMessage({
    id,
    type: 'call_service',
    domain: 'spotifyplus',
    service: 'player_transfer_playback',
    service_data: {
      entity_id: ENTITIES.spotifyPlus,
      device_id: deviceName,
      play: true,
      refresh_device_list: true
    }
  });
}

// ============================================
// NAVIGATION
// ============================================
function navigateToPage(pageName) {
  state.currentPage = pageName;
  DOM.topNavButtons.forEach(b => b.classList.toggle('active', b.dataset.page === pageName));
  DOM.navButtons.forEach(b => b.classList.toggle('active', b.dataset.page === pageName));
  
  const pages = ['media', 'lights', 'weather', 'calendar', 'family', 'cameras'];
  const idx = pages.indexOf(pageName);
  if (DOM.pagesContainer) DOM.pagesContainer.style.transform = `translateX(-${idx * (100 / 6)}%)`;
  
  if (pageName === 'cameras') startCameraRefresh();
  else stopCameraRefresh();
  
  if (pageName === 'family' && state.map) {
    setTimeout(() => { state.map.invalidateSize(); updateMapMarkers(); }, 300);
  }
  
  if (pageName === 'calendar') {
    fetchCalendarEvents();
    fetchTodoItems(ENTITIES.tasks.house, 'house');
    fetchTodoItems(ENTITIES.tasks.paul, 'paul');
    fetchTodoItems(ENTITIES.tasks.tuella, 'tuella');
  }
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
  // OAuth login button
  DOM.btnLogin?.addEventListener('click', startOAuthFlow);
  
  // Advanced setup form (token-based)
  DOM.setupForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    state.haUrl = DOM.haUrlInput.value.replace(/\/$/, '');
    state.haToken = DOM.haTokenInput.value;
    state.saveConfig();
    showMainApp();
    connectWebSocket();
  });
  
  // Navigation
  DOM.topNavButtons.forEach(b => b.addEventListener('click', () => navigateToPage(b.dataset.page)));
  DOM.navButtons.forEach(b => b.addEventListener('click', () => navigateToPage(b.dataset.page)));
  
  // Device cards
  document.querySelectorAll('.device-card').forEach(card => {
    let pressTimer;
    const entityId = card.dataset.entity;
    const type = card.dataset.type;
    
    const handleTap = () => { if (entityId) toggleEntity(entityId); };
    const handleLongPress = () => { if (type === 'light' || type === 'fan') openDeviceModal(entityId); };
    
    card.addEventListener('mousedown', () => { pressTimer = setTimeout(handleLongPress, 500); });
    card.addEventListener('mouseup', () => { clearTimeout(pressTimer); });
    card.addEventListener('mouseleave', () => { clearTimeout(pressTimer); });
    card.addEventListener('click', (e) => { if (!DOM.deviceModal?.classList.contains('hidden')) return; handleTap(); });
    
    card.addEventListener('touchstart', (e) => { pressTimer = setTimeout(handleLongPress, 500); }, { passive: true });
    card.addEventListener('touchend', () => { clearTimeout(pressTimer); });
    card.addEventListener('touchcancel', () => { clearTimeout(pressTimer); });
  });
  
  // Modal controls
  DOM.modalClose?.addEventListener('click', closeDeviceModal);
  DOM.deviceModal?.querySelector('.modal-backdrop')?.addEventListener('click', closeDeviceModal);
  
  DOM.brightnessSlider?.addEventListener('input', (e) => { if (DOM.brightnessValue) DOM.brightnessValue.textContent = `${e.target.value}%`; });
  DOM.brightnessSlider?.addEventListener('change', (e) => {
    if (!state.currentModalEntity) return;
    callService('light', 'turn_on', { entity_id: state.currentModalEntity, brightness: Math.round((e.target.value / 100) * 255) });
  });
  
  DOM.colorTempSlider?.addEventListener('input', (e) => { if (DOM.colorTempValue) DOM.colorTempValue.textContent = `${e.target.value}K`; });
  DOM.colorTempSlider?.addEventListener('change', (e) => {
    if (!state.currentModalEntity) return;
    callService('light', 'turn_on', { entity_id: state.currentModalEntity, color_temp_kelvin: parseInt(e.target.value) });
  });
  
  DOM.fanSpeedSlider?.addEventListener('input', (e) => { if (DOM.fanSpeedValue) DOM.fanSpeedValue.textContent = `${e.target.value}%`; });
  DOM.fanSpeedSlider?.addEventListener('change', (e) => {
    if (!state.currentModalEntity) return;
    callService('fan', 'set_percentage', { entity_id: state.currentModalEntity, percentage: parseInt(e.target.value) });
  });
  
  document.querySelectorAll('#fan-presets .preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.currentModalEntity) return;
      callService('fan', 'set_preset_mode', { entity_id: state.currentModalEntity, preset_mode: btn.dataset.preset });
      document.querySelectorAll('#fan-presets .preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  
  document.querySelectorAll('#fan-direction .preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.currentModalEntity) return;
      callService('fan', 'set_direction', { entity_id: state.currentModalEntity, direction: btn.dataset.direction });
      document.querySelectorAll('#fan-direction .preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  
  // Spotify Controls
  DOM.btnPlay?.addEventListener('click', () => callService('media_player', 'media_play_pause', { entity_id: ENTITIES.spotify }));
  DOM.btnPrev?.addEventListener('click', () => callService('media_player', 'media_previous_track', { entity_id: ENTITIES.spotify }));
  DOM.btnNext?.addEventListener('click', () => callService('media_player', 'media_next_track', { entity_id: ENTITIES.spotify }));
  DOM.btnShuffle?.addEventListener('click', () => {
    const shuffle = !(state.states[ENTITIES.spotify]?.attributes?.shuffle);
    callService('media_player', 'shuffle_set', { entity_id: ENTITIES.spotify, shuffle });
  });
  DOM.btnRepeat?.addEventListener('click', () => {
    const current = state.states[ENTITIES.spotify]?.attributes?.repeat || 'off';
    const next = current === 'off' ? 'all' : current === 'all' ? 'one' : 'off';
    callService('media_player', 'repeat_set', { entity_id: ENTITIES.spotify, repeat: next });
  });
  
  // Quick Playlists
  document.querySelectorAll('.playlist-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const playlist = btn.dataset.playlist;
      if (playlist) playPlaylist(playlist);
    });
  });
  
  // Playlist Browser
  DOM.browsePlaylistsBtn?.addEventListener('click', openPlaylistBrowser);
  DOM.playlistModalClose?.addEventListener('click', closePlaylistBrowser);
  DOM.playlistModal?.querySelector('.modal-backdrop')?.addEventListener('click', closePlaylistBrowser);
  DOM.playlistSearchInput?.addEventListener('input', () => {
    if (state.playlists) renderPlaylists(state.playlists);
  });
  
  // Queue refresh button
  DOM.refreshQueueBtn?.addEventListener('click', fetchQueue);
  
  // Initialize Spotify sliders
  initProgressBar();
  initVolumeBar();
  initSpeakerSelection();
  
  // Fetch playlists count and queue on load
  setTimeout(() => {
    if (state.connected) {
      fetchPlaylists();
      fetchQueue();
    }
  }, 2000);
  
  // Thermostat
  DOM.tempUp?.addEventListener('click', () => {
    const t = state.states[ENTITIES.thermostat]?.attributes?.temperature || 72;
    callService('climate', 'set_temperature', { entity_id: ENTITIES.thermostat, temperature: t + 1 });
  });
  DOM.tempDown?.addEventListener('click', () => {
    const t = state.states[ENTITIES.thermostat]?.attributes?.temperature || 72;
    callService('climate', 'set_temperature', { entity_id: ENTITIES.thermostat, temperature: t - 1 });
  });
  DOM.comfortCard?.addEventListener('click', () => toggleEntity(ENTITIES.autoComfort));
  
  // Map
  DOM.mapSatellite?.addEventListener('click', () => setMapLayer('satellite'));
  DOM.mapStreet?.addEventListener('click', () => setMapLayer('street'));
  DOM.mapCenter?.addEventListener('click', () => fitMapToMarkers());
  
  // Swipe
  let touchStartX = 0;
  DOM.pagesContainer?.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
  DOM.pagesContainer?.addEventListener('touchend', (e) => {
    const diff = touchStartX - e.changedTouches[0].screenX;
    if (Math.abs(diff) > 50) {
      const pages = ['media', 'lights', 'weather', 'calendar', 'family', 'cameras'];
      const idx = pages.indexOf(state.currentPage);
      if (diff > 0 && idx < pages.length - 1) navigateToPage(pages[idx + 1]);
      else if (diff < 0 && idx > 0) navigateToPage(pages[idx - 1]);
    }
  }, { passive: true });
  
  setInterval(updateDateTime, 60000);
}

// ============================================
// INIT
// ============================================
function showSetupScreen() { DOM.setupScreen?.classList.remove('hidden'); DOM.mainApp?.classList.add('hidden'); }
function showMainApp() { DOM.setupScreen?.classList.add('hidden'); DOM.mainApp?.classList.remove('hidden'); navigateToPage('lights'); }
function showConnectionError() { DOM.connectionBanner?.classList.remove('hidden'); }
function hideConnectionError() { DOM.connectionBanner?.classList.add('hidden'); }

async function init() {
  console.log('Casa de Sowu initializing...');
  cacheDOMElements();
  setupEventListeners();
  updateDateTime();
  
  // Check for OAuth callback
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('code')) {
    const success = await handleOAuthCallback();
    if (success) {
      showMainApp();
      connectWebSocket();
      return;
    }
  }
  
  // Check for existing token
  if (state.loadConfig() && state.haToken) {
    // Check if token needs refresh
    if (isTokenExpired() && state.refreshToken) {
      const refreshed = await refreshAccessToken();
      if (!refreshed) {
        showSetupScreen();
        setLoginStatus('Session expired. Please sign in again.', 'error');
        return;
      }
    }
    showMainApp();
    connectWebSocket();
  } else {
    showSetupScreen();
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(e => console.log('SW failed:', e)); });
}
