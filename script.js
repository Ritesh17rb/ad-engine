


import { adCatalog } from './ad_catalog.js';
import { html, render } from 'https://cdn.jsdelivr.net/npm/lit-html@3.1.0/+esm';

let isAdShowing = false;
let currentAd = null;
let ytPlayer = null;
let isPlayerReady = false;


// Active Session State
let activeProfile = {};
let activeVideoPath = "";
let activeVideoBlob = null;
let activeVideoName = "";

let generatedSchedule = [];

// --- Configuration & State ---
let APP_CONFIG = {
    apiKey: localStorage.getItem('GEMINI_API_KEY') || '',
    model: localStorage.getItem('GEMINI_MODEL') || 'gemini-2.5-flash'
};
const CACHE_KEY_PREFIX = 'ADSTREAM_CACHE_v2_';



document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Config UI
    const apiInput = document.getElementById('geminiApiKeyInput');
    const modelInput = document.getElementById('geminiModelInput');
    
    if(apiInput) apiInput.value = APP_CONFIG.apiKey;
    if(modelInput && APP_CONFIG.model) modelInput.value = APP_CONFIG.model;

    // 2. Save Config Handler
    const saveBtn = document.getElementById('saveConfigBtn');
    if(saveBtn) {
        saveBtn.addEventListener('click', () => {
            const newKey = apiInput.value.trim();
            const newModel = modelInput.value.trim();
            
            if(!newKey) {
                alert("Please enter a valid API Key.");
                return;
            }

            APP_CONFIG.apiKey = newKey;
            APP_CONFIG.model = newModel;
            
            localStorage.setItem('GEMINI_API_KEY', newKey);
            localStorage.setItem('GEMINI_MODEL', newModel);
            
            // Hide Modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('configModal'));
            modal.hide();
            
            showAlert("Settings saved successfully!", "success");
        });
    }

    // 2. Set Custom Persona Button (Legacy/Removed)
    const customBtn = document.getElementById('set-custom-persona-btn');
    if(customBtn) {
        customBtn.addEventListener('click', () => {
        const name = document.getElementById('custom-name').value;
        const age = document.getElementById('custom-age').value;
        const gender = document.getElementById('custom-gender').value;
        const interests = document.getElementById('custom-interests').value.split(',').map(s => s.trim());
        const searches = document.getElementById('custom-searches').value.split(',').map(s => s.trim());
        const mood = document.getElementById('custom-mood').value;
        const pattern = document.getElementById('custom-pattern').value;

        const profile = { name, age, gender, interests, searches, mood, pattern };
        
        // Use a mock card element for selectScenario to reuse UI highlighting logic partially, 
        // or just manually set it. Let's manually set it to be cleaner.
        
        activeProfile = profile;
        
        // Update UI Visuals
        document.querySelectorAll('.scenario-card').forEach(c => c.classList.remove('border-primary', 'bg-light'));
        const customCard = document.getElementById('custom-persona-card');
        customCard.classList.add('border-primary', 'bg-light'); // Highlight custom card
        
        // Update Active Engine Interface
        document.getElementById('engine-interface').classList.remove('d-none');
        document.getElementById('active-profile-name').innerText = activeProfile.name;
        document.getElementById('active-interests').innerText = activeProfile.interests.join(", ");
        
        // Reset log if needed
        if(generatedSchedule.length > 0) {
           log("New profile selected. Ready to re-analyze.", "system"); 
        }
    });
    }

    // Toggle Password Visibility in Modal
    document.getElementById('toggleKeyVisibilityModal').addEventListener('click', function() {
        const input = document.getElementById('geminiApiKeyInput');
        const icon = this.querySelector('i');
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('bi-eye');
            icon.classList.add('bi-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.remove('bi-eye-slash');
            icon.classList.add('bi-eye');
        }
    });

    // 3. Scenario Selection Logic
    document.querySelectorAll('.select-scenario-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.scenario-card');
            selectScenario(card);
        });
    });

    // 4. Independent Video Selection Logic
    document.querySelectorAll('.select-video-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.video-card');
            selectVideoSource(card);
        });
    });

    // 4. Run Analysis Handler
    const runBtn = document.getElementById('run-gemini-btn');
    if(runBtn) runBtn.addEventListener('click', runGeminiAnalysis);

    // 5. Video Event Listener for Ads
    const mainVideo = document.getElementById('main-video');
    mainVideo.addEventListener('timeupdate', checkAdSchedule);

    // 6. Custom Fullscreen Logic
    // 6. Custom Fullscreen Logic
    document.getElementById('custom-fullscreen-btn').addEventListener('click', () => {
        const container = document.getElementById('video-container');
        if (!document.fullscreenElement) {
            container.requestFullscreen().catch(err => {
                showAlert(`Error attempting to enable fullscreen mode: ${err.message}`, "danger");
            });
        } else {
            document.exitFullscreen();
        }
    });

    // 7. Manual Ad Close Button
    document.getElementById('close-ad').addEventListener('click', () => {
        hideAd();
    });

    // 9. Skip Ad Button Handler
    document.getElementById('skip-ad-btn').addEventListener('click', () => {
        hideAd();
    });

    // 8. Initialize YouTube Player

    // Define callback BEFORE injecting script
    // Define callback BEFORE injecting script
    window.onYouTubeIframeAPIReady = function() {
        try {
            ytPlayer = new YT.Player('youtube-player', {
                height: '100%',
                width: '100%',
                videoId: '', // start empty
                playerVars: {
                    'playsinline': 1,
                    'controls': 0, 
                    'rel': 0,
                    'showinfo': 0,
                    'modestbranding': 1,
                    'origin': window.location.origin
                },
                events: {
                    'onReady': onPlayerReady,
                    'onStateChange': onPlayerStateChange
                }
            });
            // Note: API Ready doesn't mean Player is Ready. 'onReady' confirms it.
        } catch (e) {
            console.error("Failed to initialize YouTube Player:", e);
            log("Error initializing Ad Player API", "error");
        }
    };

    // Inject Script now
    // Check if script already exists to avoid duplication errors causing race conditions
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
});


function onPlayerReady(event) {
    isPlayerReady = true;
    log("Ad Player Ready", "system");
}

function onPlayerStateChange(event) {
    // YT.PlayerState.ENDED = 0
    if (event.data === 0) {
        console.log("Ad ended");
        hideAd();
    }
}


// ... existing code ...

function showAlert(message, type = 'danger') {
    const container = document.getElementById('alert-container');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = [
        `<div class="alert alert-${type} alert-dismissible" role="alert">`,
        `   <div><i class="bi bi-exclamation-circle-fill me-2"></i>${message}</div>`,
        '   <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>',
        '</div>'
    ].join('');
    container.append(wrapper);
    
    // Auto dismiss after 5s
    setTimeout(() => {
        wrapper.remove();
    }, 5000);
}




async function selectVideoSource(cardElement) {
    // 1. Highlight UI
    document.querySelectorAll('.video-card').forEach(c => {
        c.classList.remove('border-primary', 'bg-primary-subtle');
        c.querySelector('button').className = 'btn btn-outline-secondary w-100 select-video-btn';
        c.querySelector('button').innerText = "Load Video";
    });
    
    cardElement.classList.add('border-primary', 'bg-primary-subtle');
    const btn = cardElement.querySelector('button');
    btn.className = 'btn btn-primary w-100 fw-bold';
    btn.innerText = "Active";

    const videoPath = cardElement.dataset.videoSrc;
    
    // 2. Load the video
    await loadVideoContent(videoPath);
    
    // 3. Show Interface Immediately
    document.getElementById('engine-interface').classList.remove('d-none');
    
    // Scroll to player for better UX
    document.getElementById('engine-interface').scrollIntoView({ behavior: 'smooth' });
}

async function loadVideoContent(videoPath) {
    activeVideoPath = videoPath;
    activeVideoName = videoPath.split('/').pop();
    
    document.getElementById('current-video-label').innerText = activeVideoName;
    document.getElementById('video-loading-spinner').classList.remove('d-none');
    
    // Clear previous schedule for THIS video
    generatedSchedule = [];
    clearLogs();
    
    // reset state
    render(html`<div class="text-muted p-3">Video changed. Ready to analyze.</div>`, document.getElementById('json-output'));
    document.getElementById('engine-status').innerText = "Waiting for analysis...";
    document.getElementById('ad-indicators-container').classList.add('d-none');
    document.getElementById('engine-status').innerText = "Waiting for analysis...";
    document.getElementById('ad-indicators-container').classList.add('d-none');


    // OPTIMIZATION: Set src immediately for instant playback perception
    const videoPlayer = document.getElementById('main-video');
    videoPlayer.querySelector('source').src = videoPath;
    videoPlayer.load();

    try {
        log(`Loading ${activeVideoName}...`, "system");
        
        // Fetch blob in background for Gemini (silent)
        const response = await fetch(videoPath);
        if (!response.ok) throw new Error(`Failed to load video file: ${response.statusText} (Ensure file exists in /videos/)`);
        activeVideoBlob = await response.blob();
        
        document.getElementById('video-loading-spinner').classList.add('d-none');
        log("Video loaded and ready for analysis.", "success");
    } catch (e) {
        console.error(e);
        document.getElementById('video-loading-spinner').classList.add('d-none');
        log(`Error loading video blob: ${e.message}`, "error");
        showAlert("Video loaded for playback, but analysis may fail (Blob error).", "warning");
    }
}


async function selectScenario(cardElement) {
    // Highlight UI
    document.querySelectorAll('.scenario-card').forEach(c => {
        c.classList.remove('border-primary', 'bg-primary-subtle');
        c.querySelector('button').className = 'btn btn-outline-primary w-100 select-scenario-btn';
        c.querySelector('button').innerText = c.querySelector('button').innerText.replace('Selected', 'Select');
    });
    
    cardElement.classList.add('border-primary', 'bg-primary-subtle');
    const btn = cardElement.querySelector('button');
    btn.className = 'btn btn-primary w-100 fw-bold';
    btn.innerText = "Selected";

    // Parse Data
    const profileJson = JSON.parse(cardElement.dataset.profile);
    activeProfile = profileJson;

    // Update UI Active State
    document.getElementById('profile-banner-container').classList.remove('d-none');
    document.getElementById('active-profile-name').innerText = activeProfile.name;
    
    // Render Interests as Badges
    const interestContainer = document.getElementById('active-interests');
    render(html`${activeProfile.interests.map(i => html`<span class="badge bg-secondary-subtle text-secondary-emphasis me-1 border">${i}</span>`)}`, interestContainer);
    
    // Also update demographics if element exists (will add in HTML next)
    const demoEl = document.getElementById('active-demographics');
    if(demoEl) demoEl.innerText = `${activeProfile.age || '?'} Years • ${activeProfile.gender || 'Unknown'} • ${activeProfile.mood || 'Neutral'}`;

    // RESET STATE for new persona
    generatedSchedule = [];
    clearLogs();
    render(html`<div class="text-muted p-3">Persona changed. Ready to analyze.</div>`, document.getElementById('json-output'));
    document.getElementById('engine-status').innerText = "Waiting for analysis...";
    document.getElementById('ad-indicators-container').classList.add('d-none');

    // We do NOT change the video here anymore. Video and Persona are independent.
    // If interface is hidden (user selected persona first), show it?
    // Actually, user might want to pick video next. 
    // But if they pick persona, then video, the video logic will show the interface.
    // If they picked video, then persona, interface is already there.
    // If they pick persona first, let's show the interface but with empty video state? 
    // The previous logic hid it. Let's keep it visible if they pick persona, encouraging them to pick video if empty.
    
    document.getElementById('engine-interface').classList.remove('d-none');
    
    if(!activeVideoPath) {
        showAlert("Persona selected! Now select a Video to analyze.", "info");
    }
}


/* -------------------------------------------------------------------------- */
/*                                GEMINI LOGIC                                */
/* -------------------------------------------------------------------------- */

async function runGeminiAnalysis() {
    // 1. Validation (Relaxed: No API Key check needed anymore)
    if (!activeVideoPath) { // Check path instead of blob, as we don't need to upload
        showAlert("Video not loaded. Please select a video.", "danger");
        return;
    }

    if (!activeProfile || !activeProfile.name) {
        showAlert("Please select a Target Persona to analyze for.", "warning");
        document.querySelector('.scenario-card')?.scrollIntoView({ behavior: 'smooth' });
        return;
    }

    // Reset State
    generatedSchedule = [];
    clearLogs();
    
    // UI Feedback
    const scheduleContainer = document.getElementById('JSON-output'); // ensure ID matches, often 'json-output'
    const statusEl = document.getElementById('engine-status');
    // element ID in HTML might be 'json-output', let's use the one from existing code which was 'json-output'
    // Actually the previous code used `document.getElementById('json-output')`. I should stick to that.
    
    const outputContainer = document.getElementById('json-output');
    render(html`<div class="text-muted p-3"><span class="spinner-border spinner-border-sm me-2"></span>Loading cached analysis...</div>`, outputContainer);
    
    // 2. Load from Static Cache
    // We assume the file structure is flat in ./cache/ or matching the local setup
    const fileName = `${activeVideoName}_${activeProfile.name}.json`;
    const cacheUrl = `./cache/${fileName}`; 
    
    log(`Fetching static analysis: ${cacheUrl}...`, "system");
    
    try {
        const response = await fetch(cacheUrl);
        
        if (!response.ok) {
            throw new Error(`Analysis not found for this Video + Persona combination. (Checked: ${fileName})`);
        }
        
        const cachedData = await response.json();
        
        // Success
        log("Analysis loaded successfully.", "success");
        generatedSchedule = cachedData;
        renderSchedule(cachedData);
        renderAdIndicators(cachedData); 
        statusEl.innerText = "Analysis Loaded (Static).";
        
    } catch (e) {
        console.warn("Cache load failed", e);
        log(`Error: ${e.message}`, "error");
        statusEl.innerText = "Analysis Failed.";
        
        render(html`
            <div class="alert alert-warning m-3">
                <i class="bi bi-exclamation-triangle me-2"></i>
                <strong>No Data Found:</strong><br>
                Could not find pre-calculated results for:<br>
                <em>Video: ${activeVideoName}</em><br>
                <em>Persona: ${activeProfile.name}</em><br>
                <br>
                <small class="text-muted">Since this is a static demo, only specific combinations are available.</small>
            </div>
        `, outputContainer);
    }
}




function renderSaveButton(data, filename) {
    const container = document.getElementById('json-output');
    // Append a save button at the top
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-sm btn-outline-success mb-2 float-end';
    saveBtn.innerHTML = '<i class="bi bi-download me-1"></i>Save for Cache';
    saveBtn.onclick = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = filename;
        a.click();
    };
    
    // container is a PRE tag, might be messy to append.
    // Let's insert before.
    container.parentNode.insertBefore(saveBtn, container);
}


function renderAdIndicators(schedule) {
    const container = document.getElementById('ad-indicators-container');
    const list = document.getElementById('ad-indicators-list');
    
    if(!schedule || schedule.length === 0) {
        container.classList.add('d-none');
        return;
    }

    container.classList.remove('d-none');
    
    const templates = schedule.map(ad => {
        const jumpTime = Math.max(0, ad.timestamp_seconds - 3);
        const timeStr = formatTime(ad.timestamp_seconds);
        return html`
            <button class="btn btn-sm btn-outline-primary d-flex align-items-center" 
                    @click=${() => jumpToTime(jumpTime)}>
                <i class="bi bi-play-fill me-1"></i>
                <span class="me-1">Ad at ${timeStr}</span>
                <span class="badge bg-primary-subtle text-primary-emphasis rounded-pill" style="font-size: 0.7em;">Jump</span>
            </button>
        `;
    });
    
    render(html`${templates}`, list);
}

function jumpToTime(seconds) {
    const video = document.getElementById('main-video');
    video.currentTime = seconds;
    video.play();
    log(`Jumped to ${formatTime(seconds)} (Context for Ad)`, "system");
}




function renderSchedule(schedule) {
    const container = document.getElementById('json-output'); 
    
    // Restore styling for code block look
    container.classList.add('bg-body-secondary', 'p-3', 'rounded'); 
    container.style.maxHeight = '600px';
    container.style.overflowY = 'auto'; 
    
    if (!schedule || schedule.length === 0) {
        // Use lit-html to render simple text
        render(html`<div>No data generated yet.</div>`, container);
        return;
    }

    // Render formatted JSON
    // We use a code block or just text inside the pre tag
    const jsonString = JSON.stringify(schedule, null, 2);
    
    render(html`<code>${jsonString}</code>`, container);
}


function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}


/* -------------------------------------------------------------------------- */
/*                               PLAYER UTILS                                 */
/* -------------------------------------------------------------------------- */

function checkAdSchedule() {
    if (generatedSchedule.length === 0) return;

    const video = document.getElementById('main-video');
    const currentTime = video.currentTime;

    // Find active ad that hasn't been played
    const activeAd = generatedSchedule.find(ad => 
        !ad.hasPlayed && // Check if ad was already played/skipped
        currentTime >= ad.timestamp_seconds && 
        currentTime < (ad.timestamp_seconds + 30) // Assuming 30s window or duration
    );

    if (activeAd) {
        if (!isAdShowing) {
            showAd(activeAd);
        }
    } else {
        // If we are showing an ad, but no ad matches the current time/played status...
        // This usually triggers if the 'ad.hasPlayed' becomes true.
        // We let hideAd handle the cleanup explicitly when called. 
        // We DO NOT force hideAd here because it might interrupt the video resume logic.
    }
}

let skipTimerInterval = null;

function showAd(ad) {
    if(!ytPlayer) {
        console.warn("ytPlayer object is null/undefined");
        log("Ad Player not initialized yet.", "warning");
        return;
    }

    if(!isPlayerReady) {
        console.warn("ytPlayer exists but isPlayerReady=false");
        
        // Sometimes onReady doesn't fire if hidden, but the object might still work?
        // But if loadVideoById is missing, it's critical.
        if (typeof ytPlayer.loadVideoById !== 'function') {
             log("Ad Player API failed to load methods. Retrying later...", "error");
             return;
        }
    }

    // Final safety check for the specific method error reported
    if (typeof ytPlayer.loadVideoById !== 'function') {
        console.error("ytPlayer.loadVideoById is not a function", ytPlayer);
        log("Error: Ad Player defective (API method missing).", "error");
        return;
    }

    isAdShowing = true;
    currentAd = ad;
    
    const mainVideo = document.getElementById('main-video');
    const playerContainer = document.getElementById('youtube-player');
    const skipContainer = document.getElementById('skip-ad-container');
    const skipBtn = document.getElementById('skip-ad-btn');
    
    // Pause main video
    mainVideo.pause();
    
    // Show YT Player & Skip Button Container
    playerContainer.classList.remove('d-none');
    skipContainer.classList.remove('d-none');
    
    // Reset Skip Button
    skipBtn.disabled = true;
    skipBtn.innerText = "Skip in 5";
    
    let countdown = 5;
    if(skipTimerInterval) clearInterval(skipTimerInterval);
    
    skipTimerInterval = setInterval(() => {
        countdown--;
        if(countdown > 0) {
            skipBtn.innerText = `Skip in ${countdown}`;
        } else {
            clearInterval(skipTimerInterval);
            skipBtn.innerText = "Skip Ad";
            skipBtn.disabled = false;
        }
    }, 1000);

    log(`Playing Ad: ${ad.brand} - ${ad.title}`, "system");

    // Load and Play
    try {
        ytPlayer.loadVideoById(ad.youtube_id);
        ytPlayer.playVideo();
    } catch (e) {
        console.error("Error playing ad video:", e);
        log("Error playing ad video via YT Player.", "error");
        hideAd(); // Fallback to resume info
    }
}

function hideAd() {
    // IMPORTANT: Mark the current ad as played so checkAdSchedule doesn't find it again immediately
    if(currentAd) {
        currentAd.hasPlayed = true; 
    }

    isAdShowing = false;
    currentAd = null;
    
    const playerContainer = document.getElementById('youtube-player');
    const skipContainer = document.getElementById('skip-ad-container');
    const mainVideo = document.getElementById('main-video');
    
    if(skipTimerInterval) clearInterval(skipTimerInterval);

    // Hide YT Player
    playerContainer.classList.add('d-none');
    skipContainer.classList.add('d-none');
    
    if(ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();

    // Resume Main Video
    mainVideo.play();
    
    log("Ad finished. Resuming content.", "system");
}

function updateAdProgress(ad, currentTime) {
    // only used for progress bar, leaving empty as YT has its own
}


function log(message, type = "info") {
    const chatBox = document.getElementById('chat-box');
    const wrapper = document.createElement('div');
    wrapper.className = `chat-msg-wrap ${type === 'ai' ? 'msg-ai' : 'msg-user'}`;
    
    let icon = "";
    if (type === 'system') {
        icon = '<i class="bi bi-gear-fill me-2"></i>';
        wrapper.className = "chat-msg-wrap msg-ai small text-muted";
    } else if (type === 'ai') {
        icon = '<i class="bi bi-stars me-2 text-primary"></i>';
        wrapper.className = "chat-msg-wrap msg-ai";
    } else if (type === 'error') {
        icon = '<i class="bi bi-exclamation-triangle-fill me-2 text-danger"></i>';
        wrapper.className = "chat-msg-wrap msg-ai text-danger";
    } else if (type === 'success') {
        icon = '<i class="bi bi-check-circle-fill me-2 text-success"></i>';
         wrapper.className = "chat-msg-wrap msg-ai";
    }

    wrapper.innerHTML = `<div class="bubble">${icon} ${message}</div>`;
    chatBox.appendChild(wrapper);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function clearLogs() {
    document.getElementById('chat-box').innerHTML = '';
}
