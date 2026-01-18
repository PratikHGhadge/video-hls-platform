import express from 'express';
import path from 'path';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const app = express();
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------- Middleware --------------------
app.use(cors({
  origin: '*'
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// -------------------- Multer Setup --------------------
const uploadDir = path.join(__dirname, 'uploads', 'originals');

const storage = multer.diskStorage({
  destination: (_, __, cb) => {
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_, file, cb) => {
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (_, file, cb) => {
  if (file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Only video files are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

// -------------------- Routes --------------------
app.get('/', (_, res) => {
  res.json({ status: 'HLS server running' });
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const videoId = uuidv4();
  const inputPath = req.file.path;
  const outputDir = path.join(__dirname, 'uploads', 'hls', videoId);
  const playlistPath = path.join(outputDir, 'index.m3u8');

  fs.mkdirSync(outputDir, { recursive: true });

  // -------------------- FFmpeg Command --------------------
  const ffmpegArgs = [
    '-i', inputPath,
    '-c:v', 'h264',
    '-profile:v', 'main',
    '-crf', '20',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-hls_time', '6',
    '-hls_playlist_type', 'vod',
    '-hls_segment_filename', `${outputDir}/segment_%03d.ts`,
    playlistPath
  ];

  const ffmpeg = spawn('ffmpeg', ffmpegArgs);

  ffmpeg.stderr.on('data', data => {
    console.log(`FFmpeg: ${data}`);
  });

  ffmpeg.on('close', code => {
    // fs.unlinkSync(inputPath); // cleanup original file

    if (code !== 0) {
      return res.status(500).json({ error: 'FFmpeg processing failed' });
    }

    res.status(200).json({
      message: 'Video uploaded & converted to HLS',
      videoId,
      hlsUrl: `/uploads/hls/${videoId}/index.m3u8`
    });
  });
});

// -------------------- Start Server --------------------
app.listen(PORT, () => {
  console.log(`HLS server running at http://localhost:${PORT}`);
});
