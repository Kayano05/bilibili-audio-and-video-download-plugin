document.addEventListener('DOMContentLoaded', function() {
  console.log('Extension loaded');
  messageDiv = document.getElementById('message');
  const videoListDiv = document.getElementById('videoList');

  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentUrl = tabs[0].url;
    console.log('Current URL:', currentUrl);
    if (!currentUrl.includes('bilibili.com/video')) {
      messageDiv.textContent = 'Please use this extension on a Bilibili video page';
      return;
    }

    chrome.scripting.executeScript({
      target: {tabId: tabs[0].id},
      function: getBilibiliVideo,
    }, (results) => {
      if (chrome.runtime.lastError) {
        messageDiv.textContent = 'Unable to retrieve video information';
        console.error('Unable to retrieve video information:', chrome.runtime.lastError);
        return;
      }

      const videoInfo = results[0].result;
      if (!videoInfo) {
        messageDiv.textContent = 'No video information found';
        console.log('No video information found');
        return;
      }

      console.log('Video information:', videoInfo);

      const videoItem = document.createElement('div');
      videoItem.className = 'video-item';
      
      const buttonGroup = document.createElement('div');
      buttonGroup.className = 'button-group';

      const downloadVideoBtn = document.createElement('button');
      downloadVideoBtn.className = 'download-btn';
      downloadVideoBtn.textContent = 'Download Video';
      downloadVideoBtn.onclick = () => {
        console.log('Download video button clicked');
        downloadVideo(videoInfo, 'video');
      };

      const downloadAudioBtn = document.createElement('button');
      downloadAudioBtn.className = 'download-btn';
      downloadAudioBtn.textContent = 'Download Audio';
      downloadAudioBtn.onclick = () => {
        console.log('Download audio button clicked');
        downloadVideo(videoInfo, 'audio');
      };

      buttonGroup.appendChild(downloadVideoBtn);
      buttonGroup.appendChild(downloadAudioBtn);

      videoItem.innerHTML = `
        <div>Title: ${videoInfo.title}</div>
        <div>Uploader: ${videoInfo.uploader}</div>
        <div>Quality: ${videoInfo.quality}</div>
      `;
      videoItem.appendChild(buttonGroup);
      videoListDiv.appendChild(videoItem);
    });
  });
});

function getBilibiliVideo() {
  const videoData = window.__INITIAL_STATE__ || window.__playinfo__;
  
  if (!videoData) {
    const metaTitle = document.querySelector('meta[property="og:title"]');
    const uploader = document.querySelector('.up-name');
    const urlParts = location.pathname.split('/');
    const bvid = urlParts.find(part => part.startsWith('BV'));

    return {
      title: metaTitle ? metaTitle.content : document.title,
      uploader: uploader ? uploader.textContent.trim() : 'Unknown Uploader',
      quality: 'HD 1080P',
      bvid: bvid,
      aid: window.aid || document.querySelector('script[data-aid]')?.dataset.aid,
      cid: window.cid || document.querySelector('script[data-cid]')?.dataset.cid
    };
  }

  return {
    title: videoData.videoData?.title || videoData.h1Title || document.title,
    uploader: videoData.videoData?.owner?.name || 'Unknown Uploader',
    quality: 'HD 1080P',
    aid: videoData.aid || videoData.videoData?.aid,
    bvid: videoData.bvid || videoData.videoData?.bvid,
    cid: videoData.videoData?.cid || videoData.cid
  };
}

async function downloadVideo(videoInfo, type) {
  try {
    messageDiv.textContent = 'Fetching download URL...';
    console.log('Fetching download URL...');

    const urls = await getBilibiliUrls(videoInfo);
    if (!urls) {
      messageDiv.textContent = 'Unable to fetch download URL';
      console.error('Unable to fetch download URL');
      return;
    }

    const url = type === 'video' ? urls.video : urls.audio;
    const extension = type === 'video' ? '.mp4' : '.m4a';
    console.log(`Download URL: ${url}`);

    chrome.downloads.download({
      url: url,
      filename: `${videoInfo.title}_${type}${extension}`,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        messageDiv.textContent = 'Download failed: ' + chrome.runtime.lastError.message;
        console.error('Download failed:', chrome.runtime.lastError.message);
      } else {
        messageDiv.textContent = 'Download started...';
        console.log('Download started, ID:', downloadId);
      }
    });

  } catch (error) {
    messageDiv.textContent = 'Error during download: ' + error.message;
    console.error('Error during download:', error.message);
  }
}

async function getBilibiliUrls(videoInfo) {
  try {
    if (!videoInfo.aid || !videoInfo.cid) {
      console.log('Attempting to retrieve aid and cid through bvid');
      console.log('bvid:', videoInfo.bvid);
      const viewResponse = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${videoInfo.bvid}`);
      const viewData = await viewResponse.json();
      console.log('viewData:', viewData);
      if (viewData.code === 0) {
        videoInfo.aid = viewData.data.aid;
        videoInfo.cid = viewData.data.cid;
        console.log('Retrieved aid:', videoInfo.aid, 'cid:', videoInfo.cid);
      } else {
        throw new Error('Unable to retrieve aid and cid through bvid');
      }
    }

    if (!videoInfo.aid || !videoInfo.cid) {
      throw new Error('aid or cid not defined');
    }

    const apiUrl = `https://api.bilibili.com/x/player/playurl?avid=${videoInfo.aid}&cid=${videoInfo.cid}&qn=112&fnval=16`;
    console.log('API URL:', apiUrl);
    
    const cookie = await getCookie();
    
    const response = await fetch(apiUrl, {
      headers: {
        'Cookie': cookie,
        'Referer': 'https://www.bilibili.com'
      }
    });

    const data = await response.json();
    console.log('playurl data:', data);
    
    if (data.code !== 0) {
      throw new Error(data.message);
    }

    return {
      video: data.data.dash.video[0].baseUrl,
      audio: data.data.dash.audio[0].baseUrl
    };
  } catch (error) {
    console.error('Failed to retrieve download URL:', error);
    return null;
  }
}

async function getCookie() {
  return new Promise((resolve) => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.cookies.getAll({url: 'https://www.bilibili.com'}, function(cookies) {
        const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
        resolve(cookieString);
      });
    });
  });
} 