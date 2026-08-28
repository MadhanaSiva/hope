/**
 * CampusGuard Main Application Controller
 * Handles UI interactions, view transitions, modals, universal WAV voice notes, natural human speech synthesis, photo attachments, interactive campus map/GPS navigation, and multi-device real-time sync.
 */

let lastKnownIncidentCount = 0;

// Media Evidence State
let currentVoiceNote = null; // { dataUrl, transcript, text, duration, recordedAt }
let currentPhotoUrl = null;  // base64 data url
let audioContext = null;
let scriptProcessor = null;
let mediaStream = null;
let recordedBuffers = [];
let voiceTimerInterval = null;
let voiceSeconds = 0;
let isSimulatingRecording = false;

// Tactical Map Radar Animation
let mapAnimationId = null;
let mapRadarAngle = 0;

document.addEventListener('DOMContentLoaded', () => {
  window.authManager.init();
  initApp();
});

function initApp() {
  bindGlobalEvents();
  renderApp();

  // Listen for state changes (from this tab or other tabs/devices via SSE)
  window.state.subscribe((event) => {
    handleStateEvent(event);
  });
}

function handleStateEvent(event) {
  const currentUser = window.authManager.getCurrentUser();
  
  // Always update the campus-wide fire alert banner for all users
  updateCampusWideFireBanner();

  if (!currentUser) {
    renderApp();
    return;
  }

  // Check for newly created incoming incidents if on responder dashboard
  if (currentUser.role === 'responder') {
    const incidents = window.state.getIncidents();
    const currentCount = incidents.length;
    
    if (currentCount > lastKnownIncidentCount) {
      // New incident created!
      const latestIncident = incidents[0];
      if (latestIncident && latestIncident.status === 'Reported') {
        const routing = window.state.getDepartmentRouting();
        const responderType = currentUser.responderType || 'Security';
        const allowedCategories = routing[responderType] || ['fire'];

        if (allowedCategories.includes(latestIncident.category)) {
          // Play incoming notification sound strictly for this matched responder!
          window.soundEngine.playPulseSound();
          showToast(`🚨 Incoming Alert for ${currentUser.name}: ${latestIncident.categoryLabel}`, 'danger');
        }
      }
    }
    lastKnownIncidentCount = currentCount;
    renderResponderView();
  } else if (currentUser.role === 'student') {
    renderStudentActiveIncident();
  } else if (currentUser.role === 'admin') {
    renderAdminView();
  }

  updateNavbar();
}

function updateCampusWideFireBanner() {
  const banner = document.getElementById('campusWideFireBanner');
  const zoneEl = document.getElementById('fireBannerZone');
  if (!banner) return;

  const incidents = window.state.getIncidents();
  const activeFire = incidents.find(i => i.category === 'fire' && i.status !== 'Resolved');

  if (activeFire) {
    banner.classList.remove('hidden');
    if (zoneEl) {
      const locText = activeFire.customDetail 
        ? `${activeFire.zoneName || activeFire.location} — ${activeFire.customDetail}`
        : `${activeFire.zoneName || activeFire.location}`;
      zoneEl.textContent = locText;
    }
  } else {
    banner.classList.add('hidden');
  }
}

function bindGlobalEvents() {
  // Sound Toggle Button
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  if (soundToggleBtn) {
    soundToggleBtn.addEventListener('click', () => {
      const settings = window.state.getSettings();
      settings.soundEnabled = !settings.soundEnabled;
      window.state.saveSettings(settings);
      window.soundEngine.setMuted(!settings.soundEnabled);
      updateSoundButtonUI(settings.soundEnabled);
      showToast(`Emergency Audio ${settings.soundEnabled ? 'Enabled' : 'Muted'}`, 'info');
    });
  }

  // Global Logout Button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      window.authManager.logout();
      showToast('Signed out of terminal', 'info');
      renderApp();
    });
  }
}

function updateSoundButtonUI(enabled) {
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  if (soundToggleBtn) {
    soundToggleBtn.classList.toggle('muted', !enabled);
    soundToggleBtn.innerHTML = enabled ? '🔔 <span class="hide-mobile">Audio ON</span>' : '🔕 <span class="hide-mobile">Muted</span>';
  }
}

// Master Render Router
function renderApp() {
  const currentUser = window.authManager.getCurrentUser();
  const settings = window.state.getSettings();
  window.soundEngine.setMuted(!settings.soundEnabled);
  updateSoundButtonUI(settings.soundEnabled);

  const authView = document.getElementById('view-auth');
  const studentView = document.getElementById('view-student');
  const responderView = document.getElementById('view-responder');
  const adminView = document.getElementById('view-admin');

  // Always update campus-wide fire alert banner
  updateCampusWideFireBanner();

  // Hide all views first
  authView.classList.add('hidden');
  studentView.classList.add('hidden');
  responderView.classList.add('hidden');
  adminView.classList.add('hidden');

  updateNavbar();

  if (!currentUser) {
    authView.classList.remove('hidden');
    renderAuthView();
    return;
  }

  // Track initial count for incoming alert detection
  lastKnownIncidentCount = window.state.getIncidents().length;

  // Show active role dashboard
  if (currentUser.role === 'student') {
    studentView.classList.remove('hidden');
    renderStudentView();
  } else if (currentUser.role === 'responder') {
    responderView.classList.remove('hidden');
    renderResponderView();
  } else if (currentUser.role === 'admin') {
    adminView.classList.remove('hidden');
    renderAdminView();
  }
}

function updateNavbar() {
  const currentUser = window.authManager.getCurrentUser();
  const userProfileBadge = document.getElementById('userProfileBadge');
  const userNameEl = document.getElementById('navUserName');
  const userRoleEl = document.getElementById('navUserRole');
  const logoutBtn = document.getElementById('logoutBtn');

  if (currentUser) {
    userProfileBadge.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    userNameEl.textContent = currentUser.name;
    userRoleEl.textContent = currentUser.responderType ? `${currentUser.responderType} Unit` : currentUser.role;
    userRoleEl.className = `role-pill ${currentUser.role}`;
  } else {
    userProfileBadge.classList.add('hidden');
    logoutBtn.classList.add('hidden');
  }
}

/* ==========================================================================
   AUTH VIEW (Production Login Terminal)
   ========================================================================== */
function renderAuthView() {
  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  const authError = document.getElementById('authError');

  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      authError.classList.add('hidden');
      try {
        const user = window.authManager.login(emailInput.value, passwordInput.value);
        showToast(`Authenticated: ${user.name} [${user.responderType || user.role.toUpperCase()}]`, 'success');
        renderApp();
      } catch (err) {
        authError.textContent = err.message;
        authError.classList.remove('hidden');
        if (passwordInput) passwordInput.value = '';
      }
    };
  }
}

/* ==========================================================================
   STUDENT / REPORTER VIEW
   ========================================================================== */
let selectedCategory = 'fire';

function renderStudentView() {
  renderCategoryPicker();
  renderCampusZones();
  bindMediaEvidenceHandlers();
  bindStudentForm();
  renderStudentActiveIncident();
  renderReporterSensorSimulator();
}

function renderCategoryPicker() {
  const container = document.getElementById('categoryGrid');
  if (!container) return;

  const categories = [
    { id: 'fire', label: 'Fire / Hazard', icon: '🔥' },
    { id: 'medical', label: 'Medical Emergency', icon: '🩺' },
    { id: 'harassment', label: 'Harassment / Safety', icon: '🛡️' },
    { id: 'accident', label: 'Accident / Collision', icon: '⚠️' },
    { id: 'general', label: 'Security / Other', icon: 'ℹ️' }
  ];

  container.innerHTML = categories.map(c => `
    <div class="category-card ${selectedCategory === c.id ? 'selected' : ''}" data-cat="${c.id}">
      <span class="category-icon">${c.icon}</span>
      <span class="category-name">${c.label}</span>
    </div>
  `).join('');

  container.querySelectorAll('.category-card').forEach(card => {
    card.onclick = () => {
      selectedCategory = card.getAttribute('data-cat');
      container.querySelectorAll('.category-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    };
  });
}

function renderCampusZones() {
  const container = document.getElementById('zonesGrid');
  const gpsBtn = document.getElementById('btnGpsLocation');
  const customDetailInput = document.getElementById('customRoomDetail');
  if (!container) return;

  const zones = window.state.getCampusZones();

  function drawZones(selectedId, gpsDetectedId = null) {
    container.innerHTML = zones.map(z => {
      const isSelected = z.id === selectedId;
      const isGps = z.id === gpsDetectedId;
      return `
        <div class="zone-card ${isSelected ? 'selected' : ''} ${isGps ? 'gps-detected' : ''}" data-zone-id="${z.id}">
          <span class="zone-icon">${z.icon}</span>
          <div class="zone-info">
            <div class="zone-title">${z.name}</div>
            <div class="zone-desc">${z.building} • ${z.floor}</div>
            ${isGps ? '<span class="gps-badge">📍 GPS Match</span>' : ''}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.zone-card').forEach(card => {
      card.onclick = () => {
        const zoneId = card.getAttribute('data-zone-id');
        window.locationManager.selectZone(zoneId);
        drawZones(zoneId, gpsDetectedId);
      };
    });
  }

  // Default selection if not set
  if (!window.locationManager.selectedZoneId) {
    window.locationManager.selectZone(zones[0].id);
  }
  drawZones(window.locationManager.selectedZoneId);

  // GPS Auto-detect button handler
  if (gpsBtn) {
    gpsBtn.onclick = () => {
      gpsBtn.classList.add('locating');
      gpsBtn.innerHTML = '⌛ Detecting Coordinates...';
      
      window.locationManager.detectUserLocation((nearestZone, distance, gpsCoords) => {
        gpsBtn.classList.remove('locating');
        gpsBtn.innerHTML = '📍 Use My Current Location';
        drawZones(nearestZone.id, nearestZone.id);
        showToast(`📍 GPS matched to nearest zone: ${nearestZone.name} (~${distance}m away)`, 'success');
      });
    };
  }

  if (customDetailInput) {
    customDetailInput.oninput = (e) => {
      window.locationManager.setCustomDetail(e.target.value);
    };
  }
}

/* ==========================================================================
   UNIVERSAL VOICE RECORDING & NATURAL HUMAN SPEECH SYNTHESIS
   ========================================================================== */
function bindMediaEvidenceHandlers() {
  // Voice Recording elements
  const btnStartVoice = document.getElementById('btnStartVoiceRecord');
  const btnStopVoice = document.getElementById('btnStopVoiceRecord');
  const btnDeleteVoice = document.getElementById('btnDeleteVoiceRecord');
  const btnPreviewRecordedVoice = document.getElementById('btnPreviewRecordedVoice');
  const voiceIdleState = document.getElementById('voiceIdleState');
  const voiceRecordingState = document.getElementById('voiceRecordingState');
  const voiceRecordedState = document.getElementById('voiceRecordedState');
  const voiceTimerEl = document.getElementById('voiceRecordingTimer');
  const voiceTranscriptPreview = document.getElementById('voiceTranscriptPreview');

  // Photo Attachment elements
  const btnBrowsePhoto = document.getElementById('btnBrowsePhoto');
  const photoFileInput = document.getElementById('photoFileInput');
  const btnRemovePhoto = document.getElementById('btnRemovePhoto');
  const photoIdleState = document.getElementById('photoIdleState');
  const photoAttachedState = document.getElementById('photoAttachedState');
  const attachedPhotoImg = document.getElementById('attachedPhotoImg');

  // Reset UI if no data
  if (!currentVoiceNote && voiceIdleState) {
    voiceIdleState.classList.remove('hidden');
    voiceRecordingState.classList.add('hidden');
    voiceRecordedState.classList.add('hidden');
  }

  if (!currentPhotoUrl && photoIdleState) {
    photoIdleState.classList.remove('hidden');
    photoAttachedState.classList.add('hidden');
  }

  // 1. Microphone Voice Note Recording
  if (btnStartVoice) {
    btnStartVoice.onclick = async () => {
      voiceSeconds = 0;
      voiceTimerEl.textContent = '00:00';
      voiceIdleState.classList.add('hidden');
      voiceRecordingState.classList.remove('hidden');
      voiceRecordedState.classList.add('hidden');

      // Start timer
      voiceTimerInterval = setInterval(() => {
        voiceSeconds++;
        const mins = String(Math.floor(voiceSeconds / 60)).padStart(2, '0');
        const secs = String(voiceSeconds % 60).padStart(2, '0');
        voiceTimerEl.textContent = `${mins}:${secs}`;
      }, 1000);

      // Start Real AudioContext Hardware Microphone Stream if supported
      recordedBuffers = [];
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          audioContext = new AudioCtx();
          const source = audioContext.createMediaStreamSource(mediaStream);
          
          scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            recordedBuffers.push(new Float32Array(inputData));
          };
          
          source.connect(scriptProcessor);
          scriptProcessor.connect(audioContext.destination);
          isSimulatingRecording = false;
        } else {
          isSimulatingRecording = true;
        }
      } catch (err) {
        console.warn('Microphone stream error/blocked on HTTP context. Using speech synthesis note:', err.message);
        isSimulatingRecording = true;
      }
    };
  }

  if (btnStopVoice) {
    btnStopVoice.onclick = () => {
      clearInterval(voiceTimerInterval);
      let wavDataUrl = '';

      if (!isSimulatingRecording && audioContext && recordedBuffers.length > 0) {
        if (scriptProcessor) scriptProcessor.disconnect();
        if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
        const sampleRate = audioContext.sampleRate || 44100;
        wavDataUrl = encodeWavBase64(recordedBuffers, sampleRate);
        try { audioContext.close(); } catch(e) {}
      } else {
        wavDataUrl = generateSimulatedVoiceWav(Math.max(voiceSeconds, 3));
      }

      const details = document.getElementById('emergencyDetails')?.value?.trim();
      const catLabel = selectedCategory.toUpperCase();
      const transcript = details ? `Spoken Emergency Alert (${catLabel}): ${details}` : `Urgent ${catLabel} situation reported on campus. Responders needed immediately at location.`;

      finishVoiceRecording(wavDataUrl, transcript, Math.max(voiceSeconds, 3));
    };
  }

  // 1-Click Spoken Voice Presets
  document.querySelectorAll('.voice-preset-chip').forEach(chip => {
    chip.onclick = () => {
      const voiceText = chip.getAttribute('data-voice');
      const wavDataUrl = generateSimulatedVoiceWav(3);
      finishVoiceRecording(wavDataUrl, voiceText, 3);
    };
  });

  function finishVoiceRecording(dataUrl, transcript, duration) {
    currentVoiceNote = {
      dataUrl: dataUrl,
      transcript: transcript,
      text: transcript,
      duration: duration,
      recordedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (voiceTranscriptPreview) {
      voiceTranscriptPreview.textContent = `🗣️ "${transcript}"`;
    }

    voiceIdleState.classList.add('hidden');
    voiceRecordingState.classList.add('hidden');
    voiceRecordedState.classList.remove('hidden');
    showToast(`🎙️ Spoken voice note ready (${duration}s)`, 'success');
  }

  if (btnPreviewRecordedVoice) {
    btnPreviewRecordedVoice.onclick = () => {
      if (currentVoiceNote) {
        window.playVoiceData(currentVoiceNote);
      }
    };
  }

  if (btnDeleteVoice) {
    btnDeleteVoice.onclick = () => {
      currentVoiceNote = null;
      if (voiceTranscriptPreview) voiceTranscriptPreview.textContent = '';
      voiceRecordedState.classList.add('hidden');
      voiceIdleState.classList.remove('hidden');
      showToast('Voice note removed', 'info');
    };
  }

  // 2. Photo Attachment & Presets
  if (btnBrowsePhoto && photoFileInput) {
    btnBrowsePhoto.onclick = () => photoFileInput.click();
    photoFileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setAttachedPhoto(event.target.result);
        };
        reader.readAsDataURL(file);
      }
    };
  }

  // 1-Click Preset Emergency Photo Samples
  document.querySelectorAll('.preset-chip:not(.voice-preset-chip)').forEach(btn => {
    btn.onclick = () => {
      const preset = btn.getAttribute('data-preset');
      const presetImg = generatePresetSvgPhoto(preset);
      setAttachedPhoto(presetImg);
    };
  });

  function setAttachedPhoto(dataUrl) {
    currentPhotoUrl = dataUrl;
    attachedPhotoImg.src = dataUrl;
    photoIdleState.classList.add('hidden');
    photoAttachedState.classList.remove('hidden');
    showToast('📸 Photo evidence attached', 'success');
  }

  if (btnRemovePhoto) {
    btnRemovePhoto.onclick = () => {
      currentPhotoUrl = null;
      attachedPhotoImg.src = '';
      if (photoFileInput) photoFileInput.value = '';
      photoAttachedState.classList.add('hidden');
      photoIdleState.classList.remove('hidden');
      showToast('Photo removed', 'info');
    };
  }
}

// Universal Standard 16-bit PCM WAV Base64 Data URL Encoder
function encodeWavBase64(audioBuffers, sampleRate = 44100) {
  let totalLength = 0;
  for (let i = 0; i < audioBuffers.length; i++) {
    totalLength += audioBuffers[i].length;
  }
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (let i = 0; i < audioBuffers.length; i++) {
    merged.set(audioBuffers[i], offset);
    offset += audioBuffers[i].length;
  }

  const buffer = new ArrayBuffer(44 + merged.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + merged.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); // 16-bit
  writeString(view, 36, 'data');
  view.setUint32(40, merged.length * 2, true);

  let index = 44;
  for (let i = 0; i < merged.length; i++) {
    let s = Math.max(-1, Math.min(1, merged[i]));
    view.setInt16(index, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    index += 2;
  }

  function writeString(v, off, str) {
    for (let j = 0; j < str.length; j++) {
      v.setUint8(off + j, str.charCodeAt(j));
    }
  }

  // Convert ArrayBuffer to pure Base64 string safely without stack limits
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 0x8000; // 32KB chunks
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}

// Generate Speech Harmonic Audio Note in pure Base64 WAV
function generateSimulatedVoiceWav(durationSec = 3) {
  const sampleRate = 16000;
  const numSamples = sampleRate * durationSec;
  const samples = new Float32Array(numSamples);
  
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const fundamental = 160 + Math.sin(t * 5) * 25;
    const f1 = 600;
    const f2 = 1200;
    const envelope = Math.sin((t / durationSec) * Math.PI);
    const val = (Math.sin(2 * Math.PI * fundamental * t) * 0.5 + 
                 Math.sin(2 * Math.PI * f1 * t) * 0.3 + 
                 Math.sin(2 * Math.PI * f2 * t) * 0.2) * envelope;
    samples[i] = val * 0.7;
  }
  return encodeWavBase64([samples], sampleRate);
}

// Universal Natural Human Voice Playback & Speech Synthesis Engine
window.playVoiceData = (rawUrlOrObj, incidentContext = null) => {
  let spokenText = '';
  let audioUrl = '';

  if (typeof rawUrlOrObj === 'object' && rawUrlOrObj !== null) {
    spokenText = rawUrlOrObj.transcript || rawUrlOrObj.text || '';
    audioUrl = rawUrlOrObj.dataUrl || rawUrlOrObj.url || '';
  } else if (typeof rawUrlOrObj === 'string') {
    if (rawUrlOrObj.startsWith('INC-')) {
      const inc = window.state.getIncidents().find(i => i.id === rawUrlOrObj);
      if (inc) {
        spokenText = inc.voiceNote?.transcript || inc.description || `Emergency alert at ${inc.location}`;
        audioUrl = inc.voiceNote?.dataUrl || inc.voiceNote;
      }
    } else if (rawUrlOrObj.startsWith('data:audio')) {
      audioUrl = rawUrlOrObj;
    } else {
      spokenText = rawUrlOrObj;
    }
  }

  if (!spokenText && incidentContext) {
    spokenText = typeof incidentContext === 'string' ? incidentContext : (incidentContext.description || incidentContext.location || '');
  }

  if (!spokenText) {
    spokenText = 'Attention responders: Emergency situation reported on campus. Immediate responder dispatch required.';
  }

  // 1. Natural Human Speech Synthesis (Speaks clear English voice aloud on any browser & network)
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(v => v.lang.includes('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Zira') || v.name.includes('David') || v.name.includes('Daniel')));
    if (englishVoice) utterance.voice = englishVoice;

    window.speechSynthesis.speak(utterance);
    showToast(`🗣️ Speaking: "${spokenText.substring(0, 50)}..."`, 'info');
  }

  // 2. Play Audio Stream if present
  if (audioUrl && typeof audioUrl === 'string' && audioUrl.startsWith('data:audio')) {
    try {
      const audio = new Audio();
      audio.src = audioUrl;
      audio.play().catch(e => {});
    } catch (e) {}
  }
};

// Generate realistic SVG image presets for instant 1-click photo testing
function generatePresetSvgPhoto(type) {
  let title = 'FIRE / SMOKE EVIDENCE';
  let color1 = '#dc2626';
  let color2 = '#7f1d1d';
  let icon = '🔥';
  let subtitle = 'Active Smoke & Flame Anomaly Detected';

  if (type === 'medical') {
    title = 'MEDICAL INCIDENT EVIDENCE';
    color1 = '#f59e0b';
    color2 = '#78350f';
    icon = '🩺';
    subtitle = 'Patient Requiring Immediate Stretcher Support';
  } else if (type === 'hazard') {
    title = 'STRUCTURAL HAZARD EVIDENCE';
    color1 = '#3b82f6';
    color2 = '#1e3a8a';
    icon = '⚠️';
    subtitle = 'Hazardous Spill & Physical Obstruction';
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="240" viewBox="0 0 400 240">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill="url(#grad)" rx="12"/>
      <rect x="15" y="15" width="370" height="210" fill="rgba(0,0,0,0.4)" rx="8" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
      <text x="200" y="70" font-size="40" text-anchor="middle">${icon}</text>
      <text x="200" y="115" font-family="sans-serif" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="1">${title}</text>
      <text x="200" y="145" font-family="sans-serif" font-size="12" fill="#cbd5e1" text-anchor="middle">${subtitle}</text>
      <rect x="80" y="170" width="240" height="28" fill="rgba(0,0,0,0.6)" rx="6"/>
      <text x="200" y="188" font-family="monospace" font-size="11" font-weight="bold" fill="#34d399" text-anchor="middle">LIVE ON-SCENE CAPTURE [VERIFIED]</text>
    </svg>
  `;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

window.openPhotoLightbox = (src) => {
  const modal = document.getElementById('imageLightboxModal');
  const img = document.getElementById('lightboxModalImg');
  if (modal && img) {
    img.src = src;
    modal.classList.remove('hidden');
  }
};

function bindStudentForm() {
  const form = document.getElementById('reportEmergencyForm');
  const detailsInput = document.getElementById('emergencyDetails');
  if (!form) return;

  form.onsubmit = (e) => {
    e.preventDefault();
    const reporter = window.authManager.getCurrentUser();
    const locationPayload = window.locationManager.getLocationPayload();

    const newIncident = window.alertManager.createReport({
      category: selectedCategory,
      locationPayload: locationPayload,
      details: detailsInput ? detailsInput.value.trim() : '',
      reporter: reporter,
      voiceNote: currentVoiceNote,
      photoUrl: currentPhotoUrl
    });

    showToast(`🚨 Emergency Alert ${newIncident.id} Dispatched!`, 'danger');
    
    // Clear inputs and attached media
    if (detailsInput) detailsInput.value = '';
    currentVoiceNote = null;
    currentPhotoUrl = null;
    bindMediaEvidenceHandlers();

    renderStudentActiveIncident();
    updateCampusWideFireBanner();
  };
}

function renderStudentActiveIncident() {
  const container = document.getElementById('studentActiveIncidentContainer');
  if (!container) return;

  const currentUser = window.authManager.getCurrentUser();
  if (!currentUser) return;

  const incidents = window.state.getIncidents();
  const myAlert = incidents.find(i => i.reportedBy?.id === currentUser.id && i.status !== 'Resolved');
  const activeCampusFire = incidents.find(i => i.category === 'fire' && i.status !== 'Resolved');

  const alertToDisplay = myAlert || activeCampusFire;

  if (!alertToDisplay) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🛡️</div>
        <h4>No Active Emergency</h4>
        <p>All campus sectors are secure. In case of an emergency, use the SOS form on the left.</p>
      </div>
    `;
    return;
  }

  const isCampusBroadcastFire = !myAlert && activeCampusFire;
  const catInfo = window.alertManager.getCategoryInfo(alertToDisplay.category);
  const isEscalated = alertToDisplay.escalated || alertToDisplay.status === 'Escalated';

  let pulseStatusHtml = '';
  if (alertToDisplay.status === 'Resolved') {
    pulseStatusHtml = `<div class="pulse-step resolved">✅ Incident Resolved</div>`;
  } else if (isEscalated) {
    pulseStatusHtml = `
      <div class="pulse-step passed">Pulse 1 (30s)</div>
      <div class="pulse-step passed">Pulse 2 (60s)</div>
      <div class="pulse-step escalated">🚨 Escalated to Admin & Backup</div>
    `;
  } else {
    pulseStatusHtml = `
      <div class="pulse-step ${alertToDisplay.pulseAttempt >= 1 ? (alertToDisplay.pulseAttempt === 1 ? 'active' : 'passed') : ''}">Pulse 1 (30s)</div>
      <div class="pulse-step ${alertToDisplay.pulseAttempt >= 2 ? (alertToDisplay.pulseAttempt === 2 ? 'active' : 'passed') : ''}">Pulse 2 (60s)</div>
      <div class="pulse-step ${alertToDisplay.pulseAttempt >= 3 ? (alertToDisplay.pulseAttempt === 3 ? 'active' : 'passed') : ''}">Pulse 3 (90s)</div>
    `;
  }

  const voiceTranscript = alertToDisplay.voiceNote?.transcript || alertToDisplay.voiceNote?.text || '';

  container.innerHTML = `
    <div class="glass-panel fade-in" style="${isCampusBroadcastFire ? 'border: 2px solid #ef4444; box-shadow: 0 0 20px rgba(239,68,68,0.4);' : ''}">
      <div class="panel-header">
        <div>
          <div class="panel-title">
            <span>${isCampusBroadcastFire ? '🔥 CAMPUS-WIDE FIRE ALERT' : '🚨 Your Emergency Status'}</span>
            <span class="badge badge-${alertToDisplay.category}">${alertToDisplay.categoryLabel}</span>
          </div>
          <div class="panel-subtitle">ID: <strong>${alertToDisplay.id}</strong> • Location: <strong>${alertToDisplay.location}</strong></div>
        </div>
        <span class="badge badge-status-${alertToDisplay.status.toLowerCase()}">${alertToDisplay.status}</span>
      </div>

      <!-- Category Instant Auto-Response Message -->
      <div class="auto-response-card ${catInfo.theme}">
        <div class="auto-response-header">
          <span>${catInfo.icon} ${isCampusBroadcastFire ? 'Active Evacuation Notice' : 'Immediate Action Required'}</span>
        </div>
        <div class="auto-response-text">${alertToDisplay.autoResponseText || catInfo.autoResponse}</div>
        <div class="auto-response-hotline">
          ${catInfo.hotlines.map(h => `
            <a href="tel:${h.number}" class="hotline-chip">📞 ${h.name}: <strong>${h.number}</strong></a>
          `).join('')}
        </div>
      </div>

      <!-- Attached Multimedia Evidence in Active Status -->
      ${alertToDisplay.voiceNote || alertToDisplay.photoUrl ? `
        <div class="incident-media-box">
          ${alertToDisplay.voiceNote ? `
            <div>
              <div class="media-evidence-header" style="display:flex; justify-content:space-between; align-items:center;">
                <span>🎙️ Attached Voice Note:</span>
                <button type="button" class="btn btn-primary btn-sm" style="padding:2px 8px; font-size:0.75rem; font-weight:700;" onclick="playVoiceData('${alertToDisplay.id}')">
                  🔊 Listen Voice
                </button>
              </div>
              ${voiceTranscript ? `<div style="font-size:0.75rem; color:#cbd5e1; font-style:italic; background:rgba(0,0,0,0.3); padding:4px 8px; border-radius:4px; margin-top:4px;">"${voiceTranscript}"</div>` : ''}
            </div>
          ` : ''}
          ${alertToDisplay.photoUrl ? `
            <div style="margin-top:6px;">
              <div class="media-evidence-header">📸 Attached Picture Evidence (Tap to view):</div>
              <img src="${alertToDisplay.photoUrl}" class="incident-photo-thumbnail" onclick="openPhotoLightbox('${alertToDisplay.photoUrl}')" alt="Photo Evidence" style="margin-top:4px;">
            </div>
          ` : ''}
        </div>
      ` : ''}

      <!-- Pulse Escalation Progress -->
      <div class="escalation-tracker">
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; font-weight:700;">
          <span>Responder Dispatch Status</span>
          <span>${alertToDisplay.status === 'Resolved' ? 'Completed' : (isEscalated ? '🚨 Backup Active' : `Attempt ${alertToDisplay.pulseAttempt || 1}/3`)}</span>
        </div>
        <div class="pulse-attempts-bar">
          ${pulseStatusHtml}
        </div>
        ${isEscalated ? `
          <div class="escalation-banner">
            <span>⚠️</span>
            <div>
              <strong>Escalated to Admin:</strong>
              <div>No initial responder picked up within 90s. Alert auto-forwarded to Chief Campus Administrator & Senior Security Backup.</div>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Live Timeline -->
      <div style="margin-top:16px;">
        <h5 style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.04em;">Activity Timeline</h5>
        <div style="display:flex; flex-direction:column; gap:8px; max-height:160px; overflow-y:auto;">
          ${alertToDisplay.timeline ? alertToDisplay.timeline.map(t => `
            <div style="font-size:0.8rem; padding:8px 12px; background:var(--bg-secondary); border-radius:var(--radius-sm); border-left:3px solid var(--blue-500);">
              <span style="font-family:var(--font-mono); color:var(--text-muted); font-size:0.75rem;">[${t.time}]</span>
              <strong style="margin: 0 4px; color:#fff;">${t.status}:</strong>
              <span style="color:var(--text-secondary);">${t.note}</span>
            </div>
          `).join('') : ''}
        </div>
      </div>
    </div>
  `;
}

function renderReporterSensorSimulator() {
  const select = document.getElementById('reporterSensorSelect');
  const triggerBtn = document.getElementById('btnReporterTriggerSensor');
  if (!select || !triggerBtn) return;

  const sensors = window.sensorManager.getAllSensors();
  select.innerHTML = sensors.map(s => `
    <option value="${s.id}">${s.id} — ${s.type} (${s.zone})</option>
  `).join('');

  triggerBtn.onclick = () => {
    const sensorId = select.value;
    try {
      const alert = window.sensorManager.triggerSensorSimulation(sensorId);
      showToast(`🔥 Sensor ${alert.sensorId} Triggered Alert ${alert.id}!`, 'danger');
      renderStudentActiveIncident();
      updateCampusWideFireBanner();
    } catch (e) {
      showToast(e.message, 'danger');
    }
  };
}

/* ==========================================================================
   RESPONDER VIEW (With Natural Voice Note Player & GPS Map)
   ========================================================================== */
function renderResponderView() {
  const feed = document.getElementById('responderIncidentFeed');
  const activeCountEl = document.getElementById('responderActiveCount');
  const escalationCountEl = document.getElementById('responderEscalatedCount');
  const dutyUnitBadge = document.getElementById('responderDutyUnitBadge');
  if (!feed) return;

  const currentUser = window.authManager.getCurrentUser();
  if (!currentUser) return;

  const routing = window.state.getDepartmentRouting();
  const responderType = currentUser.responderType || 'Security';
  const allowedCategories = routing[responderType] || ['fire'];

  const UNIT_CONFIG = {
    'Fire Warden': {
      icon: '🔥',
      title: 'Fire & Safety Warden Unit',
      categoryDesc: 'Fire / Smoke Hazard',
      badgeClass: 'badge-fire'
    },
    'Medical': {
      icon: '🩺',
      title: 'Campus Medical Bay',
      categoryDesc: 'Medical Emergency',
      badgeClass: 'badge-medical'
    },
    'Safety Cell': {
      icon: '🛡️',
      title: "Women's Safety & Counseling Cell",
      categoryDesc: 'Harassment & Safety Threats',
      badgeClass: 'badge-harassment'
    },
    'Accident Response': {
      icon: '⚠️',
      title: 'Emergency Trauma & Road Patrol',
      categoryDesc: 'Accident & Collision',
      badgeClass: 'badge-accident'
    },
    'Security': {
      icon: '🚨',
      title: 'Campus Security & Control Desk',
      categoryDesc: 'General Security Assistance',
      badgeClass: 'badge-general'
    }
  };

  const currentUnit = UNIT_CONFIG[responderType] || {
    icon: '🛡️',
    title: `${responderType} Unit`,
    categoryDesc: allowedCategories.join(', '),
    badgeClass: 'badge-general'
  };

  if (dutyUnitBadge) {
    dutyUnitBadge.innerHTML = `
      <span>${currentUnit.icon} <strong>${currentUnit.title}</strong> (Receiving: <u>${currentUnit.categoryDesc}</u> only)</span>
    `;
  }

  // Filter incidents strictly to this responder's own category
  const allIncidents = window.state.getIncidents();
  const routedIncidents = allIncidents.filter(inc => allowedCategories.includes(inc.category));

  const activeIncidents = routedIncidents.filter(i => i.status !== 'Resolved');
  const escalatedIncidents = routedIncidents.filter(i => i.escalated || i.status === 'Escalated');

  if (activeCountEl) activeCountEl.textContent = activeIncidents.length;
  if (escalationCountEl) escalationCountEl.textContent = escalatedIncidents.length;

  if (routedIncidents.length === 0) {
    feed.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${currentUnit.icon}</div>
        <h4>No Active ${currentUnit.categoryDesc} Alerts</h4>
        <p>Your unit terminal (<strong>${currentUser.name}</strong>) is online and standing by. Alerts for other departments are routed to their respective responder terminals.</p>
      </div>
    `;
    return;
  }

  feed.innerHTML = routedIncidents.map(inc => {
    const isEscalated = inc.escalated || inc.status === 'Escalated';
    const isResolved = inc.status === 'Resolved';
    const catInfo = window.alertManager.getCategoryInfo(inc.category);
    const voiceTranscript = inc.voiceNote?.transcript || inc.voiceNote?.text || '';

    return `
      <div class="incident-card ${isEscalated ? 'escalated' : (inc.category === 'fire' ? 'priority-high' : 'priority-medium')} fade-in" id="inc-card-${inc.id}">
        
        <!-- PROMINENT & CLICKABLE LOCATION DISPATCH HEADER (Tap to open Map) -->
        <div class="responder-location-banner clickable" onclick="openCampusMapModal('${inc.id}')" title="Touch / Click to inspect pinned location on live Campus Tactical Map">
          <div class="loc-banner-primary">
            <span class="loc-pin">📍</span>
            <div class="loc-details-wrap">
              <div class="loc-zone-title">${inc.zoneName || inc.location}</div>
              <div class="loc-building-floor">🏢 ${inc.building || 'Campus Zone'} • Floor: <strong>${inc.floor || 'Ground'}</strong></div>
            </div>
          </div>
          ${inc.customDetail ? `
            <div class="loc-custom-callout">
              <span class="callout-icon">🎯</span>
              <span class="callout-text"><strong>Room / Landmark:</strong> ${inc.customDetail}</span>
            </div>
          ` : ''}
          <div class="loc-bottom-row">
            ${inc.gpsCoords ? `
              <div class="loc-gps-badge">
                <span>🛰️ GPS: <strong>${inc.gpsCoords.lat.toFixed(4)}° N, ${inc.gpsCoords.lng.toFixed(4)}° E</strong> (±${inc.gpsCoords.accuracy || 5}m accuracy)</span>
              </div>
            ` : '<div></div>'}
            <div class="loc-touch-cta">
              <span>🗺️ Touch to View on Campus Map & GPS Route ↗</span>
            </div>
          </div>
        </div>

        <div class="incident-header">
          <div class="incident-badge-group">
            <span class="badge badge-${inc.category}">${catInfo.icon} ${inc.categoryLabel}</span>
            <span class="badge badge-status-${inc.status.toLowerCase()}">${inc.status}</span>
            ${isEscalated ? '<span class="badge badge-status-escalated">⚠️ ESCALATED TO ADMIN</span>' : ''}
            ${inc.sensorId ? `<span class="badge badge-sensor">📡 SENSOR: ${inc.sensorId}</span>` : ''}
            ${inc.voiceNote ? '<span class="badge" style="background:rgba(239,68,68,0.2); color:#fca5a5; border:1px solid rgba(239,68,68,0.4);">🎙️ Voice Note</span>' : ''}
            ${inc.photoUrl ? '<span class="badge" style="background:rgba(59,130,246,0.2); color:#93c5fd; border:1px solid rgba(59,130,246,0.4);">📸 Photo</span>' : ''}
          </div>
          <span class="incident-time">${new Date(inc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>

        <div class="incident-body">
          <div class="incident-desc">${inc.description}</div>

          <!-- Multimedia Evidence Box (Voice Note Audio Player & Photo Thumbnail) -->
          ${inc.voiceNote || inc.photoUrl ? `
            <div class="incident-media-box">
              ${inc.voiceNote ? `
                <div>
                  <div class="media-evidence-header" style="display:flex; justify-content:space-between; align-items:center;">
                    <span>🎙️ Attached Voice Note (${inc.voiceNote.duration || 3}s):</span>
                    <button type="button" class="btn btn-primary btn-sm" style="padding:3px 10px; font-size:0.75rem; font-weight:700;" onclick="playVoiceData('${inc.id}')">
                      🔊 Listen Spoken Voice
                    </button>
                  </div>
                  ${voiceTranscript ? `<div style="font-size:0.75rem; color:#cbd5e1; font-style:italic; background:rgba(0,0,0,0.3); padding:4px 8px; border-radius:4px; margin-top:4px;">"${voiceTranscript}"</div>` : ''}
                </div>
              ` : ''}

              ${inc.photoUrl ? `
                <div style="margin-top:6px;">
                  <div class="media-evidence-header">📸 Attached Photo Evidence (Click to enlarge):</div>
                  <img src="${inc.photoUrl}" class="incident-photo-thumbnail" onclick="openPhotoLightbox('${inc.photoUrl}')" alt="Photo Evidence" style="margin-top:4px;">
                </div>
              ` : ''}
            </div>
          ` : ''}

          <div class="incident-meta">
            <span>👤 Reporter: <strong>${inc.reportedBy?.name || 'Anonymous'}</strong> (${inc.reportedBy?.role || 'Student'})</span>
            <span>📞 Contact: <strong>${inc.reportedBy?.phone || 'N/A'}</strong></span>
            ${inc.assignedTo ? `<span>🛡️ Assigned: <strong>${inc.assignedTo.name}</strong></span>` : ''}
          </div>
        </div>

        <!-- 30s Pulse Cycle Progress -->
        ${!isResolved ? `
          <div class="pulse-attempts-bar" style="margin: 10px 0;">
            <div class="pulse-step ${inc.pulseAttempt >= 1 ? (inc.pulseAttempt === 1 ? 'active' : 'passed') : ''}">Pulse 1 (0-30s)</div>
            <div class="pulse-step ${inc.pulseAttempt >= 2 ? (inc.pulseAttempt === 2 ? 'active' : 'passed') : ''}">Pulse 2 (30-60s)</div>
            <div class="pulse-step ${inc.pulseAttempt >= 3 ? (inc.pulseAttempt === 3 ? 'active' : 'passed') : ''}">Pulse 3 (60-90s)</div>
            ${isEscalated ? '<div class="pulse-step escalated">🚨 ADMIN BACKUP DISPATCHED</div>' : ''}
          </div>
        ` : ''}

        <div class="incident-actions">
          <!-- View Map and Route Button -->
          <button class="btn btn-secondary btn-sm" onclick="openCampusMapModal('${inc.id}')" style="background:#1e293b; border-color:#38bdf8; color:#38bdf8;">
            🗺️ View Map & Route
          </button>

          ${inc.status === 'Reported' || inc.status === 'Escalated' ? `
            <button class="btn btn-primary btn-sm" onclick="responderAcknowledge('${inc.id}')">
              ✋ Acknowledge Alert
            </button>
          ` : ''}

          ${inc.status === 'Acknowledged' ? `
            <button class="btn btn-warning btn-sm" onclick="responderUpdateStatus('${inc.id}', 'En Route')">
              🏃 Mark En Route
            </button>
          ` : ''}

          ${inc.status === 'En Route' ? `
            <button class="btn btn-warning btn-sm" onclick="responderUpdateStatus('${inc.id}', 'On Scene')">
              🎯 Arrived On Scene
            </button>
          ` : ''}

          ${inc.status !== 'Resolved' ? `
            <button class="btn btn-success btn-sm" onclick="responderUpdateStatus('${inc.id}', 'Resolved')">
              ✅ Mark Resolved
            </button>
          ` : `
            <span style="font-size:0.8rem; color:var(--emerald-500); font-weight:700;">✅ Resolved at ${new Date(inc.resolvedAt || inc.createdAt).toLocaleTimeString()}</span>
          `}
        </div>
      </div>
    `;
  }).join('');
}

window.responderAcknowledge = (incidentId) => {
  const responder = window.authManager.getCurrentUser();
  window.alertManager.acknowledgeIncident(incidentId, responder);
  showToast(`Incident ${incidentId} acknowledged! Escalation paused.`, 'success');
  renderResponderView();
};

window.responderUpdateStatus = (incidentId, newStatus) => {
  const responder = window.authManager.getCurrentUser();
  window.alertManager.updateStatus(incidentId, newStatus, responder);
  showToast(`Incident ${incidentId} updated to: ${newStatus}`, 'info');
  renderResponderView();
  updateCampusWideFireBanner();
};

/* ==========================================================================
   INTERACTIVE CAMPUS TACTICAL MAP & GPS MODAL ENGINE
   ========================================================================== */
window.openCampusMapModal = (incidentId) => {
  const modal = document.getElementById('campusMapModal');
  const incidents = window.state.getIncidents();
  const inc = incidents.find(i => i.id === incidentId);
  if (!modal || !inc) return;

  const currentUser = window.authManager.getCurrentUser();

  // Populate Destination Info
  document.getElementById('mapTargetZoneName').textContent = inc.zoneName || inc.location;
  document.getElementById('mapTargetBuildingFloor').textContent = `🏢 ${inc.building || 'Academic Complex'} • Floor: ${inc.floor || 'Ground Floor'}`;
  
  const roomEl = document.getElementById('mapTargetRoomDetail');
  if (inc.customDetail) {
    roomEl.textContent = `🎯 Pinned Landmark: ${inc.customDetail}`;
    roomEl.classList.remove('hidden');
  } else {
    roomEl.textContent = '🎯 Pinned Sector: Standard Zone Entrance';
  }

  const gpsCoords = inc.gpsCoords || { lat: 12.9716, lng: 77.5946, accuracy: 5 };
  document.getElementById('mapTargetGpsCoords').textContent = `🛰️ GPS: ${gpsCoords.lat.toFixed(4)}° N, ${gpsCoords.lng.toFixed(4)}° E (±${gpsCoords.accuracy || 5}m accuracy)`;

  // External Google Maps direct navigation link
  const googleMapsBtn = document.getElementById('btnExternalGoogleMaps');
  if (googleMapsBtn) {
    googleMapsBtn.href = `https://www.google.com/maps/search/?api=1&query=${gpsCoords.lat},${gpsCoords.lng}`;
  }

  // Calculate Walking Route & ETA
  const responderType = currentUser ? currentUser.responderType : 'Security';
  const baseStations = {
    'Fire Warden': { name: 'Fire Station & North Hub', x: 480, y: 50, dist: 160, eta: '1.8 mins' },
    'Medical': { name: 'Campus Health Center', x: 80, y: 280, dist: 140, eta: '1.5 mins' },
    'Safety Cell': { name: 'Counseling & Safety Cell', x: 340, y: 200, dist: 110, eta: '1.2 mins' },
    'Accident Response': { name: 'Trauma Patrol Post', x: 260, y: 340, dist: 190, eta: '2.2 mins' },
    'Security': { name: 'Main Security Gate', x: 240, y: 300, dist: 150, eta: '1.6 mins' }
  };

  const currentBase = baseStations[responderType] || baseStations.Security;
  document.getElementById('mapDistanceVal').textContent = `${currentBase.dist} m`;
  document.getElementById('mapEtaVal').textContent = currentBase.eta;

  // Turn-by-Turn Guidance Steps
  const guidanceContainer = document.getElementById('mapGuidanceList');
  if (guidanceContainer) {
    guidanceContainer.innerHTML = `
      <div class="guidance-step">1. 🏁 Depart <strong>${currentBase.name}</strong></div>
      <div class="guidance-step">2. 🚶 Proceed along Central Walkway towards <strong>${inc.building || 'Target Block'}</strong></div>
      <div class="guidance-step">3. 🚪 Enter main entrance → proceed to <strong>${inc.floor || 'Ground Floor'}</strong></div>
      <div class="guidance-step">4. 🎯 Arrive at <strong>${inc.customDetail || inc.zoneName || 'Emergency Location'}</strong></div>
    `;
  }

  // Nearby Emergency Assets
  const facilitiesContainer = document.getElementById('mapNearbyFacilities');
  if (facilitiesContainer) {
    facilitiesContainer.innerHTML = `
      <div><strong>🛡️ Nearby Safety Assets:</strong></div>
      <div>🧯 Fire Extinguisher: 12m (Corridor Wall)</div>
      <div>🏥 First Aid / AED Kit: 24m (Ground Floor Lobby)</div>
      <div>🚪 Emergency Exit Stairwell: West Door (15m)</div>
    `;
  }

  // Accept Dispatch button inside map
  const acceptBtn = document.getElementById('btnMapAcceptDispatch');
  if (acceptBtn) {
    if (inc.status === 'Resolved') {
      acceptBtn.disabled = true;
      acceptBtn.textContent = '✅ Incident Already Resolved';
    } else {
      acceptBtn.disabled = false;
      acceptBtn.textContent = '🏃 Mark En Route to This Location';
      acceptBtn.onclick = () => {
        responderUpdateStatus(inc.id, 'En Route');
        closeModal('campusMapModal');
      };
    }
  }

  modal.classList.remove('hidden');

  // Start animated tactical canvas render
  startTacticalMapAnimation(inc, currentBase);
};

function startTacticalMapAnimation(incident, baseStation) {
  const canvas = document.getElementById('campusTacticalMapCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (mapAnimationId) cancelAnimationFrame(mapAnimationId);

  const zoneCoords = {
    'z1': { x: 230, y: 150, name: 'Library' },
    'z2': { x: 420, y: 110, name: 'Hostel A' },
    'z3': { x: 430, y: 240, name: 'Hostel B' },
    'z4': { x: 230, y: 280, name: 'Canteen' },
    'z5': { x: 90, y: 140, name: 'Tech Hub' },
    'z6': { x: 330, y: 290, name: 'Auditorium' },
    'z7': { x: 80, y: 280, name: 'Sick Room' },
    'z8': { x: 320, y: 90, name: 'Science Block' },
    'z9': { x: 480, y: 320, name: 'Sports Complex' },
    'z10': { x: 330, y: 190, name: 'Admin Block' }
  };

  const targetPoint = zoneCoords[incident.zoneId] || { x: 230, y: 150, name: incident.zoneName || 'Emergency' };

  function renderMapFrame() {
    mapRadarAngle += 0.03;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Dark Grid Pattern
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // 2. Campus Walkways & Roads
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(40, 70); ctx.lineTo(540, 70); // North Road
    ctx.moveTo(40, 330); ctx.lineTo(540, 330); // South Road
    ctx.moveTo(230, 40); ctx.lineTo(230, 360); // Central Corridor
    ctx.moveTo(430, 40); ctx.lineTo(430, 360); // East Corridor
    ctx.moveTo(90, 40); ctx.lineTo(90, 360); // West Corridor
    ctx.stroke();

    // 3. Buildings Blocks
    const buildings = [
      { x: 170, y: 110, w: 120, h: 80, name: 'Academic Block A (Library)', icon: '📚' },
      { x: 370, y: 70, w: 110, h: 70, name: 'Hostel Block A', icon: '🏢' },
      { x: 370, y: 200, w: 110, h: 75, name: 'Hostel Block B', icon: '🏢' },
      { x: 170, y: 240, w: 110, h: 65, name: 'Main Canteen', icon: '☕' },
      { x: 40, y: 100, w: 90, h: 70, name: 'Tech Hub / Labs', icon: '💻' },
      { x: 40, y: 240, w: 90, h: 65, name: 'Health Medical Bay', icon: '🏥' },
      { x: 290, y: 160, w: 80, h: 55, name: 'Admin Block', icon: '🏛️' },
      { x: 280, y: 260, w: 95, h: 55, name: 'Auditorium', icon: '🎭' }
    ];

    buildings.forEach(b => {
      ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${b.icon} ${b.name}`, b.x + b.w / 2, b.y + b.h / 2 + 4);
    });

    // 4. Draw Animated Walking Route Line (Cyan Dashes)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -mapRadarAngle * 15;
    ctx.beginPath();
    ctx.moveTo(baseStation.x, baseStation.y);
    ctx.lineTo(baseStation.x, targetPoint.y);
    ctx.lineTo(targetPoint.x, targetPoint.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 5. Draw Responder Base Station Pin 🛡️
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(baseStation.x, baseStation.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🛡️ YOU (BASE)', baseStation.x, baseStation.y - 12);

    // 6. Draw Pulsing Radar Circle & Incident Target Pin 🎯
    const pulseRadius = 12 + Math.sin(mapRadarAngle * 3) * 6;
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(targetPoint.x, targetPoint.y, pulseRadius * 1.8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(targetPoint.x, targetPoint.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#fca5a5';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`🚨 TARGET: ${incident.zoneName || 'Sector'}`, targetPoint.x, targetPoint.y + 22);

    mapAnimationId = requestAnimationFrame(renderMapFrame);
  }

  renderMapFrame();
}

/* ==========================================================================
   ADMIN VIEW (Admin can oversee ALL incidents across ALL departments)
   ========================================================================== */
let currentAdminTab = 'command';

function renderAdminView() {
  bindAdminTabs();
  renderAdminStats();

  if (currentAdminTab === 'command') {
    renderAdminCommandCenter();
  } else if (currentAdminTab === 'sensors') {
    renderAdminSensorRegistry();
  } else if (currentAdminTab === 'directory') {
    renderAdminDirectory();
  } else if (currentAdminTab === 'logs') {
    renderAdminLogs();
  }
}

function bindAdminTabs() {
  const tabs = document.querySelectorAll('.admin-tabs .tab-btn');
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentAdminTab = tab.getAttribute('data-tab');

      document.querySelectorAll('.admin-tab-pane').forEach(pane => pane.classList.add('hidden'));
      const activePane = document.getElementById(`tab-pane-${currentAdminTab}`);
      if (activePane) activePane.classList.remove('hidden');

      renderAdminView();
    };
  });
}

function renderAdminStats() {
  const incidents = window.state.getIncidents();
  const sensors = window.sensorManager.getAllSensors();
  const directory = window.directoryManager.getAllRecords();

  const activeInc = incidents.filter(i => i.status !== 'Resolved').length;
  const escalatedInc = incidents.filter(i => i.escalated || i.status === 'Escalated').length;

  document.getElementById('statActiveIncidents').textContent = activeInc;
  document.getElementById('statEscalatedIncidents').textContent = escalatedInc;
  document.getElementById('statTotalSensors').textContent = sensors.length;
  document.getElementById('statDirectoryTotal').textContent = directory.length;
}

function renderAdminCommandCenter() {
  const container = document.getElementById('adminIncidentsTableBody');
  if (!container) return;

  const incidents = window.state.getIncidents();

  if (incidents.length === 0) {
    container.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">No incidents recorded.</td></tr>`;
    return;
  }

  container.innerHTML = incidents.map(inc => {
    return `
      <tr>
        <td><strong>${inc.id}</strong></td>
        <td><span class="badge badge-${inc.category}">${inc.categoryLabel}</span></td>
        <td>
          <span style="cursor:pointer; color:#38bdf8; text-decoration:underline;" onclick="openCampusMapModal('${inc.id}')" title="View on Campus Map">
            📍 ${inc.zoneName || inc.location}
          </span>
        </td>
        <td>${inc.reportedBy?.name || 'Sensor'}</td>
        <td>
          <div style="display:flex; gap:4px; align-items:center;">
            ${inc.voiceNote ? `<button class="btn btn-sm btn-primary" style="padding:2px 6px; font-size:0.75rem; font-weight:700;" title="Listen Voice Note" onclick="playVoiceData('${inc.id}')">🔊 Listen</button>` : ''}
            ${inc.photoUrl ? `<button class="btn btn-sm btn-secondary" style="padding:2px 6px; font-size:0.75rem;" title="View Photo Evidence" onclick="openPhotoLightbox('${inc.photoUrl}')">📸 Photo</button>` : ''}
            ${!inc.voiceNote && !inc.photoUrl ? '<span style="color:var(--text-muted); font-size:0.75rem;">Text only</span>' : ''}
          </div>
        </td>
        <td><span class="badge badge-status-${inc.status.toLowerCase()}">${inc.status}</span></td>
        <td>
          ${inc.status !== 'Resolved' ? `
            <button class="btn btn-success btn-sm" onclick="responderUpdateStatus('${inc.id}', 'Resolved')">Resolve</button>
          ` : 'Resolved'}
        </td>
      </tr>
    `;
  }).join('');
}

/* Sensor Registry */
function renderAdminSensorRegistry() {
  const tableBody = document.getElementById('sensorsTableBody');
  const triggerSelect = document.getElementById('adminSimSensorSelect');
  const triggerBtn = document.getElementById('btnAdminSimTrigger');
  const addSensorBtn = document.getElementById('btnAddSensor');
  if (!tableBody) return;

  const sensors = window.sensorManager.getAllSensors();

  if (triggerSelect) {
    triggerSelect.innerHTML = sensors.map(s => `
      <option value="${s.id}">${s.id} — ${s.type} (${s.zone})</option>
    `).join('');
  }

  if (triggerBtn) {
    triggerBtn.onclick = () => {
      const sensorId = triggerSelect.value;
      try {
        const alert = window.sensorManager.triggerSensorSimulation(sensorId);
        showToast(`🚨 Sensor ${alert.sensorId} Triggered! Created ${alert.id}`, 'danger');
        renderAdminView();
        updateCampusWideFireBanner();
      } catch (e) {
        showToast(e.message, 'danger');
      }
    };
  }

  if (addSensorBtn) {
    addSensorBtn.onclick = () => openSensorModal();
  }

  if (sensors.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">No sensors registered.</td></tr>`;
    return;
  }

  tableBody.innerHTML = sensors.map(s => `
    <tr>
      <td><strong style="font-family:var(--font-mono); color:#38bdf8;">${s.id}</strong></td>
      <td><span class="badge badge-sensor">${s.type}</span></td>
      <td>📍 ${s.zone}</td>
      <td><span class="badge badge-status-resolved">${s.status}</span></td>
      <td>
        <div class="table-actions">
          <button class="btn btn-secondary btn-sm" onclick="openSensorModal('${s.id}')">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSensorRecord('${s.id}')">🗑️ Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

window.deleteSensorRecord = (id) => {
  if (confirm(`Are you sure you want to delete sensor ${id}?`)) {
    window.sensorManager.deleteSensor(id);
    showToast(`Sensor ${id} deleted`, 'info');
    renderAdminSensorRegistry();
    renderAdminStats();
    updateCampusWideFireBanner();
  }
};

function openSensorModal(sensorId = null) {
  const modal = document.getElementById('sensorModal');
  const title = document.getElementById('sensorModalTitle');
  const form = document.getElementById('sensorModalForm');
  const idInput = document.getElementById('sensorInputId');
  const typeInput = document.getElementById('sensorInputType');
  const zoneSelect = document.getElementById('sensorInputZone');
  const statusSelect = document.getElementById('sensorInputStatus');

  const zones = window.state.getCampusZones();
  zoneSelect.innerHTML = zones.map(z => `<option value="${z.name}">${z.name}</option>`).join('');

  if (sensorId) {
    const s = window.sensorManager.getSensorById(sensorId);
    title.textContent = `Edit Sensor: ${sensorId}`;
    idInput.value = s.id;
    idInput.disabled = true;
    typeInput.value = s.type;
    zoneSelect.value = s.zone;
    statusSelect.value = s.status;
  } else {
    title.textContent = 'Add New IoT Campus Sensor';
    idInput.value = 'FIRE-' + Math.floor(100 + Math.random() * 900);
    idInput.disabled = false;
    typeInput.value = 'Fire/Smoke';
    zoneSelect.value = zones[0].name;
    statusSelect.value = 'Active';
  }

  modal.classList.remove('hidden');

  form.onsubmit = (e) => {
    e.preventDefault();
    try {
      if (sensorId) {
        window.sensorManager.updateSensor(sensorId, {
          type: typeInput.value,
          zone: zoneSelect.value,
          status: statusSelect.value
        });
        showToast(`Sensor ${sensorId} updated`, 'success');
      } else {
        window.sensorManager.addSensor({
          id: idInput.value,
          type: typeInput.value,
          zone: zoneSelect.value,
          status: statusSelect.value
        });
        showToast(`Sensor ${idInput.value} registered successfully!`, 'success');
      }
      modal.classList.add('hidden');
      renderAdminSensorRegistry();
      renderAdminStats();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };
}

/* Student & Staff Directory Management */
function renderAdminDirectory() {
  const tableBody = document.getElementById('directoryTableBody');
  const searchInput = document.getElementById('directorySearchInput');
  const roleFilter = document.getElementById('directoryRoleFilter');
  const addRecordBtn = document.getElementById('btnAddDirectoryRecord');
  if (!tableBody) return;

  function drawDirectory() {
    const query = searchInput ? searchInput.value : '';
    const role = roleFilter ? roleFilter.value : 'all';
    const records = window.directoryManager.filterRecords(query, role);

    if (records.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">No records found.</td></tr>`;
      return;
    }

    tableBody.innerHTML = records.map(r => `
      <tr>
        <td><strong style="font-family:var(--font-mono);">${r.id}</strong></td>
        <td><strong>${r.name}</strong></td>
        <td><span class="role-pill ${r.role.toLowerCase()}">${r.role}</span></td>
        <td>${r.department}</td>
        <td><span style="font-family:var(--font-mono);">${r.phone}</span></td>
        <td>
          <div class="table-actions">
            <button class="btn btn-secondary btn-sm" onclick="openDirectoryModal('${r.id}')">✏️ Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteDirectoryRecord('${r.id}')">🗑️ Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  if (searchInput) searchInput.oninput = () => drawDirectory();
  if (roleFilter) roleFilter.onchange = () => drawDirectory();
  if (addRecordBtn) addRecordBtn.onclick = () => openDirectoryModal();

  drawDirectory();
}

window.deleteDirectoryRecord = (id) => {
  if (confirm(`Delete directory record for ID ${id}?`)) {
    window.directoryManager.deleteRecord(id);
    showToast(`Directory record ${id} removed`, 'info');
    renderAdminDirectory();
    renderAdminStats();
  }
};

function openDirectoryModal(recordId = null) {
  const modal = document.getElementById('directoryModal');
  const title = document.getElementById('directoryModalTitle');
  const form = document.getElementById('directoryModalForm');
  const idInput = document.getElementById('dirInputId');
  const nameInput = document.getElementById('dirInputName');
  const roleSelect = document.getElementById('dirInputRole');
  const deptInput = document.getElementById('dirInputDept');
  const phoneInput = document.getElementById('dirInputPhone');

  if (recordId) {
    const r = window.directoryManager.getRecordById(recordId);
    title.textContent = `Edit Record: ${recordId}`;
    idInput.value = r.id;
    idInput.disabled = true;
    nameInput.value = r.name;
    roleSelect.value = r.role;
    deptInput.value = r.department;
    phoneInput.value = r.phone;
  } else {
    title.textContent = 'Add New Student / Staff Member';
    idInput.value = 'STU-2025-' + Math.floor(100 + Math.random() * 900);
    idInput.disabled = false;
    nameInput.value = '';
    roleSelect.value = 'Student';
    deptInput.value = 'Computer Science';
    phoneInput.value = '+91 98450 ' + Math.floor(10000 + Math.random() * 90000);
  }

  modal.classList.remove('hidden');

  form.onsubmit = (e) => {
    e.preventDefault();
    try {
      if (recordId) {
        window.directoryManager.updateRecord(recordId, {
          name: nameInput.value,
          role: roleSelect.value,
          department: deptInput.value,
          phone: phoneInput.value
        });
        showToast(`Record ${recordId} updated`, 'success');
      } else {
        window.directoryManager.addRecord({
          id: idInput.value,
          name: nameInput.value,
          role: roleSelect.value,
          department: deptInput.value,
          phone: phoneInput.value
        });
        showToast(`New ${roleSelect.value} registered: ${nameInput.value}`, 'success');
      }
      modal.classList.add('hidden');
      renderAdminDirectory();
      renderAdminStats();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };
}

/* System Logs */
function renderAdminLogs() {
  const container = document.getElementById('adminAuditLogsList');
  if (!container) return;
  const logs = window.state.getAuditLogs();
  container.innerHTML = logs.map(l => `
    <div style="font-size:0.82rem; padding:10px 14px; background:var(--bg-secondary); border-radius:var(--radius-sm); border-left:3px solid #64748b;">
      <span style="font-family:var(--font-mono); color:var(--text-muted);">${new Date(l.timestamp).toLocaleTimeString()}</span>
      <span style="margin-left:10px; color:var(--text-primary);">${l.message}</span>
    </div>
  `).join('');
}

// Modal Close Triggers
window.closeModal = (modalId) => {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
  if (modalId === 'campusMapModal' && mapAnimationId) {
    cancelAnimationFrame(mapAnimationId);
  }
};

/* Toast Notification Utility */
function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'danger' ? '🚨' : (type === 'success' ? '✅' : 'ℹ️')}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
