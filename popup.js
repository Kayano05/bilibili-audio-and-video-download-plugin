// 将 messageDiv 定义为全局变量
let messageDiv;

document.addEventListener('DOMContentLoaded', function() {
  console.log('插件已加载');
  messageDiv = document.getElementById('message');
  const videoListDiv = document.getElementById('videoList');

  // 检测是否在B站页面
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentUrl = tabs[0].url;
    console.log('当前URL:', currentUrl);
    if (!currentUrl.includes('bilibili.com/video')) {
      messageDiv.textContent = '请在B站视频页面使用此插件';
      return;
    }

    chrome.scripting.executeScript({
      target: {tabId: tabs[0].id},
      function: getBilibiliVideo,
    }, (results) => {
      if (chrome.runtime.lastError) {
        messageDiv.textContent = '无法获取视频信息';
        console.error('无法获取视频信息:', chrome.runtime.lastError);
        return;
      }

      const videoInfo = results[0].result;
      if (!videoInfo) {
        messageDiv.textContent = '未找到视频信息';
        console.log('未找到视频信息');
        return;
      }

      console.log('视频信息:', videoInfo);

      // 显示视频信息
      const videoItem = document.createElement('div');
      videoItem.className = 'video-item';
      
      const downloadVideoBtn = document.createElement('button');
      downloadVideoBtn.className = 'download-btn';
      downloadVideoBtn.textContent = '下载视频';
      downloadVideoBtn.style.marginRight = '10px';
      downloadVideoBtn.onclick = () => {
        console.log('下载视频按钮被点击');
        downloadVideo(videoInfo, 'video');
      };

      const downloadAudioBtn = document.createElement('button');
      downloadAudioBtn.className = 'download-btn';
      downloadAudioBtn.textContent = '下载音频';
      downloadAudioBtn.onclick = () => {
        console.log('下载音频按钮被点击');
        downloadVideo(videoInfo, 'audio');
      };

      videoItem.innerHTML = `
        <div>标题: ${videoInfo.title}</div>
        <div>UP主: ${videoInfo.uploader}</div>
        <div>清晰度: ${videoInfo.quality}</div>
        <div style="margin-top: 10px;">
      `;
      videoItem.appendChild(downloadVideoBtn);
      videoItem.appendChild(downloadAudioBtn);
      videoListDiv.appendChild(videoItem);
    });
  });
});

// 修改获取B站视频信息的函数
function getBilibiliVideo() {
  // 尝试多种方式获取视频信息
  const videoData = window.__INITIAL_STATE__ || window.__playinfo__;
  
  // 如果直接获取不到，尝试从页面元素获取
  if (!videoData) {
    const metaTitle = document.querySelector('meta[property="og:title"]');
    const uploader = document.querySelector('.up-name');
    const urlParts = location.pathname.split('/');
    const bvid = urlParts.find(part => part.startsWith('BV'));

    // 从页面URL获取bvid
    return {
      title: metaTitle ? metaTitle.content : document.title,
      uploader: uploader ? uploader.textContent.trim() : '未知UP主',
      quality: '高清 1080P',
      bvid: bvid,
      // 从页面获取aid和cid
      aid: window.aid || document.querySelector('script[data-aid]')?.dataset.aid,
      cid: window.cid || document.querySelector('script[data-cid]')?.dataset.cid
    };
  }

  // 如果能获取到videoData，使用原来的方式
  return {
    title: videoData.videoData?.title || videoData.h1Title || document.title,
    uploader: videoData.videoData?.owner?.name || '未知UP主',
    quality: '高清 1080P',
    aid: videoData.aid || videoData.videoData?.aid,
    bvid: videoData.bvid || videoData.videoData?.bvid,
    cid: videoData.videoData?.cid || videoData.cid
  };
}

// 下载视频或音频
async function downloadVideo(videoInfo, type) {
  try {
    messageDiv.textContent = '正在获取下载地址...';
    console.log('获取下载地址中...');

    const urls = await getBilibiliUrls(videoInfo);
    if (!urls) {
      messageDiv.textContent = '无法获取下载地址';
      console.error('无法获取下载地址');
      return;
    }

    const url = type === 'video' ? urls.video : urls.audio;
    const extension = type === 'video' ? '.mp4' : '.m4a';
    console.log(`下载URL: ${url}`);

    chrome.downloads.download({
      url: url,
      filename: `${videoInfo.title}_${type}${extension}`,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        messageDiv.textContent = '下载失败：' + chrome.runtime.lastError.message;
        console.error('下载失败：', chrome.runtime.lastError.message);
      } else {
        messageDiv.textContent = '开始下载...';
        console.log('下载开始，ID:', downloadId);
      }
    });

  } catch (error) {
    messageDiv.textContent = '下载出错：' + error.message;
    console.error('下载出错：', error.message);
  }
}

// 修改获取B站视频和音频URL的函数
async function getBilibiliUrls(videoInfo) {
  try {
    // 如果没有aid和cid，先通过bvid获取
    if (!videoInfo.aid || !videoInfo.cid) {
      console.log('尝试通过bvid获取aid和cid');
      console.log('bvid:', videoInfo.bvid);
      const viewResponse = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${videoInfo.bvid}`);
      const viewData = await viewResponse.json();
      console.log('viewData:', viewData);
      if (viewData.code === 0) {
        videoInfo.aid = viewData.data.aid;
        videoInfo.cid = viewData.data.cid;
        console.log('获取到的aid:', videoInfo.aid, 'cid:', videoInfo.cid);
      } else {
        throw new Error('无法通过bvid获取aid和cid');
      }
    }

    if (!videoInfo.aid || !videoInfo.cid) {
      throw new Error('aid或cid未定义');
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
    console.error('获取下载地址失败:', error);
    return null;
  }
}

// 获取Cookie
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