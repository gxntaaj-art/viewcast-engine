const http = require('http');

const API_KEY = process.env.YOUTUBE_API_KEY;
const FIREBASE_URL = process.env.FIREBASE_URL;

// 1. Keep-Alive Server
http.createServer((req, res) => {
    res.writeHead(200); res.end('Multi-Target Engine Live');
}).listen(process.env.PORT || 3000);

function extractVideoID(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : url;
}

// Generates strict IST 5-minute bucket labels
function getBucketKey() {
    const d = new Date(new Date().getTime() + 5.5 * 3600000);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(Math.floor(d.getMinutes() / 5) * 5).padStart(2, '0');
    return `${y}-${mo}-${day}_${h}:${m}`;
}

// 2. The Pure Data Fetcher
async function tick() {
    try {
        const res = await fetch(`${FIREBASE_URL}/viewcast_settings.json`);
        const settings = await res.json();
        if (!settings || !settings.video_url) return;

        const videoId = extractVideoID(settings.video_url);
        if (!videoId) return;

        const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${API_KEY}`);
        const ytData = await ytRes.json();
        if (!ytData.items || ytData.items.length === 0) return;

        const views = parseInt(ytData.items[0].statistics.viewCount);
        const d = new Date(new Date().getTime() + 5.5 * 3600000);
        const istTime = d.toISOString();
        const bucketKey = getBucketKey();

        // Safely update live feed without overwriting everything
        await fetch(`${FIREBASE_URL}/viewcast_active_video/live_feed.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ current_views: views, last_updated_ist: istTime })
        });

        // Safely log the views into the strict 5-minute bucket
        await fetch(`${FIREBASE_URL}/viewcast_active_video/five_minute_intervals/${bucketKey}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ total_views_at_end: views, timestamp: istTime })
        });

        console.log(`[${istTime}] Logged ${views} views.`);
    } catch (err) {
        console.error("Engine Error:", err);
    }
}

// Check every 15 seconds
setInterval(tick, 15000);
