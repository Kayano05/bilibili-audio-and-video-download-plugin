importScripts('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.10.1/dist/ffmpeg.min.js');

const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({ log: true });

self.onmessage = async function(e) {
  const { video, audio, fileName } = e.data;
  
  try {
    // 加载FFmpeg
    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load();
    }

    // 写入文件
    ffmpeg.FS('writeFile', 'video.mp4', await fetchFile(video));
    ffmpeg.FS('writeFile', 'audio.m4a', await fetchFile(audio));

    // 合并视频和音频
    await ffmpeg.run(
      '-i', 'video.mp4',
      '-i', 'audio.m4a',
      '-c:v', 'copy',
      '-c:a', 'aac',
      'output.mp4'
    );

    // 读取输出文件
    const data = ffmpeg.FS('readFile', 'output.mp4');
    const blob = new Blob([data.buffer], { type: 'video/mp4' });

    // 发送合并完成的文件
    self.postMessage({
      type: 'complete',
      blob: blob
    });

    // 清理文件系统
    ffmpeg.FS('unlink', 'video.mp4');
    ffmpeg.FS('unlink', 'audio.m4a');
    ffmpeg.FS('unlink', 'output.mp4');

  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error.message
    });
  }
}; 