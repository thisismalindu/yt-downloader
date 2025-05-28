const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.post('/formats', (req, res) => {
  const { url } = req.body;
  try {
    const formats = execSync(`yt-dlp -F ${url}`).toString();
    res.send(`<pre>${formats}</pre><a href="/">Go Back</a>`);
  } catch (err) {
    res.send(`Error: ${err.message}`);
  }
});

function cleanupTempFiles(files) {
  files.forEach(file => {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch (e) {
        console.error(`Failed to delete ${file}:`, e.message);
      }
    }
  });
}

app.post('/process', async (req, res) => {
  const { url, format, start, end } = req.body;
  const videoId = `video_${Date.now()}`;
  const videoPath = path.join(TEMP_DIR, `${videoId}_video.mp4`);
  const audioPath = path.join(TEMP_DIR, `${videoId}_audio.mp4`);
  const mergedPath = path.join(TEMP_DIR, `${videoId}_merged.mp4`);
  const trimmedPath = path.join(TEMP_DIR, `${videoId}_trimmed.mp4`);
  const finalPath = path.join(TEMP_DIR, `${videoId}_final.mp4`);

  try {
    // Download video only
    execSync(`yt-dlp -f ${format} -o "${videoPath}" ${url}`);

    // Download audio only (code 233)
    execSync(`yt-dlp -f 233 -o "${audioPath}" ${url}`);

    // Merge video and audio
    execSync(`ffmpeg -i "${videoPath}" -i "${audioPath}" -c copy "${mergedPath}"`);

    let inputFile = mergedPath;

    // Trim if start and end are provided
    if (start && end) {
      execSync(`ffmpeg -ss ${start} -to ${end} -i "${mergedPath}" -c copy "${trimmedPath}"`);
      inputFile = trimmedPath;
    }

    // WhatsApp-ready encoding
    execSync(`ffmpeg -i "${inputFile}" -vf "scale=1280:-2,fps=30" -c:v libx264 -preset fast -profile:v baseline -level 3.0 -pix_fmt yuv420p -c:a aac -b:a 128k -ar 44100 -movflags +faststart "${finalPath}"`);

    // Clean up temp files except trimmed file
    cleanupTempFiles([videoPath, audioPath, mergedPath, trimmedPath]);

    res.send(`<a href="/download/${path.basename(finalPath)}">Download WhatsApp-ready video</a>`);
  } catch (err) {
    res.send(`Error: ${err.message}`);
  }
});

app.get('/download/:file', (req, res) => {
  const filePath = path.join(TEMP_DIR, req.params.file);
  res.download(filePath, err => {
    if (!err) {
      setTimeout(() => fs.unlinkSync(filePath), 60000 * 60); // auto-delete after 60 mins
    }
  });
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
