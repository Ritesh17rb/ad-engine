# AdStream Contextual Engine

An AI-powered video advertising engine that scans video content and generates contextual ad insertions based on a user's profile/persona.

## 🚀 Setup & Usage

### 1. Prerequisites
- **Gemini API Key**: You need a free key from [Google AI Studio](https://aistudio.google.com/).
- **Local Server**: Because this app fetches local video files to upload them to the AI, it **must** be run on a local web server (Browser security blocks `fetch` on `file://` protocols).

### 2. Running the App
The easiest way is to use `http-server` (requires Node.js):

```bash
npx http-server .
```

Then open `http://127.0.0.1:8080` in your browser.

### 3. Using the Engine
1.  **Select a Scenario**: Click one of the 3 Scenario Cards (Gamer, Nature, Fitness). This loads the specific user profile and video.
2.  **Configure AI**: Paste your Gemini API Key in the input field at the top.
3.  **Analyze**: Click **"Analyze with Gemini"**.
4.  **Watch**: Wait for the "Analysis Complete" message, then play the video. You will see ads appear at the optimal moments found by the AI.

## 📁 Project Structure
- `index.html`: Main UI.
- `script.js`: Core logic (Video handling, Gemini API integration, Ad rendering).
- `videos/`: Directory containing the sample video files (`video1.mp4`, `video2.mp4`, `video3.mp4`).

## 🤖 How it Works
1.  **Upload**: The app uploads the selected video (e.g., `video1.mp4`) to the Gemini 1.5 Flash API.
2.  **Multimodal Analysis**: Gemini scans the *visuals* and *audio* of the video to understand the scenes.
3.  **Context Matching**: It matches scenes against the active User Profile (Interests/Mood).
4.  **Schedule Generation**: It returns a precise JSON schedule of *when* to show an ad and *what* the ad copy should say.
5.  **Playback**: The `timeupdate` event listener in the browser checks this schedule and renders the ad overlay in real-time.
