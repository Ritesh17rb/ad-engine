
let generatedSchedule = [];
let isAdShowing = false;
let currentAd = null;

// Active Session State
let activeProfile = {};
let activeVideoPath = "";
let activeVideoBlob = null;
let activeVideoName = "";

document.addEventListener('DOMContentLoaded', () => {
    // 1. Scenario Selection Triggers
    const scenarios = document.querySelectorAll('.scenario-card');
    scenarios.forEach(card => {
        card.querySelector('button').addEventListener('click', () => {
            selectScenario(card);
        });
    });

    // 2. Gemini Analysis Trigger
    const runBtn = document.getElementById('run-gemini-btn');
    if (runBtn) {
        runBtn.addEventListener('click', runGeminiAnalysis);
    }

    // 3. API Key Visibility
    const toggleKeyBtn = document.getElementById('toggleKeyVisibility');
    if (toggleKeyBtn) {
        toggleKeyBtn.addEventListener('click', () => {
            const input = document.getElementById('geminiApiKey');
            input.type = input.type === 'password' ? 'text' : 'password';
        });
    }

    // 4. Video Event Listener for Ads
    const mainVideo = document.getElementById('main-video');
    mainVideo.addEventListener('timeupdate', checkAdSchedule);
});


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

    // Load Data
    const videoPath = cardElement.dataset.video;
    const profileJson = JSON.parse(cardElement.dataset.profile);

    activeProfile = profileJson;
    activeVideoPath = videoPath;
    activeVideoName = videoPath.split('/').pop();

    // Update UI Active State
    document.getElementById('engine-interface').classList.remove('d-none');
    document.getElementById('active-profile-name').innerText = activeProfile.name;
    document.getElementById('active-interests').innerText = activeProfile.interests.join(", ");
    document.getElementById('current-video-label').innerText = activeVideoName;
    document.getElementById('video-loading-spinner').classList.remove('d-none');
    
    // Clear previous logs and schedule
    clearLogs();
    generatedSchedule = [];
    document.getElementById('json-output').innerText = "Select a scenario to start.";
    
    // Load Video Blob (mocking "upload" by fetching local file)
    try {
        log(`Loading ${activeVideoName}...`, "system");
        const response = await fetch(videoPath);
        if (!response.ok) throw new Error(`Failed to load video file: ${response.statusText}`);
        activeVideoBlob = await response.blob();
        
        // Initialize Player source
        const videoUrl = URL.createObjectURL(activeVideoBlob);
        const videoPlayer = document.getElementById('main-video');
        videoPlayer.querySelector('source').src = videoUrl;
        videoPlayer.load();
        
        document.getElementById('video-loading-spinner').classList.add('d-none');
        log("Video loaded. Ready for analysis.", "success");
    } catch (e) {
        console.error(e);
        document.getElementById('video-loading-spinner').classList.add('d-none');
        log(`Error loading video: ${e.message}`, "error");
        log("Ensure you are running a local server (e.g. npx http-server) so relative paths work.", "system");
    }
}


/* -------------------------------------------------------------------------- */
/*                                GEMINI LOGIC                                */
/* -------------------------------------------------------------------------- */

async function runGeminiAnalysis() {
    const apiKey = document.getElementById('geminiApiKey').value.trim();
    if (!apiKey) {
        alert("Please enter a valid Gemini API Key.");
        return;
    }

    if (!activeVideoBlob) {
        alert("Video not loaded successfully. Cannot analyze.");
        return;
    }

    // reset state
    generatedSchedule = [];
    clearLogs();
    document.getElementById('json-output').innerText = "Processing...";
    
    try {
        log("Starting Gemini Analysis Pipeline...", "system");

        // 1. Upload File
        log("Step 1: Uploading video to Gemini...", "ai");
        const fileUri = await uploadFileToGemini(apiKey, activeVideoBlob, activeVideoName);
        log(`Upload complete. URI: ${fileUri}`, "system");

        // 2. Poll for Active State
        log("Step 2: Processing video (waiting for state=ACTIVE)...", "ai");
        await waitForFileActive(apiKey, fileUri);
        log("Video processing complete.", "success");

        // 3. Generate Content
        log("Step 3: Generating Ad Schedule contextually...", "ai");
        const schedule = await generateAdSchedule(apiKey, fileUri, activeProfile);
        
        // 4. Output
        generatedSchedule = schedule;
        document.getElementById('json-output').innerText = JSON.stringify(schedule, null, 2);
        log(`Success! ${schedule.length} ad slots generated.`, "success");
        document.getElementById('engine-status').innerText = "Analysis Complete. Play video to view ads.";

    } catch (error) {
        log(`Error: ${error.message}`, "error");
        console.error(error);
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
    const prompt = `
    You are the AdStream Contextual Engine.
    User Profile: matched with Name: ${profile.name}, Interests: ${profile.interests.join(", ")}, Mood: ${profile.mood}, Buying Pattern: ${profile.pattern}.
    
    Task: Scan the video for ad placement opportunities aligned with the User Profile.
    Output: A JSON list of objects.
    Format:
    [
      {
        "timestamp_seconds": number,
        "duration": number (approx 5-10),
        "trigger_reason": "string explaining the visual match",
        "ad_title": "Short catchy title",
        "ad_copy": "Short copy tailored to mood",
        "cta_link": "https://example.com"
      }
    ]
    Return ONLY valid JSON.
    `;

    // --- CHANGE STARTS HERE ---
    
    // 1. HARDCODE THE CORRECT MODEL (Remove the discovery try/catch block)
    // "gemini-1.5-pro-latest" is the most reliable model for Video Analysis in v1beta
    const modelName = 'gemini-2.5-flash';


    // --- CHANGE ENDS HERE ---

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
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("Failed to parse Gemini response", data);
        throw new Error("Invalid JSON response from Gemini");
    }
}

/* -------------------------------------------------------------------------- */
/*                               PLAYER UTILS                                 */
/* -------------------------------------------------------------------------- */

function checkAdSchedule() {
    if (generatedSchedule.length === 0) return;

    const video = document.getElementById('main-video');
    const currentTime = video.currentTime;

    // Find active ad
    const activeAd = generatedSchedule.find(ad => 
        currentTime >= ad.timestamp_seconds && 
        currentTime < (ad.timestamp_seconds + ad.duration)
    );

    if (activeAd) {
        if (!isAdShowing || currentAd !== activeAd) {
            showAd(activeAd);
        }
        updateAdProgress(activeAd, currentTime);
    } else {
        if (isAdShowing) {
            hideAd();
        }
    }
}

function showAd(ad) {
    isAdShowing = true;
    currentAd = ad;
    
    const overlay = document.getElementById('ad-overlay');
    document.getElementById('ad-title').innerText = ad.ad_title;
    document.getElementById('ad-copy').innerText = ad.ad_copy;
    document.getElementById('ad-cta').href = ad.cta_link;
    
    overlay.classList.remove('d-none');
    setTimeout(() => overlay.classList.add('active'), 10);
    
    log(`Ad Triggered: ${ad.ad_title}`, "system");
}

function hideAd() {
    isAdShowing = false;
    currentAd = null;
    const overlay = document.getElementById('ad-overlay');
    overlay.classList.remove('active');
    setTimeout(() => { if(!isAdShowing) overlay.classList.add('d-none'); }, 500);
}

function updateAdProgress(ad, currentTime) {
    const progress = ((currentTime - ad.timestamp_seconds) / ad.duration) * 100;
    document.getElementById('ad-progress').style.width = `${Math.min(100, Math.max(0, progress))}%`;
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
