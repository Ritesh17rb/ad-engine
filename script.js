

import { adCatalog } from './ad_catalog.js';
import { html, render } from 'https://cdn.jsdelivr.net/npm/lit-html@3.1.0/+esm';

let isAdShowing = false;
let currentAd = null;
let ytPlayer = null;



// Active Session State
let activeProfile = {};
let activeVideoPath = "";
let activeVideoBlob = null;
let activeVideoName = "";

let generatedSchedule = [];

// --- Configuration & State ---
let APP_CONFIG = {
    apiKey: localStorage.getItem('GEMINI_API_KEY') || '',
    model: localStorage.getItem('GEMINI_MODEL') || 'gemini-1.5-flash-001'
};
const CACHE_KEY_PREFIX = 'ADSTREAM_CACHE_v2_';



document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Config UI
    const apiInput = document.getElementById('geminiApiKeyInput');
    const modelInput = document.getElementById('geminiModelInput');
    
    if(APP_CONFIG.apiKey) apiInput.value = APP_CONFIG.apiKey;
    if(APP_CONFIG.model) modelInput.value = APP_CONFIG.model;

    // 2. Save Config Handler
    document.getElementById('saveConfigBtn').addEventListener('click', () => {
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

    // 2. Set Custom Persona Button
    document.getElementById('set-custom-persona-btn').addEventListener('click', () => {
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
    window.onYouTubeIframeAPIReady = function() {
        ytPlayer = new YT.Player('youtube-player', {
            height: '100%',
            width: '100%',
            videoId: '', // start empty
            playerVars: {
                'playsinline': 1,
                'controls': 0, 
                'rel': 0,
                'showinfo': 0,
                'modestbranding': 1
            },
            events: {
                'onStateChange': onPlayerStateChange
            }
        });
        log("YouTube Player API Ready", "system");
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
        c.classList.remove('border-primary', 'bg-light');
        c.querySelector('button').className = 'btn btn-outline-secondary w-100 select-video-btn';
        c.querySelector('button').innerText = "Load Video";
    });
    
    cardElement.classList.add('border-primary', 'bg-light');
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
    
    // reset state
    render(html`<div class="text-muted p-3">Video changed. Ready to analyze.</div>`, document.getElementById('json-output'));


    // OPTIMIZATION: Set src immediately for instant playback perception
    const videoPlayer = document.getElementById('main-video');
    videoPlayer.querySelector('source').src = videoPath;
    videoPlayer.load();

    try {
        log(`Loading ${activeVideoName}...`, "system");
        
        // Fetch blob in background for Gemini (silent)
        const response = await fetch(videoPath);
        if (!response.ok) throw new Error(`Failed to load video file: ${response.statusText}`);
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
        c.classList.remove('border-primary', 'bg-light');
        c.querySelector('button').className = 'btn btn-outline-primary w-100 select-scenario-btn';
        c.querySelector('button').innerText = c.querySelector('button').innerText.replace('Selected', 'Select');
    });
    
    cardElement.classList.add('border-primary', 'bg-light');
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
    const apiKey = APP_CONFIG.apiKey;
    if (!apiKey) {
        // Open Modal if no key
        const modal = new bootstrap.Modal(document.getElementById('configModal'));
        modal.show();
        showAlert("Please configure your Gemini API Key first.", "warning");
        return;
    }

    if (!activeVideoBlob) {
        showAlert("Video not loaded successfully. Cannot analyze.", "danger");
        return;
    }

    if (!activeProfile || !activeProfile.name) {
        showAlert("Please select a Target Persona to analyze for.", "warning");
        // Scroll to persona selection
        document.querySelector('.scenario-card')?.scrollIntoView({ behavior: 'smooth' });
        return;
    }


    // reset state
    generatedSchedule = [];
    clearLogs();
    
    // Initial status render
    const scheduleContainer = document.getElementById('json-output');
    render(html`<div class="text-muted p-3"><span class="spinner-border spinner-border-sm me-2"></span>Processing...</div>`, scheduleContainer);
    
    // Check Cache First
    const cacheKey = `${CACHE_KEY_PREFIX}${activeVideoName}_${activeProfile.name}`;
    const cachedData = localStorage.getItem(cacheKey);
    
    if (cachedData) {
        log("Cache Hit! Loading saved analysis...", "success");
        const schedule = JSON.parse(cachedData);
        generatedSchedule = schedule;
        renderSchedule(schedule);
        document.getElementById('engine-status').innerText = "Loaded from Cache. Ready to play.";
        
        // Ensure overlay is hidden if it was somehow shown
        document.getElementById('analysis-overlay').classList.add('d-none');
        document.getElementById('analysis-overlay').classList.remove('d-flex');
        return;
    }

    // Show Analysis Overlay with Flex for Centering
    const overlay = document.getElementById('analysis-overlay');
    const stepLabel = document.getElementById('analysis-step');
    
    overlay.classList.remove('d-none');
    overlay.classList.add('d-flex'); // Enable Flexbox for centering
    
    try {

        const btn = document.getElementById('run-gemini-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Analyzing...';

        log("Starting Gemini Analysis Pipeline...", "system");


        // 1. Upload File
        // 1. Upload File
        stepLabel.innerText = "Uploading video to Context Window...";
        log("Step 1: Uploading video to Gemini...", "ai");

        const fileUri = await uploadFileToGemini(apiKey, activeVideoBlob, activeVideoName);
        // log(`Upload complete. URI: ${fileUri}`, "system");

        // 2. Poll for Active State
        // 2. Poll for Active State
        stepLabel.innerText = "Processing video content...";
        log("Step 2: Processing video (waiting for state=ACTIVE)...", "ai");

        await waitForFileActive(apiKey, fileUri);
        log("Video processing complete.", "success");

        // 3. Generate Content
        // 3. Generate Content
        stepLabel.innerText = "Consulting Ad Catalog & Persona...";
        log("Step 3: Generating Ad Schedule contextually...", "ai");

        const schedule = await generateAdSchedule(apiKey, fileUri, activeProfile);
        
        // 4. Output
        // 4. Output with Lit HTML
        generatedSchedule = schedule;
        renderSchedule(schedule);
        
        generatedSchedule = schedule;
        renderSchedule(schedule);
        
        // Save to Cache
        localStorage.setItem(cacheKey, JSON.stringify(schedule));
        
        log(`Success! ${schedule.length} ad slots generated.`, "success");
        document.getElementById('engine-status').innerText = "Analysis Complete. Play video to view ads.";

    } catch (error) {
        log(`Error: ${error.message}`, "error");
        showAlert(`Analysis Failed: ${error.message}`, "danger");
        console.error(error);
        
        // Render Error State in Schedule Box too
        render(html`<div class="alert alert-danger m-3">Analysis Failed. check logs.</div>`, document.getElementById('json-output'));


    } finally {
        overlay.classList.add('d-none'); // Hide Overlay
        overlay.classList.remove('d-flex');
        
        const btn = document.getElementById('run-gemini-btn');


        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-stars me-2"></i>Analyze with Gemini';
    }
}


async function uploadFileToGemini(apiKey, blob, displayName) {
    const metadata = { file: { display_name: displayName } };
    const numBytes = blob.size;
    const mimeType = blob.type;

    // A. Initiate Resumable Upload
    const initRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': numBytes,
            'X-Goog-Upload-Header-Content-Type': mimeType,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
    });

    if (!initRes.ok) throw new Error(`Upload Init Failed: ${initRes.statusText}`);
    const uploadUrl = initRes.headers.get('x-goog-upload-url');

    // B. Perform Upload
    const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'Content-Length': numBytes,
            'X-Goog-Upload-Offset': '0',
            'X-Goog-Upload-Command': 'upload, finalize'
        },
        body: blob
    });

    if (!uploadRes.ok) throw new Error(`File Transfer Failed: ${uploadRes.statusText}`);
    const fileInfo = await uploadRes.json();
    return fileInfo.file.uri;
}

async function waitForFileActive(apiKey, fileUri) {
    // Extract file name from URI
    // URI format: https://generativelanguage.googleapis.com/v1beta/files/NAME
    const fileName = fileUri.split('/files/')[1]; 
    const checkUrl = `https://generativelanguage.googleapis.com/v1beta/files/${fileName}?key=${apiKey}`;

    let state = "PROCESSING";
    while (state === "PROCESSING") {
        await new Promise(r => setTimeout(r, 2000)); // poll every 2s
        const res = await fetch(checkUrl);
        const data = await res.json();
        state = data.state;
        if (state === "FAILED") throw new Error("Video processing failed on Gemini side.");
    }
    return state;
}


async function generateAdSchedule(apiKey, fileUri, profile) {
    let modelName = APP_CONFIG.model || 'gemini-1.5-flash-001'; // Reverted to 'gemini-1.5-flash-001'
    
    // Optional: Log model usage
    log(`Using Model: ${modelName}`, "system");

    const catalogSummary = adCatalog.map(ad => 
        `- ID: ${ad.id} | Brand: ${ad.brand} | Title: ${ad.title} | Tags: ${ad.tags.join(', ')} | Desc: ${ad.description}`
    ).join('\n');

    const prompt = `
    You are the AdStream Contextual Engine.
    
    User Profile: 
    - Name: ${profile.name || "Generic User"}
    - Demographics: ${profile.age || "Unknown"} years old, ${profile.gender || "Unknown"}
    - Interests: ${(profile.interests || []).join(", ")}
    - Mood: ${profile.mood || "Neutral"}
    - Buying Pattern: ${profile.pattern || "Clicker"}

    Available Ad Catalog (Choose from these ONLY):
    ${catalogSummary}
    
    Task: Scan the video for ad placement opportunities aligned with the User Profile.
    Select specific ads from the catalog that match the context of the video and the user profile.
    
    Output: A JSON list of objects.
    
    Format:
    [
      {
        "timestamp_seconds": number,
        "ad_id": "string (MUST be one of the IDs from the catalog)",
        "video_context": "Short description of what is happening in the video scene",
        "persona_match": "Why this specifically fits the User's demographics/interests",
        "strategic_reason": "The logic behind placing THIS ad at THIS moment"
      }
    ]
    Return ONLY valid JSON.
    `;



    // 2. Generation Request
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: prompt },
                    { file_data: { mime_type: "video/mp4", file_uri: fileUri } }
                ]
            }],
            // Force JSON response to ensure parsing works
            generationConfig: {
                response_mime_type: "application/json"
            }
        })
    });

    if(!res.ok) {
        const errText = await res.text();
        throw new Error(`Generation Failed (${res.status}): ${errText}`);
    }
    
    const data = await res.json();
    
    try {
        const text = data.candidates[0].content.parts[0].text;
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const rawSchedule = JSON.parse(jsonStr);
        
        // Hydrate schedule with full ad details from catalog
        return rawSchedule.map(item => {
            const catalogItem = adCatalog.find(ad => ad.id === item.ad_id);
            if (!catalogItem) return null; // skip invalid IDs
            return {
                ...item,
                ...catalogItem,
                duration: 30 // Approx duration, or we rely on YT player 'ended' event
            };
        }).filter(item => item !== null);

    } catch (e) {
        console.error("Failed to parse Gemini response", data);
        throw new Error("Invalid JSON response from Gemini");
    }
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
        log("YouTube Player not ready!", "error");
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
    ytPlayer.loadVideoById(ad.youtube_id);
    ytPlayer.playVideo();
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
        wrapper.className = "chat-msg-wrap d-flex justify-content-center small text-muted";
    } else if (type === 'ai') {
        icon = '<i class="bi bi-stars me-2 text-primary"></i>';
        wrapper.className = "chat-msg-wrap msg-ai";
    } else if (type === 'error') {
        icon = '<i class="bi bi-exclamation-triangle-fill me-2 text-danger"></i>';
        wrapper.className = "chat-msg-wrap text-danger";
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
