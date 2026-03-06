import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg = null;

/**
 * Loads the FFmpeg instance with the necessary WASM files.
 * Uses a singleton pattern to avoid reloading on every request.
 */
export const loadFFmpeg = async () => {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();

  // We use the unpkg CDN to load the necessary WASM files for client-side processing
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  
  try {
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    return ffmpeg;
  } catch (error) {
    console.error("Failed to load FFmpeg:", error);
    ffmpeg = null; // Reset if failed
    throw new Error("Video compression engine failed to initialize.");
  }
};

/**
 * Compresses a video file using FFmpeg WASM.
 * Target: 720p Resolution, H.264 Codec, Ultrafast preset for performance.
 * 
 * @param {File} file - The video file to compress
 * @param {Function} onProgress - Callback for progress updates (0-100)
 * @returns {Promise<File>} - The compressed video file
 */
export const compressVideo = async (file, onProgress) => {
  try {
    const ffmpegInstance = await loadFFmpeg();
    const { name } = file;
    const outputName = `compressed_${name.split('.')[0]}.mp4`;

    // Write the file to FFmpeg's virtual file system
    await ffmpegInstance.writeFile(name, await fetchFile(file));

    // Set up progress logging
    ffmpegInstance.on('progress', ({ progress }) => {
      if (onProgress) {
        onProgress(Math.round(progress * 100));
      }
    });

    // Run compression command
    // -i: input
    // -vf scale=-2:720: Downscale to 720p height, keep aspect ratio (width must be divisible by 2)
    // -c:v libx264: Use H.264 codec (widest compatibility)
    // -crf 28: Constant Rate Factor (23 is default, 28 is lower quality/smaller size suitable for guides)
    // -preset ultrafast: Fastest compression speed (crucial for client-side WASM)
    // -c:a aac: Audio codec
    // -b:a 128k: decent audio bitrate
    await ffmpegInstance.exec([
      '-i', name,
      '-vf', 'scale=-2:720',
      '-c:v', 'libx264',
      '-crf', '28',
      '-preset', 'ultrafast',
      '-c:a', 'aac',
      '-b:a', '128k',
      outputName
    ]);

    // Read the result
    const data = await ffmpegInstance.readFile(outputName);

    // Clean up virtual FS
    await ffmpegInstance.deleteFile(name);
    await ffmpegInstance.deleteFile(outputName);

    // Create new File object
    return new File([data], outputName, { type: 'video/mp4' });

  } catch (error) {
    console.error("Compression error:", error);
    // If compression fails (e.g. SharedArrayBuffer issues in some environments), 
    // we throw so the UI can decide to fallback to original or show error.
    throw error;
  }
};