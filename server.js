const http = require('http');

// Load secure variables from Render
const API_KEY = process.env.YOUTUBE_API_KEY;
const FIREBASE_URL = process.env.FIREBASE_URL;

// 1. Keep-Alive Server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Viewcast Dynamic Engine is Live!');
});
server.listen(process.env.PORT || 3000);

// 2. The Auto-Extractor
function extractVideoID(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : url; 
}

// 3. The Firebase Listener
async function getSettings() {
  try {
    const response = await fetch(`${FIREBASE_URL}/viewcast_settings.json`);
    return await response.json();
  } catch (error) {
    console.error("Could not read settings from Firebase.");
    return null;
  }
}

// 4. The YouTube Fetcher
async function getYouTubeViews(videoId) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${API_KEY}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.items && data.items.length > 0) {
      return parseInt(data.items[0].statistics.viewCount);
    }
    return null;
  } catch (error) {
    console.error("YouTube API Error:", error);
    return null;
  }
}

// 5. The Firebase Pusher
async function updateFirebase(videoId, views, targetViews) {
  const viewsRemaining = targetViews - views;
  const now = new Date();
  const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000)).toISOString();

  const payload = {
    video_id: videoId,
    target_views: targetViews,
    live_feed: {
      current_views: views,
      views_remaining: viewsRemaining,
      last_updated_ist: istTime
    }
  };

  const dbUrl = `${FIREBASE_URL}/viewcast_active_video.json`;
  try {
    await fetch(dbUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log(`[${istTime}] Tracked ${views} views. Pushed to Firebase.`);
  } catch (error) {
    console.error("Firebase Update Error:", error);
  }
}

// 6. The Dynamic Heartbeat
setInterval(async () => {
  const settings = await getSettings();
  if (!settings || !settings.video_url || !settings.target_views) {
    console.log("Waiting for a video URL...");
    return;
  }
  const videoId = extractVideoID(settings.video_url);
  if (!videoId) return;
  const currentViews = await getYouTubeViews(videoId);
  if (currentViews !== null) {
    await updateFirebase(videoId, currentViews, parseInt(settings.target_views));
  }
}, 15000);
