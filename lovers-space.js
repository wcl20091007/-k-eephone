let activeLoversSpaceCharId = null; // 当前情侣空间对应的角色ID
let activeLoveLetter = null; // 当前查看或回复的情书对象
let activeQuestionId = null; // 当前正在回答的问题ID
let currentDiaryDate = null; // 当前编辑或查看的日记日期
let tempUploadedPhotos = []; // 暂存待上传的照片数据
let lsActivityTimer = null; // 今日足迹定时器ID

// 情侣空间音乐播放器状态管理器
let lsMusicState = {
  playlist: [], // 播放列表
  currentIndex: -1, // 当前播放歌曲索引
  isPlaying: false, // 是否正在播放
};

// 番茄钟状态管理器
let pomodoroState = {
  isActive: false, // 专注是否正在进行
  timerId: null, // 倒计时计时器ID
  periodicTalkTimerId: null, // 角色定时说话计时器ID
  currentSession: null, // 当前专注会话数据
};

// 网络请求工具函数
if (typeof Http_Get_External === 'undefined') {
  window.Http_Get_External = function (url) {
    return new Promise(resolve => {
      fetch(url)
        .then(res => res.json().catch(() => res.text()))
        .then(resolve)
        .catch(() => resolve(null));
    });
  };
}

/**
 * 发起HTTP GET请求
 * @param {string} url - 请求地址
 * @returns {Promise} 请求结果
 */
async function Http_Get(url) {
  return await Http_Get_External(url);
}

/**
 * 检查音频链接是否可以播放
 * @param {string} url - 音频链接
 * @returns {Promise<boolean>} 是否可以播放
 */
function checkAudioAvailability(url) {
  return new Promise(resolve => {
    const tester = new Audio();
    tester.addEventListener('loadedmetadata', () => resolve(true), { once: true });
    tester.addEventListener('error', () => resolve(false), { once: true });
    tester.src = url;
  });
}

/**
 * 获取网络歌曲歌词
 * @param {string} songId - 歌曲ID
 * @param {string} source - 音乐平台来源(netease/tencent)
 * @returns {Promise<string>} 歌词内容
 */
async function getLyricsForSong(songId, source) {
  const url =
    source === 'netease'
      ? `https://api.vkeys.cn/v2/music/netease/lyric?id=${songId}`
      : `https://api.vkeys.cn/v2/music/tencent/lyric?id=${songId}`;

  const response = await Http_Get(url);
  if (response?.data) {
    const lrc = response.data.lrc || response.data.lyric || '';
    const tlyric = response.data.trans || response.data.tlyric || '';
    return lrc + '\\n' + tlyric;
  }
  return '';
}

/**
 * 解析LRC歌词格式
 * @param {string} lrcContent - LRC歌词内容
 * @returns {Array} 解析后的歌词数组[{time, text}]
 */
function parseLRC(lrcContent) {
  if (!lrcContent) return [];
  const lines = lrcContent.split('\n');
  const lyrics = [];
  const timeRegex = /\[(\d{2}):(\d{2})[.:](\d{2,3})\]/g;

  for (const line of lines) {
    const text = line.replace(timeRegex, '').trim();
    if (!text) continue;
    timeRegex.lastIndex = 0;
    let match;
    while ((match = timeRegex.exec(line)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
      const time = minutes * 60 + seconds + milliseconds / 1000;
      lyrics.push({ time, text });
    }
  }
  return lyrics.sort((a, b) => a.time - b.time);
}

/**
 * 格式化音乐时间显示
 * @param {number} seconds - 秒数
 * @returns {string} 格式化后的时间(mm:ss)
 */
function formatMusicTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

/**
 * 更新音乐播放进度条
 */
function updateMusicProgressBar() {
  const currentTimeEl = document.getElementById('music-current-time');
  const totalTimeEl = document.getElementById('music-total-time');
  const progressFillEl = document.getElementById('music-progress-fill');
  if (!audioPlayer.duration) {
    currentTimeEl.textContent = '0:00';
    totalTimeEl.textContent = '0:00';
    progressFillEl.style.width = '0%';
    return;
  }
  const progressPercent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
  progressFillEl.style.width = `${progressPercent}%`;
  currentTimeEl.textContent = formatMusicTime(audioPlayer.currentTime);
  totalTimeEl.textContent = formatMusicTime(audioPlayer.duration);
  updateActiveLyric(audioPlayer.currentTime);
}

/**
 * 搜索网易云音乐歌曲
 * @param {string} name - 歌曲名
 * @param {string} singer - 歌手名
 * @returns {Promise<Array>} 搜索结果数组
 */
async function searchNeteaseMusic(name, singer) {
  try {
    let searchTerm = name.replace(/\s/g, '');
    if (singer) {
      searchTerm += ` ${singer.replace(/\s/g, '')}`;
    }

    const apiUrl = `https://api.vkeys.cn/v2/music/netease?word=${encodeURIComponent(searchTerm)}`;

    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.code !== 200 || !result.data || result.data.length === 0) {
      console.log('vkeys API返回无结果:', result);
      return [];
    }

    return result.data
      .map(song => ({
        name: song.song,
        artist: song.singer,
        id: song.id,
        cover: song.cover || 'https://i.postimg.cc/pT2xKzP-album-cover-placeholder.png',
        source: 'netease',
      }))
      .slice(0, 15);
  } catch (e) {
    console.error('【vkeys API 直连】搜索失败:', e);
    await showCustomAlert(
      '网易云接口直连失败',
      `如果浏览器控制台(F12)提示CORS错误，说明此API禁止直接访问。错误: ${e.message}`,
    );
    return [];
  }
}

/**
 * 搜索QQ音乐歌曲
 * @param {string} name - 歌曲名
 * @returns {Promise<Array>} 搜索结果数组
 */
async function searchTencentMusic(name) {
  try {
    name = name.replace(/\s/g, '');
    const result = await Http_Get(`https://api.vkeys.cn/v2/music/tencent?word=${encodeURIComponent(name)}`);
    if (!result?.data?.length) return [];
    return result.data
      .map(song => ({
        name: song.song,
        artist: song.singer,
        id: song.id,
        cover: song.cover || 'https://i.postimg.cc/pT2xKzPz/album-cover-placeholder.png',
        source: 'tencent',
      }))
      .slice(0, 5);
  } catch (e) {
    console.error('QQ音乐搜索API失败:', e);
    return [];
  }
}

/**
 * 显示选择操作模态框
 * @param {string} title - 模态框标题
 * @param {Array} options - 选项数组[{text, value}]
 * @returns {Promise<string|null>} 用户选择的值或null
 */
function showChoiceModal(title, options) {
  return new Promise(resolve => {
    const modal = document.getElementById('preset-actions-modal');
    const footer = modal.querySelector('.custom-modal-footer');

    footer.innerHTML = '';

    options.forEach(option => {
      const button = document.createElement('button');
      button.textContent = option.text;
      button.onclick = () => {
        modal.classList.remove('visible');
        resolve(option.value);
      };
      footer.appendChild(button);
    });

    const cancelButton = document.createElement('button');
    cancelButton.textContent = '取消';
    cancelButton.style.marginTop = '8px';
    cancelButton.style.borderRadius = '8px';
    cancelButton.style.backgroundColor = '#f0f0f0';
    cancelButton.onclick = () => {
      modal.classList.remove('visible');
      resolve(null);
    };
    footer.appendChild(cancelButton);

    modal.classList.add('visible');
  });
}

/**
 * 打开情侣空间入口 - 根据角色数量决定直接进入或选择角色
 */
async function openLoversSpaceEntry() {
  const singleChats = Object.values(state.chats).filter(chat => !chat.isGroup);
  if (singleChats.length === 0) {
    alert('你还没有任何可以建立情侣空间的角色哦，先去创建一个吧！');
    return;
  }
  if (singleChats.length === 1) {
    openLoversSpace(singleChats[0].id);
  } else {
    openCharSelectorForLoversSpace();
  }
}

/**
 * 打开情侣空间角色选择器 - 显示角色列表及情侣空间开通状态
 */
async function openCharSelectorForLoversSpace() {
  const modal = document.getElementById('ls-char-selector-modal');
  const listEl = document.getElementById('ls-char-selector-list');
  listEl.innerHTML = '';
  const singleChats = Object.values(state.chats).filter(chat => !chat.isGroup);

  singleChats.forEach(chat => {
    const item = document.createElement('div');
    item.className = 'chat-list-item';
    item.style.borderBottom = '1px solid var(--border-color)';
    item.dataset.chatId = chat.id;

    const isLoversSpaceActive = !!chat.loversSpaceData;
    const statusText = isLoversSpaceActive
      ? '<span style="color: green; font-weight: bold;">已开通</span>'
      : '<span style="color: #8a8a8a;">未开启</span>';

    item.innerHTML = `
            <img src="${chat.settings.aiAvatar || defaultAvatar}" class="avatar">
            <div class="info" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span class="name">${chat.name}</span>
                <div class="last-msg">${statusText}</div>
            </div>
        `;
    listEl.appendChild(item);
  });

  modal.classList.add('visible');
}

/**
 * 打开指定角色的情侣空间
 * @param {string} charId - 角色ID
 */
async function openLoversSpace(charId) {
  activeLoversSpaceCharId = charId;
  const chat = state.chats[charId];
  if (!chat) return;

  if (!chat.loversSpaceData) {
    chat.loversSpaceData = {
      background: 'https://i.postimg.cc/k495F4W5/profile-banner.jpg',
      relationshipStartDate: null,
      moments: [],
      albums: [],
      photos: [],
      loveLetters: [],
      shares: [],
      questions: [],
      emotionDiaries: {},
      dailyActivity: {},
      // 保存原始头像，用于重置功能
      originalUserAvatar: chat.settings.myAvatar || defaultAvatar,
      originalCharAvatar: chat.settings.aiAvatar || defaultAvatar,
      // 保存原始角色名字，用于显示
      originalCharName: chat.name,
    };
    await db.chats.put(chat);
  } else {
    // 如果loversSpaceData已存在，但还没有保存原始头像，则保存
    if (!chat.loversSpaceData.originalUserAvatar) {
      chat.loversSpaceData.originalUserAvatar = chat.settings.myAvatar || defaultAvatar;
    }
    if (!chat.loversSpaceData.originalCharAvatar) {
      chat.loversSpaceData.originalCharAvatar = chat.settings.aiAvatar || defaultAvatar;
    }
    if (!chat.loversSpaceData.originalCharName) {
      chat.loversSpaceData.originalCharName = chat.name;
    }
    await db.chats.put(chat);
  }

  await renderLoversSpace(chat);
  showScreen('lovers-space-screen');
}

/**
 * 更新情侣空间在一起天数显示
 * @param {object} chat - 聊天对象
 */
function updateLoversSpaceDaysCounter(chat) {
  const counterEl = document.getElementById('ls-days-counter');
  const startDateString = chat.loversSpaceData.relationshipStartDate;

  if (startDateString) {
    const startDate = new Date(startDateString);
    const today = new Date();
    startDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const diffTime = Math.abs(today - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    counterEl.textContent = `我们已经在一起 ${diffDays} 天了`;
  } else {
    counterEl.innerHTML = `<a>点击右上角"设置"来记录第一天吧</a>`;
  }
}

/**
 * 渲染情侣空间界面
 * @param {object} chat - 聊天对象
 */
async function renderLoversSpace(chat) {
  document.getElementById('lovers-space-screen').style.backgroundImage = `url(${chat.loversSpaceData.background})`;

  const userNickname = chat.settings.myNickname || state.qzoneSettings.nickname || '{{user}}';
  // 使用loversSpaceDisplayName显示角色名字，如果没有则使用原始名字
  const charDisplayName = chat.settings.loversSpaceDisplayName || chat.loversSpaceData?.originalCharName || chat.name;
  const nameElement = document.getElementById('ls-char-name');
  // 将用户名和角色名部分都设置为可点击编辑
  nameElement.innerHTML = `<span class="ls-editable-name" data-type="user" style="cursor: pointer; text-decoration: underline;">${userNickname}</span> & <span class="ls-editable-name" data-type="char" style="cursor: pointer; text-decoration: underline;">${charDisplayName}</span>`;
  
  // 添加点击事件监听器
  nameElement.querySelectorAll('.ls-editable-name').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const type = el.dataset.type;
      if (type === 'user') {
        openUsernameEditor('user', chat);
      } else {
        // 角色名字可以修改
        openUsernameEditor('char', chat);
      }
    };
  });

  const userAvatarEl = document.getElementById('ls-user-avatar');
  const charAvatarEl = document.getElementById('ls-char-avatar');
  userAvatarEl.src = chat.settings.myAvatar || defaultAvatar;
  charAvatarEl.src = chat.settings.aiAvatar || defaultAvatar;
  
  // 添加头像点击事件
  userAvatarEl.style.cursor = 'pointer';
  userAvatarEl.onclick = () => openAvatarEditor('user', chat);
  
  charAvatarEl.style.cursor = 'pointer';
  charAvatarEl.onclick = () => openAvatarEditor('char', chat);

  updateLoversSpaceDaysCounter(chat);

  switchLoversSpaceTab('ls-moments-view');
  document.querySelector('.ls-tab-item.active').classList.remove('active');
  document.querySelector('.ls-tab-item[data-view="ls-moments-view"]').classList.add('active');

  renderLSMoments(chat.loversSpaceData.moments, chat);
  renderLSPhotos(chat.loversSpaceData.photos, chat);
  renderLSLetters(chat.loversSpaceData.loveLetters, chat);
  renderLSShares(chat.loversSpaceData.shares, chat);
  document.getElementById('ls-shares-list').innerHTML = '<p class="ls-empty-placeholder">Ta还没有分享任何内容~</p>';
}

/**
 * 打开头像编辑弹窗
 * @param {string} type - 'user' 或 'char'
 * @param {object} chat - 聊天对象
 */
function openAvatarEditor(type, chat) {
  const modal = document.getElementById('ls-avatar-edit-modal');
  const previewEl = document.getElementById('ls-avatar-edit-preview');
  const titleEl = document.getElementById('ls-avatar-edit-title');
  
  // 设置当前头像
  const currentAvatar = type === 'user' 
    ? (chat.settings.myAvatar || defaultAvatar)
    : (chat.settings.aiAvatar || defaultAvatar);
  previewEl.src = currentAvatar;
  
  // 设置标题（使用显示名字）
  const charDisplayName = chat.settings.loversSpaceDisplayName || chat.loversSpaceData?.originalCharName || chat.name;
  titleEl.textContent = type === 'user' ? '编辑用户头像' : `编辑${charDisplayName}的头像`;
  
  // 存储当前编辑的类型和聊天对象
  modal.dataset.editType = type;
  modal.dataset.chatId = chat.id;
  
  // 显示弹窗
  modal.classList.add('visible');
}

/**
 * 打开用户名编辑弹窗
 * @param {string} type - 'user' 或 'char'
 * @param {object} chat - 聊天对象
 */
function openUsernameEditor(type, chat) {
  const modal = document.getElementById('ls-username-edit-modal');
  const inputEl = document.getElementById('ls-username-input');
  
  // 设置当前用户名（使用与renderLoversSpace相同的逻辑）
  const currentName = type === 'user'
    ? (chat.settings.myNickname || state.qzoneSettings.nickname || '{{user}}')
    : (chat.settings.loversSpaceDisplayName || chat.loversSpaceData?.originalCharName || chat.name);
  inputEl.value = currentName;
  
  // 存储当前编辑的类型和聊天对象
  modal.dataset.editType = type;
  modal.dataset.chatId = chat.id;
  
  // 显示弹窗
  modal.classList.add('visible');
}

/**
 * 保存头像修改
 * @param {string} type - 'user' 或 'char'
 * @param {string} avatarUrl - 头像URL
 * @param {object} chat - 聊天对象
 */
async function saveAvatarChange(type, avatarUrl, chat) {
  if (type === 'user') {
    chat.settings.myAvatar = avatarUrl;
  } else {
    chat.settings.aiAvatar = avatarUrl;
  }
  
  await db.chats.put(chat);
  state.chats[chat.id] = chat;
  
  // 重新渲染情侣空间
  await renderLoversSpace(chat);
  
  // 关闭弹窗
  document.getElementById('ls-avatar-edit-modal').classList.remove('visible');
}

/**
 * 获取原始头像（用于重置功能）
 * @param {string} type - 'user' 或 'char'
 * @param {object} chat - 聊天对象
 * @returns {string} 原始头像URL
 */
function getOriginalAvatar(type, chat) {
  if (!chat.loversSpaceData) return defaultAvatar;
  
  if (type === 'user') {
    return chat.loversSpaceData.originalUserAvatar || chat.settings.myAvatar || defaultAvatar;
  } else {
    return chat.loversSpaceData.originalCharAvatar || chat.settings.aiAvatar || defaultAvatar;
  }
}

/**
 * 保存用户名修改
 * @param {string} type - 'user' 或 'char'
 * @param {string} newName - 新用户名
 * @param {object} chat - 聊天对象
 */
async function saveUsernameChange(type, newName, chat) {
  if (type === 'user') {
    chat.settings.myNickname = newName.trim() || null;
    // 如果为空，也更新qzoneSettings
    if (!newName.trim()) {
      state.qzoneSettings.nickname = null;
    } else {
      state.qzoneSettings.nickname = newName.trim();
    }
  } else {
    // 角色名字可以修改，但只修改显示名字，不修改chat.name（AI读取的名字）
    chat.settings.loversSpaceDisplayName = newName.trim() || null;
  }
  
  await db.chats.put(chat);
  if (type === 'user' && state.qzoneSettings.nickname !== undefined) {
    await db.settings.put(state.qzoneSettings);
  }
  state.chats[chat.id] = chat;
  
  // 重新渲染情侣空间
  await renderLoversSpace(chat);
  
  // 关闭弹窗
  document.getElementById('ls-username-edit-modal').classList.remove('visible');
}

/**
 * 切换情侣空间页签
 * @param {string} viewId - 视图ID
 */
function switchLoversSpaceTab(viewId) {
  if (lsActivityTimer) {
    clearInterval(lsActivityTimer);
    lsActivityTimer = null;
  }

  document.querySelectorAll('.ls-view').forEach(v => (v.style.display = 'none'));
  const targetView = document.getElementById(viewId);
  if (targetView) targetView.style.display = 'block';

  const fabMoment = document.getElementById('ls-add-moment-btn');
  const fabAlbum = document.getElementById('ls-add-album-btn');
  const fabLetter = document.getElementById('ls-add-letter-btn');
  const fabQuestion = document.getElementById('ls-add-question-btn');
  if (fabMoment) fabMoment.style.display = 'none';
  if (fabAlbum) fabAlbum.style.display = 'none';
  if (fabLetter) fabLetter.style.display = 'none';
  if (fabQuestion) fabQuestion.style.display = 'none';
  if (viewId === 'ls-moments-view' && fabMoment) fabMoment.style.display = 'block';
  else if (viewId === 'ls-album-view' && fabAlbum) fabAlbum.style.display = 'block';
  else if (viewId === 'ls-letters-view' && fabLetter) fabLetter.style.display = 'block';
  else if (viewId === 'ls-questions-view' && fabQuestion) fabQuestion.style.display = 'block';

  if (viewId === 'ls-activity-view') {
    const chat = state.chats[activeLoversSpaceCharId];
    renderLSDailyActivity(chat);
  }
}

/**
 * 渲染今日足迹页面 - 默认显示当天
 * @param {object} chat - 聊天对象
 */
function renderLSDailyActivity(chat) {
  currentActivityDate = new Date();
  renderLSDailyActivityForDate(chat, currentActivityDate);
}

/**
 * 根据指定日期渲染每日足迹界面
 * @param {object} chat - 聊天对象
 * @param {Date} date - 指定日期
 */
function renderLSDailyActivityForDate(chat, date) {
  const viewEl = document.getElementById('ls-activity-view');
  viewEl.innerHTML = '';

  if (!chat || !chat.loversSpaceData) {
    viewEl.innerHTML = '<p class="ls-empty-placeholder">数据错误，无法加载足迹。</p>';
    return;
  }

  const header = document.createElement('div');
  header.className = 'ls-activity-header';
  const dateStr = date.toISOString().split('T')[0];
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  let dateDisplay = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  if (dateStr === todayStr) {
    dateDisplay += ' (今天)';
  }

  const calendarIconSvg = `
    <svg id="ls-activity-calendar-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 2V5" stroke="#4A4A4A" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M16 2V5" stroke="#4A4A4A" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M3.5 9.08997H20.5" stroke="#4A4A4A" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M21 8.5V17C21 20 19.5 22 16 22H8C4.5 22 3 20 3 17V8.5C3 5.5 4.5 3.5 8 3.5H16C19.5 3.5 21 5.5 21 8.5Z" stroke="#4A4A4A" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M15.6947 13.7H15.7037" stroke="#ff8fab" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M15.6947 16.7H15.7037" stroke="#ff8fab" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M11.9955 13.7H12.0045" stroke="#ff8fab" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M11.9955 16.7H12.0045" stroke="#ff8fab" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M8.29431 13.7H8.30331" stroke="#ff8fab" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M8.29431 16.7H8.30331" stroke="#ff8fab" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    `;

  header.innerHTML = `
    <span class="ls-activity-date-display">${dateDisplay}</span>
    ${calendarIconSvg}
    `;
  viewEl.appendChild(header);
  header.querySelector('#ls-activity-calendar-icon').onclick = openActivityCalendar;

  const activitiesForDate = chat.loversSpaceData.dailyActivity?.[dateStr];
  const contentContainer = document.createElement('div');
  viewEl.appendChild(contentContainer);

  if (!activitiesForDate) {
    if (dateStr === todayStr) {
      contentContainer.innerHTML = `
        <div class="ls-activity-generate-container">
            <p>今天的足迹还是空白的...</p>
            <button id="ls-generate-activity-btn">生成今天的足迹</button>
            <p class="hint">（此操作每天只能进行一次）</p>
        </div>
    `;
      contentContainer.querySelector('#ls-generate-activity-btn').onclick = () => handleGenerateDailyActivity(chat);
    } else {
      contentContainer.innerHTML = `<p class="ls-empty-placeholder" style="margin-top: 50px;">这一天没有留下任何足迹哦~</p>`;
    }
  } else {
    const listContainer = document.createElement('div');
    listContainer.id = 'ls-activity-list';
    contentContainer.appendChild(listContainer);

    if (lsActivityTimer) clearInterval(lsActivityTimer);
    lsActivityTimer = null;

    displayDailyActivities(activitiesForDate);

    if (dateStr === todayStr) {
      const hasAllDisplayed = displayDailyActivities(activitiesForDate);
      if (!hasAllDisplayed) {
        lsActivityTimer = setInterval(() => {
          const allDone = displayDailyActivities(activitiesForDate);
          if (allDone) {
            clearInterval(lsActivityTimer);
            lsActivityTimer = null;
          }
        }, 60 * 1000);
      }
    }
  }
}

/**
 * 打开每日足迹日历弹窗
 * 初始化并显示足迹日历，支持月份切换和日期选择
 */
function openActivityCalendar() {
  const modal = document.getElementById('ls-activity-calendar-modal');
  const body = document.getElementById('ls-activity-calendar-body');
  const chat = state.chats[activeLoversSpaceCharId];

  const year = currentActivityDate.getFullYear();
  const month = currentActivityDate.getMonth() + 1;
  body.innerHTML = renderActivityCalendar(year, month, chat.loversSpaceData.dailyActivity || {});

  // 使用事件委托处理弹窗内所有点击事件
  body.onclick = e => {
    const target = e.target;

    // 处理月份切换按钮点击
    if (target.closest('#ls-activity-cal-prev-btn') || target.closest('#ls-activity-cal-next-btn')) {
      const currentDisplay = body.querySelector('#ls-activity-cal-month-display').textContent;
      const [y, m] = currentDisplay.match(/\d+/g).map(Number);
      let newDate = new Date(y, m - 1, 1);

      if (target.closest('#ls-activity-cal-prev-btn')) {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      body.innerHTML = renderActivityCalendar(
        newDate.getFullYear(),
        newDate.getMonth() + 1,
        chat.loversSpaceData.dailyActivity || {},
      );
      return;
    }

    // 处理日期格子点击
    const dayCell = target.closest('.ls-calendar-day:not(.empty)');
    if (dayCell && dayCell.dataset.date) {
      const [y, m, d] = dayCell.dataset.date.split('-').map(Number);
      currentActivityDate = new Date(y, m - 1, d);
      renderLSDailyActivityForDate(chat, currentActivityDate);
      modal.classList.remove('visible');
      return;
    }

    // 处理关闭按钮点击
    if (target.closest('#ls-activity-cal-close-btn')) {
      modal.classList.remove('visible');
    }
  };

  modal.classList.add('visible');
}

/**
 * 生成足迹日历HTML
 * @param {number} year - 年份
 * @param {number} month - 月份
 * @param {object} activityData - 活动数据
 * @returns {string} 日历HTML字符串
 */
function renderActivityCalendar(year, month, activityData) {
  const date = new Date(year, month - 1, 1);
  const firstDay = date.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  let calendarHtml = `
    <div class="ls-calendar-wrapper">
        <div class="ls-calendar-header">
            <button id="ls-activity-cal-prev-btn">‹</button>
            <span id="ls-activity-cal-month-display">${year}年 ${month}月</span>
            <button id="ls-activity-cal-next-btn">›</button>
        </div>
        <div class="ls-calendar-weekdays">
            <div>日</div><div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div>
        </div>
    <div class="ls-calendar-grid">
    `;

  for (let i = 0; i < firstDay; i++) {
    calendarHtml += '<div class="ls-calendar-day empty"></div>';
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const hasActivity = !!activityData[dateStr];
    const isToday = dateStr === todayStr;

    let classes = 'ls-calendar-day';
    if (isToday) classes += ' today';
    if (hasActivity) classes += ' has-activity';

    calendarHtml += `
        <div class="${classes}" data-date="${dateStr}" style="cursor: pointer;">
            <div class="day-number">${day}</div>
            ${hasActivity ? '<span class="activity-dot">🐾</span>' : ''}
        </div>
        `;
  }
  calendarHtml += `</div></div>
    <div class="modal-footer" style="padding-top: 15px;">
        <button class="save" id="ls-activity-cal-close-btn" style="width: 100%;">关闭</button>
    </div>
    `;
  return calendarHtml;
}

/**
 * 显示当天的活动列表
 * @param {Array} activities - 当天所有活动的数组
 * @returns {boolean} - 如果所有活动都已显示，返回 true
 */
function displayDailyActivities(activities) {
  const listEl = document.getElementById('ls-activity-list');
  listEl.innerHTML = '';
  const now = Date.now();

  const visibleActivities = activities.filter(act => act.timestamp <= now);

  if (visibleActivities.length === 0) {
    listEl.innerHTML = '<p class="ls-empty-placeholder">Ta今天还没开始活动呢...</p>';
  } else {
    visibleActivities.forEach(activity => {
      const itemEl = document.createElement('div');
      itemEl.className = 'ls-activity-item';

      const activityTime = new Date(activity.timestamp);
      const timeString = `${String(activityTime.getHours()).padStart(2, '0')}:${String(
        activityTime.getMinutes(),
      ).padStart(2, '0')}`;

      const durationHtml = activity.duration ? `<span class="activity-duration">${activity.duration}</span>` : '';

      itemEl.innerHTML = `
                <span class="activity-time">${timeString}</span>
                <div class="activity-icon">${activity.icon}</div>
                <div class="activity-content">
                    <p class="activity-description">${activity.description}</p>
                    ${durationHtml}
                </div>
            `;
      listEl.appendChild(itemEl);

      // 渲染HTML小剧场（如果存在）
      if (activity.html_snippet) {
        const snippetEl = document.createElement('div');
        snippetEl.className = 'ls-activity-snippet';
        snippetEl.innerHTML = activity.html_snippet;
        listEl.appendChild(snippetEl);
      }
    });
  }

  return visibleActivities.length === activities.length;
}

/**
 * 打开文件选择器并返回本地图片的Base64编码
 * @returns {Promise<string|null>} - 返回图片的Base64 Data URL，如果用户取消则返回null
 */
function uploadImageLocally() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = e => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = readerEvent => {
          resolve(readerEvent.target.result);
        };
        reader.readAsDataURL(file);
      } else {
        resolve(null);
      }
    };

    input.click();
  });
}

/**
 * 触发AI生成一整天的手机活动记录
 * @param {object} chat - 当前角色的聊天对象
 */
async function handleGenerateDailyActivity(chat) {
  await showCustomAlert('请稍候...', `AI正在为“${chat.name}”规划一天的生活...`);

  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) {
    alert('请先配置API！');
    return;
  }

  const systemPrompt = `
        # 角色扮演任务
        你是一个手机活动模拟器。你的任务是根据角色“${chat.name}”的人设，为Ta生成一整天（从午夜0点到晚上23点）的、详细且真实的手机使用记录，根据人设规定起床时间。

        # 角色人设 (必须严格遵守)
        ${chat.settings.aiPersona}

        # 核心规则
        1.  **时间连贯性**: 你的活动记录必须按时间顺序排列，覆盖全天，禁止时间过渡过于死板。
        2.  **内容多样性**: 活动类型应丰富多样，包括但不限于应用使用、手机状态、其他（设置闹钟、查看天气等）。
        3.  **符合人设**: 所有活动都必须与角色的性格、职业和兴趣爱好高度相关。
        4.  **【【【全新功能：HTML小剧场】】】**:
            -   对于某些特定的活动（例如看电影、吃饭、购物），你可以【随机且可选地】额外生成一个名为 \`html_snippet\` 的字段。
            -   这个字段的内容是【一小段HTML代码】，用来展示一个与活动相关的视觉元素，例如电影票根、购物小票等。
            -   你【不需要】为每个活动都生成这个字段，只需在你认为合适的、有趣的节点上随机加入，以增加趣味性。
        5.  **格式铁律**: 你的回复【必须且只能】是一个严格的JSON数组，每个对象代表一条活动记录。

        # JSON对象结构 (html_snippet 是可选的！)
        {
        "time": "HH:mm",
        "description": "活动描述",
        "duration": "(可选) 持续时长",
        "icon": "单个emoji或svg图标",
        "html_snippet": "(可选) 用于生成小剧场的HTML代码"
        }

        # HTML小剧场格式示例 (供你参考，你可以自由创作):
        -   **看电影**:
            "html_snippet": "<div class='movie-ticket'><div class='ticket-header'>EPHONE影城</div><div class='ticket-body'><h3>《你的名字》</h3><p>场次: 14:30 | 7号厅 8排5座</p></div></div>"
        -   **吃饭**:
            "html_snippet": "<div class='receipt'><div class='receipt-header'>温馨小馆</div><ul><li><span>拉面 x1</span><span>￥28.00</span></li><li><span>溏心蛋 x1</span><span>￥5.00</span></li></ul><div class='receipt-total'><strong>合计:</strong><strong>￥33.00</strong></div></div>"

        现在，请开始为“${chat.name}”生成今天的生活记录。
    `;

  try {
    const messagesForApi = [{ role: 'user', content: systemPrompt }];
    let isGemini = proxyUrl === GEMINI_API_URL;
    let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi, isGemini);

    const response = await fetch(
      isGemini ? geminiConfig.url : `${proxyUrl}/v1/chat/completions`,
      isGemini
        ? geminiConfig.data
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: model,
              messages: messagesForApi,
              temperature: 1.0,
              response_format: { type: 'json_object' },
            }),
          },
    );

    if (!response.ok) throw new Error(`API请求失败: ${response.status} - ${await response.text()}`);

    const data = await response.json();
    const rawContent = (isGemini ? data.candidates[0].content.parts[0].text : data.choices[0].message.content)
      .replace(/^```json\s*|```$/g, '')
      .trim();
    console.log('【AI每日足迹 - 原始输出】:', rawContent);
    const generatedActivities = JSON.parse(rawContent);

    if (Array.isArray(generatedActivities)) {
      const today = new Date();
      const todayDateStr = today.toISOString().split('T')[0];

      // 将AI返回的时间字符串转换为完整的时间戳
      const processedActivities = generatedActivities.map(act => {
        const [hours, minutes] = act.time.split(':').map(Number);
        const activityDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
        return { ...act, timestamp: activityDate.getTime() };
      });

      // 保存到数据库
      if (!chat.loversSpaceData.dailyActivity) {
        chat.loversSpaceData.dailyActivity = {};
      }
      chat.loversSpaceData.dailyActivity[todayDateStr] = processedActivities;
      await db.chats.put(chat);

      // 重新渲染界面
      renderLSDailyActivity(chat);
    } else {
      throw new Error('AI返回的数据格式不正确。');
    }
  } catch (error) {
    console.error('生成今日足迹失败:', error);
    await showCustomAlert('生成失败', `发生了一个错误：\n${error.message}`);
    // 失败时，恢复"生成"按钮的显示
    const viewEl = document.getElementById('ls-activity-view');
    viewEl.innerHTML = `
            <div class="ls-activity-generate-container">
                <p style="color:red;">生成失败，请重试！</p>
                <button id="ls-generate-activity-btn">重新生成</button>
            </div>
        `;
    document.getElementById('ls-generate-activity-btn').onclick = () => handleGenerateDailyActivity(chat);
  }
}

/**
 * 处理更换情侣空间背景的逻辑
 */
async function handleChangeLoversSpaceBackground() {
  if (!activeLoversSpaceCharId) return;

  // 让用户选择上传方式
  const choice = await showChoiceModal('更换空间背景', [
    { text: '📁 从本地上传', value: 'local' },
    { text: '🌐 使用网络URL', value: 'url' },
  ]);

  let newBackgroundUrl = null;

  if (choice === 'local') {
    // 从本地上传图片
    newBackgroundUrl = await uploadImageLocally();
  } else if (choice === 'url') {
    // 使用网络URL
    const currentBg = state.chats[activeLoversSpaceCharId].loversSpaceData.background;
    newBackgroundUrl = await showCustomPrompt('更换背景', '请输入新的图片URL', currentBg, 'url');
  }

  // 处理新背景URL
  if (newBackgroundUrl && newBackgroundUrl.trim()) {
    const chat = state.chats[activeLoversSpaceCharId];
    chat.loversSpaceData.background = newBackgroundUrl.trim();

    // 保存到数据库并重新渲染
    await db.chats.put(chat);
    await renderLoversSpace(chat);

    alert('情侣空间背景已更新！');
  } else if (newBackgroundUrl !== null) {
    alert('请输入一个有效的URL或选择一个文件！');
  }
}

/**
 * 渲染"说说"列表
 * @param {Array} moments - 说说数组
 * @param {object} chat - 聊天对象
 */
function renderLSMoments(moments, chat) {
  const listEl = document.getElementById('ls-moments-list');
  listEl.innerHTML = '';
  if (!moments || moments.length === 0) {
    listEl.innerHTML = '<p class="ls-empty-placeholder">还没有任何悄悄话，快来发布第一条吧！</p>';
    return;
  }

  // 从新到旧显示说说
  for (let i = moments.length - 1; i >= 0; i--) {
    const moment = moments[i];
    const originalIndex = i;

    const isUser = moment.author === 'user';
    const authorName = isUser ? chat.settings.myNickname || '我' : chat.name;
    const authorAvatar = isUser ? chat.settings.myAvatar : chat.settings.aiAvatar;

    // 构建评论区HTML
    let commentsHtml = '';
    if (moment.comments && moment.comments.length > 0) {
      moment.comments.forEach((comment, commentIndex) => {
        commentsHtml += `
                    <div class="ls-comment-item">
                        <span class="commenter-name">${comment.author}:</span>
                        <span class="comment-text">${comment.text}</span>
                        <button class="ls-comment-delete-btn" data-moment-index="${originalIndex}" data-comment-index="${commentIndex}">×</button>
                    </div>
                `;
      });
    }

    const card = document.createElement('div');
    card.className = 'ls-moment-card';
    // 保存原始索引用于删除操作
    card.dataset.momentIndex = originalIndex;

    // 构建说说卡片HTML
    card.innerHTML = `
            <img src="${authorAvatar}" class="avatar">
            <div class="moment-main">
                <span class="author">${authorName}</span>
                <p class="content">${moment.content.replace(/\n/g, '<br>')}</p>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="timestamp">${formatPostTimestamp(moment.timestamp)}</span>
                </div>
                
                <!-- 评论区域 -->
                <div class="ls-moment-footer">
                    <div class="ls-moment-comments-container">
                        ${commentsHtml}
                    </div>
                    <div class="ls-comment-input-area">
                        <input type="text" placeholder="添加评论...">
                        <button class="ls-comment-send-btn">发送</button>
                    </div>
                </div>
                <!-- 评论区域结束 -->

            </div>
            <!-- 删除说说按钮 -->
            <button class="ls-moment-delete-btn" title="删除这条说说">×</button>
        `;
    listEl.appendChild(card);
  }
}

/**
 * 渲染"分享"列表
 * @param {Array} shares - 分享数组
 * @param {object} chat - 聊天对象
 */
function renderLSShares(shares, chat) {
  const listEl = document.getElementById('ls-shares-list');
  listEl.innerHTML = '';
  if (!shares || shares.length === 0) {
    listEl.innerHTML = '<p class="ls-empty-placeholder">这里还没有任何分享哦~</p>';
    return;
  }

  [...shares].reverse().forEach(share => {
    const item = document.createElement('div');
    item.className = 'ls-list-item ls-share-item';
    item.dataset.shareData = JSON.stringify(share);

    const typeText = { song: '歌曲', movie: '电影', book: '书籍', game: '游戏' }[share.shareType] || '分享';
    const authorName = share.author === 'user' ? chat.settings.myNickname || '我' : chat.name;

    // 构建分享摘要HTML
    let summaryHtml = '';

    // 歌曲显示歌手
    if (share.shareType === 'song' && share.artist) {
      summaryHtml += `<p style="margin:0; font-weight: 500;"><strong>歌手:</strong> ${share.artist}</p>`;
    }

    // 显示简介
    if (share.summary) {
      summaryHtml += `<p style="margin:0; margin-top: 4px;"><strong>简介:</strong> ${share.summary.replace(
        /\n/g,
        '<br>',
      )}</p>`;
    }

    // 显示感想
    if (share.thoughts) {
      summaryHtml += `<p style="margin:0; margin-top: 4px; color: #8a8a8a; font-style: italic;"><strong>感想:</strong> "${share.thoughts}"</p>`;
    }

    // 默认提示
    if (!summaryHtml) {
      summaryHtml = '<p style="margin:0; color: #8a8a8a;">暂无更多信息</p>';
    }

    // 构建分享项HTML
    item.innerHTML = `
            <div class="share-info">
                <div class="title">
                    <span class="share-type ${share.shareType}">${typeText}</span>
                    ${share.title}
                </div>
                <div class="summary">${summaryHtml}</div>
                <div class="meta">
                    由 ${authorName} 分享于 ${formatPostTimestamp(share.timestamp)}
                </div>
            </div>
        `;
    listEl.appendChild(item);
  });
}

/**
 * 渲染"照片"列表
 * @param {Array} photos - 照片数组
 * @param {object} chat - 聊天对象
 */
function renderLSPhotos(photos, chat) {
  const listEl = document.getElementById('ls-album-list');
  listEl.innerHTML = '';
  if (!photos || photos.length === 0) {
    listEl.innerHTML =
      '<p class="ls-empty-placeholder" style="grid-column: 1 / -1;">还没有任何照片，点击右下角"上传第一张吧！</p>';
    return;
  }

  [...photos].reverse().forEach(photo => {
    const item = document.createElement('div');
    item.className = 'ls-album-item';

    // 为每个照片项添加时间戳，用于标识和操作特定照片
    item.dataset.timestamp = photo.timestamp;

    const imageUrl = photo.type === 'image' ? photo.url : 'https://i.postimg.cc/KYr2qRCK/1.jpg';

    // 构建照片项HTML，包含背景图片和删除按钮
    item.innerHTML = `
            <div class="cover" style="background-image: url(${imageUrl});">
                <button class="ls-photo-delete-btn">×</button>
            </div>
        `;

    listEl.appendChild(item);
  });
}

/**
 * 打开创建说说的弹窗
 * 清空输入框内容并显示说说创建模态框
 */
function openMomentCreator() {
  document.getElementById('ls-moment-content-input').value = '';
  document.getElementById('ls-create-moment-modal').classList.add('visible');
}

/**
 * 用户发布说说
 * 处理用户提交的说说内容，保存到数据库并通知AI
 */
async function handlePostMoment() {
  const content = document.getElementById('ls-moment-content-input').value.trim();
  if (!content) {
    alert('内容不能为空哦！');
    return;
  }
  const chat = state.chats[activeLoversSpaceCharId];
  const newMoment = {
    author: 'user',
    content: content,
    timestamp: Date.now(),
    comments: [], // 为新说说创建一个空的评论数组
  };
  // 确保moments数组存在
  if (!chat.loversSpaceData.moments) {
    chat.loversSpaceData.moments = [];
  }
  chat.loversSpaceData.moments.push(newMoment);
  await db.chats.put(chat);

  renderLSMoments(chat.loversSpaceData.moments, chat);
  document.getElementById('ls-create-moment-modal').classList.remove('visible');

  // 创建一条对用户隐藏，但对AI可见的系统消息
  const hiddenMessage = {
    role: 'system',
    content: `[系统提示：用户（${
      chat.settings.myNickname || '我'
    }）刚刚在我们的情侣空间发布了一条新的说说，内容是："${content}"。请你根据人设，使用 'ls_comment' 指令对这条说说发表你的看法。]`,
    timestamp: Date.now(),
    isHidden: true, // 这个标记能让消息对你隐藏，但AI能看见
  };
  chat.history.push(hiddenMessage);
  await db.chats.put(chat); // 再次保存，确保隐藏消息被存入
}

/**
 * 打开上传照片的弹窗
 * 初始化照片上传模态框，重置所有输入和预览内容
 */
function openAlbumCreator() {
  tempUploadedPhotos = [];
  document.getElementById('ls-album-modal-title').textContent = '上传照片';
  // 重置所有输入框和预览
  document.getElementById('ls-photo-preview-container').innerHTML = '';
  document.getElementById('ls-photo-desc-input').value = '';
  document.getElementById('ls-text-image-desc-input').value = '';
  document.getElementById('ls-photo-input').value = null;

  // 默认显示"上传图片"模式
  document.getElementById('ls-switch-to-image-mode').click();

  document.getElementById('ls-create-album-modal').classList.add('visible');
}

/**
 * 处理用户选择照片后的预览 (单张版)
 * @param {FileList} files - 用户选择的文件列表
 */
function handlePhotoSelection(files) {
  const previewContainer = document.getElementById('ls-photo-preview-container');
  previewContainer.innerHTML = '';
  tempUploadedPhotos = [];

  const file = files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    tempUploadedPhotos.push({ url: dataUrl }); // 暂存base64

    // 显示预览图
    const previewItem = document.createElement('div');
    previewItem.className = 'ls-photo-preview-item';
    previewItem.innerHTML = `<img src="${dataUrl}">`;
    previewContainer.appendChild(previewItem);
  };
  reader.readAsDataURL(file);
}

/**
 * 用户确认上传照片 (这是修复后的版本)
 * 处理用户确认上传照片的逻辑，支持图片和文字图两种模式
 */
async function handleConfirmAlbum() {
  const chat = state.chats[activeLoversSpaceCharId];
  if (!chat) return;

  // 先判断当前是哪种模式
  const isImageMode = document.getElementById('ls-image-mode-content').classList.contains('active');
  let newPhoto;

  if (isImageMode) {
    // 如果是"上传图片"模式，执行这里的检查
    if (tempUploadedPhotos.length === 0) {
      alert('请选择一张照片！'); // 只有在这种模式下，这个提示才是正确的
      return;
    }
    const description = document.getElementById('ls-photo-desc-input').value.trim();
    if (!description) {
      alert('图片描述不能为空！');
      return;
    }
    newPhoto = {
      type: 'image',
      url: tempUploadedPhotos[0].url,
      description: description,
      timestamp: Date.now(),
    };
  } else {
    // 如果是"使用文字图"模式，执行这里的检查
    const description = document.getElementById('ls-text-image-desc-input').value.trim();
    if (!description) {
      alert('文字图描述不能为空！');
      return;
    }
    newPhoto = {
      type: 'text_image',
      description: description,
      timestamp: Date.now(),
    };
  }

  // 后续的保存和刷新逻辑保持不变
  if (!chat.loversSpaceData.photos) {
    chat.loversSpaceData.photos = [];
  }

  chat.loversSpaceData.photos.push(newPhoto);
  await db.chats.put(chat);

  renderLSPhotos(chat.loversSpaceData.photos, chat);
  document.getElementById('ls-create-album-modal').classList.remove('visible');
}

/**
 * 删除情侣空间中的一张照片
 * @param {number} timestamp - 要删除照片的时间戳
 */
async function handleDeleteLSPhoto(timestamp) {
  // 弹出确认框，防止误删
  const confirmed = await showCustomConfirm('删除照片', '确定要删除这张照片吗？此操作无法恢复。', {
    confirmButtonClass: 'btn-danger',
  });

  if (confirmed) {
    const chat = state.chats[activeLoversSpaceCharId];
    if (!chat || !chat.loversSpaceData || !chat.loversSpaceData.photos) return;

    // 从照片数组中过滤掉要删除的照片
    chat.loversSpaceData.photos = chat.loversSpaceData.photos.filter(p => p.timestamp !== timestamp);

    // 保存更新后的聊天数据
    await db.chats.put(chat);

    // 重新渲染照片列表，让删除效果立刻生效
    renderLSPhotos(chat.loversSpaceData.photos, chat);

    alert('照片已删除。');
  }
}

/**
 * 渲染"情书"列表 (已加入删除功能)
 * @param {Array} letters - 情书数组
 * @param {object} chat - 聊天对象
 */
function renderLSLetters(letters, chat) {
  const listEl = document.getElementById('ls-letters-list');
  listEl.innerHTML = ''; // 先清空
  if (!letters || letters.length === 0) {
    listEl.innerHTML = '<p class="ls-empty-placeholder">还没有任何情书，点击右下角"写下第一封吧！</p>';
    return;
  }

  // 从新到旧排序显示
  [...letters].reverse().forEach(letter => {
    const item = document.createElement('div');
    item.className = 'ls-love-letter-item';
    item.dataset.letterId = letter.id;

    const svgIcon = `
            <svg class="letter-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 7.00005L10.2 11.65C11.2667 12.45 12.7333 12.45 13.8 11.65L20 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        `;

    // 在情书项中加入删除按钮的HTML
    item.innerHTML = `
            <!-- 删除情书按钮 -->
            <button class="ls-letter-delete-btn" title="删除这封情书">×</button>

            ${svgIcon}
            <div class="letter-info">
                <div class="letter-recipient">
                    <img src="${letter.recipientAvatar}" class="avatar">
                    <span>To: ${letter.recipientName}</span>
                </div>
                <div class="letter-preview">${letter.content.substring(0, 30)}...</div>
            </div>
            <div class="letter-sender">
                <img src="${letter.senderAvatar}" class="avatar">
                <span>From: ${letter.senderName}</span>
            </div>
        `;
    listEl.appendChild(item);
  });
}

/**
 * 格式化时间戳为易读的时间显示
 * @param {number} timestamp - 时间戳
 * @returns {string} 格式化后的时间字符串
 */
function formatPostTimestamp(timestamp) {
  if (!timestamp) return '';
  const now = new Date();
  const date = new Date(timestamp);
  const diffSeconds = Math.floor((now - date) / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffMinutes < 1) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  if (now.getFullYear() === year) {
    return `${month}-${day} ${hours}:${minutes}`;
  } else {
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }
}

/**
 * 打开写情书/回信的弹窗
 * @param {object | null} replyToLetter - 如果是回信，则传入被回复的情书对象
 */
function openLoveLetterEditor(replyToLetter = null) {
  const modal = document.getElementById('ls-create-letter-modal');
  const titleEl = document.getElementById('ls-letter-modal-title');
  const recipientInput = document.getElementById('ls-letter-recipient-input');
  const contentInput = document.getElementById('ls-letter-content-input');

  const chat = state.chats[activeLoversSpaceCharId];

  if (replyToLetter) {
    // 这是回信
    titleEl.textContent = `回信给 ${replyToLetter.senderName}`;
    recipientInput.value = replyToLetter.senderName;
    contentInput.value = ''; // 清空内容
    contentInput.placeholder = `回复 ${replyToLetter.senderName} 的情书...`;
    // 暂存被回复的信，以便发送时知道是回复谁
    modal.dataset.replyingTo = JSON.stringify(replyToLetter);
  } else {
    // 这是写新信
    titleEl.textContent = `给 ${chat.name} 写一封信`;
    recipientInput.value = chat.name;
    contentInput.value = '';
    contentInput.placeholder = '在这里写下你的心意...';
    // 清除可能存在的回复标记
    delete modal.dataset.replyingTo;
  }

  modal.classList.add('visible');
}

/**
 * 处理用户点击"寄出"按钮的逻辑
 * 保存用户撰写的情书并通知AI
 */
async function handlePostLoveLetter() {
  const modal = document.getElementById('ls-create-letter-modal');
  const content = document.getElementById('ls-letter-content-input').value.trim();
  if (!content) {
    alert('情书内容不能为空哦！');
    return;
  }

  const chat = state.chats[activeLoversSpaceCharId];
  const isReply = modal.dataset.replyingTo;

  let newLetter;

  if (isReply) {
    // 如果是回信，发信人和收信人信息要反过来
    const originalLetter = JSON.parse(isReply);
    newLetter = {
      id: 'letter_' + Date.now(),
      senderId: 'user',
      senderName: chat.settings.myNickname || '我',
      senderAvatar: chat.settings.myAvatar,
      recipientName: originalLetter.senderName, // 收信人是原信的发信人
      recipientAvatar: originalLetter.senderAvatar,
      content: content,
      timestamp: Date.now(),
    };
  } else {
    // 如果是写新信
    newLetter = {
      id: 'letter_' + Date.now(),
      senderId: 'user',
      senderName: chat.settings.myNickname || '我',
      senderAvatar: chat.settings.myAvatar,
      recipientName: chat.name, // 收信人是当前角色
      recipientAvatar: chat.settings.aiAvatar,
      content: content,
      timestamp: Date.now(),
    };
  }

  // 确保 loveLetters 数组存在
  if (!chat.loversSpaceData.loveLetters) {
    chat.loversSpaceData.loveLetters = [];
  }
  chat.loversSpaceData.loveLetters.push(newLetter);

  await db.chats.put(chat);

  // 如果是用户写的信，就给AI发一个隐藏的系统通知
  if (newLetter.senderId === 'user') {
    const hiddenMessage = {
      role: 'system',
      content: `[系统提示：用户刚刚在情侣空间给你写了一封情书，内容是："${content}"。请你根据人设，使用 'ls_letter' 指令给用户写一封回信。]`,
      timestamp: Date.now(),
      isHidden: true, // 这个标记能让消息对你隐藏，但AI能看见
    };
    chat.history.push(hiddenMessage);
    await db.chats.put(chat); // 再次保存，确保隐藏消息被存入
  }

  renderLSLetters(chat.loversSpaceData.loveLetters, chat);
  modal.classList.remove('visible');
}

/**
 * 显示情书详情 (信纸样式版)
 * @param {string} letterId - 要显示的情书的ID
 */
async function showLoveLetterDetail(letterId) {
  const chat = state.chats[activeLoversSpaceCharId];
  activeLoveLetter = chat.loversSpaceData.loveLetters.find(l => l.id === letterId);
  if (!activeLoveLetter) return;

  // 获取新的信纸弹窗元素
  const modal = document.getElementById('ls-letter-viewer-modal');

  // 填充所有数据
  document.getElementById('ls-viewer-recipient-avatar').src = activeLoveLetter.recipientAvatar;
  document.getElementById('ls-viewer-recipient-name').textContent = activeLoveLetter.recipientName;
  document.getElementById('ls-viewer-body').innerHTML = activeLoveLetter.content.replace(/\n/g, '<br>'); // 正文内容
  document.getElementById('ls-viewer-sender-name').textContent = `Your dearest, ${activeLoveLetter.senderName}`; // 发信人
  document.getElementById('ls-viewer-timestamp').textContent = new Date(activeLoveLetter.timestamp).toLocaleString(); // 时间

  // 显示弹窗
  modal.classList.add('visible');
}

/**
 * 渲染情绪日记的主界面（日历和心情罐子）
 * @param {number} year - 年份
 * @param {number} month - 月份
 */
async function renderLSDiaryView(year, month) {
  const viewEl = document.getElementById('ls-diary-view');
  const chat = state.chats[activeLoversSpaceCharId];
  if (!viewEl || !chat) return;

  const diaryData = chat.loversSpaceData.emotionDiaries || {};

  // 渲染日历（使用本地函数避免与calendar.js冲突）
  viewEl.innerHTML = renderLSCalendar(year, month, diaryData);

  // 渲染心情罐子
  const jarHtml = renderMoodJar(year, month, diaryData);
  viewEl.insertAdjacentHTML('beforeend', jarHtml);
}

/**
 * 生成日历的HTML（情侣空间专用，避免与calendar.js冲突）
 * @param {number} year - 年份
 * @param {number} month - 月份
 * @param {object} diaryData - 日记数据
 * @returns {string} 日历HTML字符串
 */
function renderLSCalendar(year, month, diaryData) {
  const date = new Date(year, month - 1, 1);
  const firstDay = date.getDay(); // 0-6 (周日-周六)
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();

  let calendarHtml = `
        <div class="ls-calendar-wrapper">
            <div class="ls-calendar-header">
                <button id="ls-prev-month-btn">‹</button>
                <span id="ls-current-month-display">${year}年 ${month}月</span>
                <button id="ls-next-month-btn">›</button>
            </div>
            <div class="ls-calendar-weekdays">
                <div>日</div><div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div>
            </div>
            <div class="ls-calendar-grid">
    `;

  // 空白格子
  for (let i = 0; i < firstDay; i++) {
    calendarHtml += '<div class="ls-calendar-day empty"></div>';
  }

  // 日期格子
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayData = diaryData[dateStr] || {};
    const isToday = today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day;

    calendarHtml += `
            <div class="ls-calendar-day ${isToday ? 'today' : ''}" data-date="${dateStr}">
                <div class="day-number">${day}</div>
                <div class="mood-emojis">
                    <span class="user-emoji">${dayData.userEmoji || ''}</span>
                    <span class="char-emoji">${dayData.charEmoji || ''}</span>
                </div>
            </div>
        `;
  }
  calendarHtml += '</div></div>';
  return calendarHtml;
}

/**
 * 生成心情罐子的HTML
 * @param {number} year - 年份
 * @param {number} month - 月份
 * @param {object} diaryData - 日记数据
 * @returns {string} 心情罐子HTML字符串
 */
function renderMoodJar(year, month, diaryData) {
  let allEmojis = [];
  for (const dateStr in diaryData) {
    if (dateStr.startsWith(`${year}-${String(month).padStart(2, '0')}`)) {
      const dayData = diaryData[dateStr];
      if (dayData.userEmoji) allEmojis.push(dayData.userEmoji);
      if (dayData.charEmoji) allEmojis.push(dayData.charEmoji);
    }
  }

  let jarHtml = `
        <div class="ls-mood-jar-wrapper">
            <h3>本月心情罐子</h3>
            <div class="ls-mood-jar">
    `;

  if (allEmojis.length > 0) {
    jarHtml += allEmojis.map(emoji => `<span class="mood-emoji-item">${emoji}</span>`).join('');
  } else {
    jarHtml += '<p style="color: var(--text-secondary); font-size: 13px;">这个月还没有记录心情哦</p>';
  }

  jarHtml += '</div></div>';
  return jarHtml;
}

/**
 * 打开日记编辑/查看弹窗
 * @param {string} dateStr - 日期字符串
 */
function openDiaryModal(dateStr) {
  currentDiaryDate = dateStr;
  const chat = state.chats[activeLoversSpaceCharId];
  const diaryEntry = chat.loversSpaceData.emotionDiaries?.[dateStr];

  // 如果双方都有日记，或只有AI有日记，则打开查看器
  if (diaryEntry && (diaryEntry.userDiary || diaryEntry.charDiary)) {
    openDiaryViewer(dateStr, diaryEntry, chat);
  } else {
    // 否则，打开编辑器
    openDiaryEditor(dateStr, diaryEntry);
  }
}

/**
 * 打开日记编辑器
 * @param {string} dateStr - 日期字符串
 * @param {object} entryData - 日记条目数据
 */
function openDiaryEditor(dateStr, entryData) {
  const modal = document.getElementById('ls-diary-editor-modal');
  document.getElementById('ls-diary-editor-title').textContent = `记录 ${dateStr} 的心情`;

  const emojiSelector = document.getElementById('ls-emoji-selector');
  const emojis = ['😊', '😄', '😍', '😢', '😠', '🤔', '😴', '🤢'];
  emojiSelector.innerHTML = emojis.map(e => `<span class="emoji-option" data-emoji="${e}">${e}</span>`).join('');

  // 恢复之前的选择（如果有）
  const contentInput = document.getElementById('ls-diary-content-input');
  if (entryData && entryData.userEmoji) {
    emojiSelector.querySelector(`.emoji-option[data-emoji="${entryData.userEmoji}"]`)?.classList.add('selected');
    contentInput.value = entryData.userDiary || '';
  } else {
    contentInput.value = '';
  }

  modal.classList.add('visible');
}

/**
 * 打开日记查看器
 * @param {string} dateStr - 日期字符串
 * @param {object} entryData - 日记条目数据
 * @param {object} chat - 聊天对象
 */
function openDiaryViewer(dateStr, entryData, chat) {
  const modal = document.getElementById('ls-diary-viewer-modal');
  document.getElementById('ls-diary-viewer-title').textContent = `查看 ${dateStr} 的日记`;
  const bodyEl = document.getElementById('ls-diary-viewer-body');
  bodyEl.innerHTML = '';

  // 显示用户日记
  if (entryData.userDiary) {
    const userBlock = document.createElement('div');
    userBlock.className = 'ls-diary-entry-block';
    userBlock.innerHTML = `
            <div class="entry-header">
                <span class="mood-emoji">${entryData.userEmoji}</span>
                <span class="author">${chat.settings.myNickname || '我'}的日记</span>
            </div>
            <p class="entry-content">${entryData.userDiary.replace(/\n/g, '<br>')}</p>
        `;
    bodyEl.appendChild(userBlock);
  }

  // 显示角色日记
  if (entryData.charDiary) {
    const charBlock = document.createElement('div');
    charBlock.className = 'ls-diary-entry-block';
    charBlock.style.borderColor = '#ff8fab'; // 给角色日记一个不同的颜色
    charBlock.innerHTML = `
            <div class="entry-header">
                <span class="mood-emoji">${entryData.charEmoji}</span>
                <span class="author">${chat.name}的日记</span>
            </div>
            <p class="entry-content">${entryData.charDiary.replace(/\n/g, '<br>')}</p>
        `;
    bodyEl.appendChild(charBlock);
  } else {
    // 如果角色还没写，给个提示
    bodyEl.innerHTML += `<p style="text-align: center; color: var(--text-secondary);">Ta 还没写今天的心情日记哦~</p>`;
  }

  modal.classList.add('visible');
}

/**
 * 保存用户的日记，并触发AI写日记和回应
 */
async function handleSaveUserDiary() {
  const selectedEmojiEl = document.querySelector('#ls-emoji-selector .selected');
  const userEmoji = selectedEmojiEl ? selectedEmojiEl.dataset.emoji : null;
  const userDiary = document.getElementById('ls-diary-content-input').value.trim();

  if (!userEmoji) {
    alert('请选择一个表情代表今天的心情！');
    return;
  }
  if (!userDiary) {
    alert('日记内容不能为空哦！');
    return;
  }

  const chat = state.chats[activeLoversSpaceCharId];
  if (!chat.loversSpaceData.emotionDiaries) {
    chat.loversSpaceData.emotionDiaries = {};
  }

  // 更新或创建当天的日记数据
  if (!chat.loversSpaceData.emotionDiaries[currentDiaryDate]) {
    chat.loversSpaceData.emotionDiaries[currentDiaryDate] = {};
  }
  chat.loversSpaceData.emotionDiaries[currentDiaryDate].userEmoji = userEmoji;
  chat.loversSpaceData.emotionDiaries[currentDiaryDate].userDiary = userDiary;

  // 关闭弹窗
  document.getElementById('ls-diary-editor-modal').classList.remove('visible');
  // --- 核心联动功能开始 ---

  // 准备一条对用户可见的消息，告诉对方你写了日记
  const targetChat = state.chats[activeLoversSpaceCharId];
  if (targetChat) {
    const userNickname = state.qzoneSettings.nickname || '我';

    const notificationMessage = {
      role: 'user',
      type: 'ls_diary_notification', // 给它一个独一无二的类型
      content: {
        // 内容变成一个对象，方便携带更多信息
        userEmoji: userEmoji, // 把用户选择的表情也带上
        text: '我刚刚写了今天的心情日记哦，你也快去看看吧！',
      },
      timestamp: Date.now(),
    };
    targetChat.history.push(notificationMessage);

    // 创建一条对AI可见的【隐藏指令】，这是整个功能的核心
    const hiddenMessage = {
      role: 'system',
      content: `[系统指令：用户刚刚在情侣空间写了今天的日记。
            - 他们的心情是: ${userEmoji}
            - 日记内容是: "${userDiary}"
            你的任务:
            1.  【必须】根据你的人设和今天的聊天记录，也写一篇你自己的心情日记，并使用 'ls_diary_entry' 指令发送。
            2.  【必须】在写完日记后，立刻就用户今天的日记内容，以你的角色口吻，主动开启一段新的对话。]`,
      timestamp: Date.now() + 1, // 确保时间戳在后
      isHidden: true, // 这个标记能让消息对用户隐藏，但AI能看见
    };
    targetChat.history.push(hiddenMessage);

    // 保存所有更改到数据库
    await db.chats.put(targetChat);

    // 主动跳转到单聊界面，并触发AI响应
    openChat(activeLoversSpaceCharId);
    triggerAiResponse();
  }

  alert('日记已保存！');
}

/**
 * 渲染"情侣提问"列表
 * @param {Array} questions - 提问数组
 * @param {object} chat - 聊天对象
 */
function renderLSQuestions(questions, chat) {
  const listEl = document.getElementById('ls-questions-list');
  listEl.innerHTML = '';
  if (!questions || questions.length === 0) {
    listEl.innerHTML = '<p class="ls-empty-placeholder">还没有人提问，点击右下角"+"发起第一个提问吧！</p>';
    return;
  }

  [...questions].reverse().forEach(q => {
    const isUserQuestioner = q.questioner === 'user';
    const questionerName = isUserQuestioner ? chat.settings.myNickname || '我' : chat.name;
    const questionerAvatar = isUserQuestioner ? chat.settings.myAvatar : chat.settings.aiAvatar;

    let answerHtml = '';
    if (q.answerText) {
      const isUserAnswerer = q.answerer === 'user';
      const answererName = isUserAnswerer ? chat.settings.myNickname || '我' : chat.name;
      const answererAvatar = isUserAnswerer ? chat.settings.myAvatar : chat.settings.aiAvatar;
      answerHtml = `
                <div class="ls-answer-section">
                    <img src="${answererAvatar}" class="qa-avatar">
                    <div class="qa-main">
                        <div class="qa-header">
                            <span class="qa-author">${answererName}的回答</span>
                        </div>
                        <p class="qa-content">${q.answerText.replace(/\n/g, '<br>')}</p>
                    </div>
                </div>
            `;
    } else if (q.answerer === 'user') {
      // 如果轮到用户回答
      answerHtml = `
                <div class="ls-answer-placeholder">
                    <button class="ls-answer-btn" data-question-id="${q.id}">回答Ta的问题</button>
                </div>
            `;
    } else {
      // 如果轮到AI回答
      answerHtml = `
                <div class="ls-answer-placeholder">
                    <p style="color: var(--text-secondary); font-size: 14px;">等待Ta的回答...</p>
                </div>
            `;
    }

    const card = document.createElement('div');
    card.className = 'ls-question-card';

    // 在提问卡片中加入删除按钮
    card.innerHTML = `
            <button class="ls-question-delete-btn" data-question-id="${q.id}" title="删除此提问">×</button>

            <div class="ls-question-section">
                <img src="${questionerAvatar}" class="qa-avatar">
                <div class="qa-main">
                    <div class="qa-header">
                        <span class="qa-author">${questionerName}的提问</span>
                        <span class="qa-timestamp">${formatPostTimestamp(q.timestamp)}</span>
                    </div>
                    <p class="qa-content">${q.questionText.replace(/\n/g, '<br>')}</p>
                </div>
            </div>
            ${answerHtml}
        `;
    listEl.appendChild(card);
  });
}

/**
 * 打开提问弹窗
 * 清空输入框内容并显示提问模态框
 */
function openQuestionAsker() {
  document.getElementById('ls-question-content-input').value = '';
  document.getElementById('ls-ask-question-modal').classList.add('visible');
}

/**
 * 用户发布一个新提问
 * 处理用户提交的提问内容，保存到数据库并通知AI
 */
async function handlePostQuestion() {
  const content = document.getElementById('ls-question-content-input').value.trim();
  if (!content) {
    alert('问题内容不能为空！');
    return;
  }
  const chat = state.chats[activeLoversSpaceCharId];
  const newQuestion = {
    id: 'q_' + Date.now(),
    questioner: 'user',
    questionText: content,
    timestamp: Date.now(),
    answerer: 'char', // 指定由AI来回答
    answerText: null,
  };

  if (!chat.loversSpaceData.questions) {
    chat.loversSpaceData.questions = [];
  }
  chat.loversSpaceData.questions.push(newQuestion);
  await db.chats.put(chat);

  renderLSQuestions(chat.loversSpaceData.questions, chat);
  document.getElementById('ls-ask-question-modal').classList.remove('visible');

  // 创建一条对用户隐藏，但对AI可见的系统消息
  const hiddenMessage = {
    role: 'system',
    content: `[系统提示：用户在情侣空间向你提了一个问题："${content}"，问题ID是"${newQuestion.id}"。请使用 'ls_answer_question' 指令来回答。]`,
    timestamp: Date.now(),
    isHidden: true,
  };
  chat.history.push(hiddenMessage);
  await db.chats.put(chat);
}

/**
 * 打开回答问题的弹窗
 * @param {string} questionId - 问题ID
 */
function openAnswerEditor(questionId) {
  const chat = state.chats[activeLoversSpaceCharId];
  const question = chat.loversSpaceData.questions.find(q => q.id === questionId);
  if (!question) return;

  activeQuestionId = questionId;
  document.getElementById('ls-answer-question-text').textContent = question.questionText;
  document.getElementById('ls-answer-content-input').value = '';
  document.getElementById('ls-answer-question-modal').classList.add('visible');
}

/**
 * 用户提交回答
 * 处理用户提交的回答内容，保存到数据库并通知AI
 */
async function handlePostAnswer() {
  if (!activeQuestionId) return;
  const answerText = document.getElementById('ls-answer-content-input').value.trim();
  if (!answerText) {
    alert('回答内容不能为空！');
    return;
  }
  const chat = state.chats[activeLoversSpaceCharId];
  const question = chat.loversSpaceData.questions.find(q => q.id === activeQuestionId);
  if (question) {
    question.answerer = 'user'; // 明确回答者是用户
    question.answerText = answerText;
    await db.chats.put(chat);

    const hiddenMessage = {
      role: 'system',
      content: `[系统提示：用户（${
        chat.settings.myNickname || '我'
      }）刚刚在情侣空间回答了你之前提出的问题。你的问题是："${
        question.questionText
      }"，用户的回答是："${answerText}"。]`,
      timestamp: Date.now(),
      isHidden: true,
    };
    chat.history.push(hiddenMessage);
    await db.chats.put(chat);

    renderLSQuestions(chat.loversSpaceData.questions, chat);
  }
  document.getElementById('ls-answer-question-modal').classList.remove('visible');
  activeQuestionId = null;
}

/**
 * 删除一条情侣提问
 * @param {string} questionId - 要删除的提问的ID
 */
async function handleDeleteLSQuestion(questionId) {
  // 弹出确认框，防止误删
  const confirmed = await showCustomConfirm('删除提问', '确定要删除这个问题以及对应的回答吗？此操作无法恢复。', {
    confirmButtonClass: 'btn-danger',
  });

  // 如果用户确认删除
  if (confirmed) {
    const chat = state.chats[activeLoversSpaceCharId];
    if (!chat || !chat.loversSpaceData || !chat.loversSpaceData.questions) return;

    // 从提问数组中过滤掉要删除的提问
    chat.loversSpaceData.questions = chat.loversSpaceData.questions.filter(q => q.id !== questionId);

    // 保存更新后的聊天数据
    await db.chats.put(chat);

    // 重新渲染提问列表，让删除效果立刻生效
    renderLSQuestions(chat.loversSpaceData.questions, chat);

    alert('提问已删除。');
  }
}

/**
 * 当用户在情侣空间点击一首分享的歌曲时触发
 * @param {object} shareData - 包含歌曲信息的分享对象
 */
async function openLoversSpaceMusicPlayer(shareData) {
  await showCustomAlert('请稍候...', `正在为《${shareData.title}》寻找播放资源...`);

  // 检查播放列表是否已经有这首歌了
  const existingIndex = lsMusicState.playlist.findIndex(
    song => song.name === shareData.title && song.artist === shareData.artist,
  );

  if (existingIndex > -1) {
    // 如果已经存在，直接播放并打开播放器
    playLSSong(existingIndex);
    document.getElementById('ls-music-player-overlay').classList.add('visible');
    return;
  }

  // 如果不存在，开始搜索
  let songData = null;
  const songName = shareData.title;
  const artistName = shareData.artist || '';

  // 策略1：优先用网易云搜索 (通常结果更准)
  const neteaseResults = await searchNeteaseMusic(songName, artistName);
  if (neteaseResults.length > 0) {
    songData = neteaseResults[0];
  } else {
    // 策略2：如果网易云找不到，再用QQ音乐搜一次
    const tencentResults = await searchTencentMusic(songName);
    if (tencentResults.length > 0) {
      songData = tencentResults[0];
    }
  }

  if (!songData) {
    await showCustomAlert('播放失败', `抱歉，在网易云和QQ音乐都没能找到《${songName}》的可播放资源。`);
    return;
  }

  // 获取播放链接
  const apiUrl =
    songData.source === 'netease'
      ? `https://api.vkeys.cn/v2/music/netease?id=${songData.id}`
      : `https://api.vkeys.cn/v2/music/tencent?id=${songData.id}`;

  const result = await Http_Get(apiUrl);

  if (!result?.data?.url || !(await checkAudioAvailability(result.data.url))) {
    await showCustomAlert('获取失败', `找到了《${songName}》，但无法获取有效的播放链接。`);
    return;
  }

  // 获取歌词
  const lrcContent = (await getLyricsForSong(songData.id, songData.source)) || '';

  // 创建新的歌曲对象并添加到播放列表
  const newSong = {
    name: songData.name,
    artist: songData.artist,
    src: result.data.url,
    cover: songData.cover,
    lrcContent: lrcContent,
  };

  lsMusicState.playlist.push(newSong);

  // 播放这首新添加的歌曲
  playLSSong(lsMusicState.playlist.length - 1);

  // 打开播放器
  document.getElementById('ls-music-player-overlay').classList.add('visible');
}

/**
 * 播放指定索引的歌曲
 * @param {number} index - 歌曲在播放列表中的索引
 */
async function playLSSong(index) {
  if (index < 0 || index >= lsMusicState.playlist.length) return;

  lsMusicState.currentIndex = index;
  const track = lsMusicState.playlist[index];
  const lsAudioPlayer = document.getElementById('ls-audio-player');

  // 解析和渲染歌词
  track.parsedLyrics = parseLRC(track.lrcContent || ''); // 复用已有的歌词解析函数
  track.currentLyricIndex = -1;
  renderLSLyrics(track);

  lsAudioPlayer.src = track.src;
  try {
    await lsAudioPlayer.play();
    lsMusicState.isPlaying = true;
  } catch (error) {
    console.error('情侣空间音乐播放失败:', error);
    lsMusicState.isPlaying = false;
  }

  renderLSMusicPlayerUI();
  renderLSMusicPlaylist();
}

/**
 * 切换播放/暂停状态 (情侣空间版)
 */
function toggleLSMusicPlayPause() {
  const lsAudioPlayer = document.getElementById('ls-audio-player');
  if (lsMusicState.currentIndex === -1 && lsMusicState.playlist.length > 0) {
    // 如果列表有歌但还没开始播，点击播放就从第一首开始
    playLSSong(0);
    return;
  }

  if (lsAudioPlayer.paused) {
    lsAudioPlayer.play();
    lsMusicState.isPlaying = true;
  } else {
    lsAudioPlayer.pause();
    lsMusicState.isPlaying = false;
  }
  renderLSMusicPlayerUI();
}

/**
 * 播放下一首 (情侣空间版)
 */
function playNextLSSong() {
  if (lsMusicState.playlist.length === 0) return;
  const newIndex = (lsMusicState.currentIndex + 1) % lsMusicState.playlist.length;
  playLSSong(newIndex);
}

/**
 * 播放上一首 (情侣空间版)
 */
function playPrevLSSong() {
  if (lsMusicState.playlist.length === 0) return;
  const newIndex = (lsMusicState.currentIndex - 1 + lsMusicState.playlist.length) % lsMusicState.playlist.length;
  playLSSong(newIndex);
}

/**
 * 更新播放器界面 (情侣空间版)
 */
function renderLSMusicPlayerUI() {
  const track = lsMusicState.playlist[lsMusicState.currentIndex];

  if (track) {
    document.getElementById('ls-album-cover').src = track.cover;
    document.getElementById('ls-song-title').textContent = track.name;
    document.getElementById('ls-artist').textContent = track.artist;
  } else {
    document.getElementById('ls-album-cover').src = 'https://i.postimg.cc/pT2xKzPz/album-cover-placeholder.png';
    document.getElementById('ls-song-title').textContent = '暂无歌曲';
    document.getElementById('ls-artist').textContent = '...';
  }

  document.getElementById('ls-play-pause-btn').textContent = lsMusicState.isPlaying ? '❚❚' : '▶';
}

/**
 * 更新进度条 (情侣空间版)
 */
function updateLSProgressBar() {
  const lsAudioPlayer = document.getElementById('ls-audio-player');
  const currentTimeEl = document.getElementById('ls-current-time');
  const totalTimeEl = document.getElementById('ls-total-time');
  const progressFillEl = document.getElementById('ls-progress-fill');

  if (!lsAudioPlayer.duration) {
    currentTimeEl.textContent = '0:00';
    totalTimeEl.textContent = '0:00';
    progressFillEl.style.width = '0%';
    return;
  }

  const progressPercent = (lsAudioPlayer.currentTime / lsAudioPlayer.duration) * 100;
  progressFillEl.style.width = `${progressPercent}%`;
  currentTimeEl.textContent = formatMusicTime(lsAudioPlayer.currentTime);
  totalTimeEl.textContent = formatMusicTime(lsAudioPlayer.duration);
  updateLSCurrentLyric(lsAudioPlayer.currentTime);
}

/**
 * 渲染播放列表 (情侣空间版)
 */
function renderLSMusicPlaylist() {
  const playlistBody = document.getElementById('ls-playlist-body');
  playlistBody.innerHTML = '';

  if (lsMusicState.playlist.length === 0) {
    playlistBody.innerHTML = '<p style="text-align:center; padding: 20px; color: #888;">播放列表是空的</p>';
    return;
  }

  lsMusicState.playlist.forEach((track, index) => {
    const item = document.createElement('div');
    item.className = 'playlist-item';
    if (index === lsMusicState.currentIndex) {
      item.classList.add('playing');
    }
    item.innerHTML = `
            <div class="playlist-item-info">
                <div class="title">${track.name}</div>
                <div class="artist">${track.artist}</div>
            </div>
            <div class="playlist-item-actions">
                <span class="playlist-action-btn delete-track-btn" data-index="${index}">×</span>
            </div>
        `;
    item.querySelector('.playlist-item-info').addEventListener('click', () => playLSSong(index));
    playlistBody.appendChild(item);
  });
}

/**
 * 渲染歌词列表 (情侣空间版)
 * @param {object} track - 歌曲对象
 */
function renderLSLyrics(track) {
  const lyricsList = document.getElementById('ls-lyrics-list');
  lyricsList.innerHTML = '';
  if (!track.parsedLyrics || track.parsedLyrics.length === 0) {
    lyricsList.innerHTML = '<div class="lyric-line active">♪ 暂无歌词 ♪</div>';
    return;
  }
  track.parsedLyrics.forEach((line, index) => {
    const lineEl = document.createElement('div');
    lineEl.className = 'lyric-line';
    lineEl.textContent = line.text;
    lineEl.dataset.index = index;
    lyricsList.appendChild(lineEl);
  });
  lyricsList.style.transform = `translateY(45%)`; // 初始位置
}

/**
 * 更新当前高亮的歌词 (情侣空间版)
 * @param {number} currentTime - 当前播放时间
 */
function updateLSCurrentLyric(currentTime) {
  const track = lsMusicState.playlist[lsMusicState.currentIndex];
  if (!track || !track.parsedLyrics || track.parsedLyrics.length === 0) return;

  let newLyricIndex = -1;
  for (let i = 0; i < track.parsedLyrics.length; i++) {
    if (currentTime >= track.parsedLyrics[i].time) {
      newLyricIndex = i;
    } else {
      break;
    }
  }

  if (newLyricIndex !== track.currentLyricIndex) {
    track.currentLyricIndex = newLyricIndex;

    const lyricsList = document.getElementById('ls-lyrics-list');
    const container = document.getElementById('ls-lyrics-container');

    lyricsList.querySelectorAll('.lyric-line').forEach(line => line.classList.remove('active'));

    if (newLyricIndex > -1) {
      const activeLine = lyricsList.querySelector(`.lyric-line[data-index="${newLyricIndex}"]`);
      if (activeLine) {
        activeLine.classList.add('active');
        // 计算滚动偏移量，让高亮行垂直居中
        const offset = container.offsetHeight / 2 - activeLine.offsetTop - activeLine.offsetHeight / 2;
        lyricsList.style.transform = `translateY(${offset}px)`;
      }
    }
  }
}

/**
 * 清空播放列表 (情侣空间版)
 */
function clearLSMusicPlaylist() {
  const lsAudioPlayer = document.getElementById('ls-audio-player');
  lsAudioPlayer.pause();
  lsAudioPlayer.src = '';

  lsMusicState.playlist = [];
  lsMusicState.currentIndex = -1;
  lsMusicState.isPlaying = false;

  renderLSMusicPlayerUI();
  renderLSMusicPlaylist();
}

/**
 * 打开番茄钟主页并渲染历史记录
 */
async function openPomodoroScreen() {
  if (!activeLoversSpaceCharId) return;
  await renderPomodoroHistory(activeLoversSpaceCharId);

  // 确保显示的是主页，而不是计时器界面
  document.getElementById('ls-pomodoro-home').style.display = 'flex';
  document.getElementById('ls-pomodoro-timer-active').style.display = 'none';
}

/**
 * 渲染指定角色的番茄钟历史记录
 * @param {string} charId - 角色ID
 */
async function renderPomodoroHistory(charId) {
  const listEl = document.getElementById('ls-pomodoro-history-list');
  listEl.innerHTML = '';
  const sessions = await db.pomodoroSessions.where('chatId').equals(charId).reverse().sortBy('startTime');

  if (sessions.length === 0) {
    listEl.innerHTML =
      '<p style="text-align:center; color: var(--text-secondary); font-size: 14px;">还没有专注记录哦</p>';
    return;
  }

  sessions.forEach(session => {
    const item = document.createElement('div');
    item.className = 'pomodoro-history-item';
    item.dataset.sessionId = session.id;
    item.innerHTML = `
            <div class="task">${session.task}</div>
            <div class="meta">
                ${new Date(session.startTime).toLocaleString()} | 专注了 ${Math.round(session.duration / 60)} 分钟
            </div>
        `;
    item.addEventListener('click', () => showPomodoroHistoryDetail(session.id));
    listEl.appendChild(item);
  });
}

/**
 * 显示指定历史记录的聊天详情
 * @param {number} sessionId - 记录的ID
 */
async function showPomodoroHistoryDetail(sessionId) {
  const session = await db.pomodoroSessions.get(sessionId);
  if (!session) return;

  const modal = document.getElementById('ls-pomodoro-history-viewer-modal');
  const titleEl = document.getElementById('pomodoro-history-viewer-title');
  const contentEl = document.getElementById('pomodoro-history-viewer-content');

  titleEl.textContent = `"${session.task}"的专注记录`;
  contentEl.innerHTML = '';

  if (session.log && session.log.length > 0) {
    session.log.forEach(logEntry => {
      const bubble = document.createElement('div');
      bubble.className = 'pomodoro-log-bubble';
      bubble.textContent = logEntry.content;
      contentEl.appendChild(bubble);
    });
  } else {
    contentEl.innerHTML =
      '<p style="text-align:center; color: var(--text-secondary);">这次专注期间没有聊天记录哦。</p>';
  }

  modal.classList.add('visible');
}

/**
 * 打开番茄钟设置弹窗
 */
function openPomodoroSetup() {
  document.getElementById('pomodoro-task-input').value = '';
  document.getElementById('pomodoro-duration-input').value = '25';
  document.getElementById('pomodoro-talk-interval-input').value = '5';
  document.getElementById('pomodoro-bg-url-input').value = '';

  // 每次打开时，清空上一次本地上传的临时数据
  pomodoroState.tempBgDataUrl = null;

  document.getElementById('ls-pomodoro-setup-modal').classList.add('visible');
}

/**
 * 开始番茄钟专注会话
 */
async function startPomodoroSession() {
  const task = document.getElementById('pomodoro-task-input').value.trim();
  // 获取用户选择的计时模式
  const timerType = document.querySelector('input[name="pomodoro-mode"]:checked').value;
  const durationMinutes = parseInt(document.getElementById('pomodoro-duration-input').value);
  const talkIntervalMinutes = parseInt(document.getElementById('pomodoro-talk-interval-input').value);
  const bgUrl = pomodoroState.tempBgDataUrl || document.getElementById('pomodoro-bg-url-input').value.trim();

  if (!task) {
    alert('请输入一个专注任务！');
    return;
  }
  // 如果是倒计时模式，才需要检查时长是否有效
  if (timerType === 'countdown' && (isNaN(durationMinutes) || durationMinutes < 1)) {
    alert('倒计时模式下，请输入有效的专注时长！');
    return;
  }

  const chat = state.chats[activeLoversSpaceCharId];
  // 根据模式，设置总时长（正计时模式总时长为0，因为它会一直增加）
  const durationSeconds = timerType === 'countdown' ? durationMinutes * 60 : 0;

  pomodoroState.currentSession = {
    chatId: activeLoversSpaceCharId,
    task: task,
    duration: durationSeconds,
    timerType: timerType, // 把计时模式也保存到会话记录里
    startTime: Date.now(),
    log: [],
  };

  const timerView = document.getElementById('ls-pomodoro-timer-active');
  document.getElementById('ls-pomodoro-home').style.display = 'none';
  timerView.style.display = 'flex';

  if (bgUrl) {
    timerView.style.backgroundImage = `url(${bgUrl})`;
  } else {
    timerView.style.backgroundImage = `url(${chat.settings.aiAvatar})`;
  }

  document.getElementById('pomodoro-char-avatar').src = chat.settings.aiAvatar;
  document.getElementById('pomodoro-current-task').textContent = task;

  // 根据模式，设置计时器的初始值
  let timeTracker = timerType === 'countdown' ? durationSeconds : 0;
  updatePomodoroTimerDisplay(timeTracker);

  pomodoroState.timerId = setInterval(() => {
    // 根据模式决定是增加还是减少时间
    if (timerType === 'countdown') {
      timeTracker--;
      if (timeTracker <= 0) {
        updatePomodoroTimerDisplay(0); // 确保显示00:00
        endPomodoroSession(true); // 倒计时结束
      }
    } else {
      // 'countup'
      timeTracker++;
    }
    updatePomodoroTimerDisplay(timeTracker);
  }, 1000);
  if (talkIntervalMinutes > 0) {
    pomodoroState.periodicTalkTimerId = setInterval(() => {
      // 现在它会调用API来生成话语
      triggerPomodoroAIResponse('periodic_encouragement');
    }, talkIntervalMinutes * 60 * 1000);
  }
  pomodoroState.isActive = true;
  document.getElementById('ls-pomodoro-setup-modal').classList.remove('visible');

  const hiddenMessage = {
    role: 'system',
    content: `[系统指令：用户刚刚和你一起开始了一个番茄钟专注任务："${task}"，时长为${durationMinutes}分钟。在专注期间，你可以通过 "pomodoro_talk" 指令来鼓励用户。]`,
    timestamp: Date.now(),
    isHidden: true,
  };
  chat.history.push(hiddenMessage);
  await db.chats.put(chat);
}

/**
 * 更新番茄钟的倒计时显示
 * @param {number} secondsLeft - 剩余秒数
 */
function updatePomodoroTimerDisplay(secondsLeft) {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  document.getElementById('pomodoro-time').textContent = `${String(minutes).padStart(2, '0')}:${String(
    seconds,
  ).padStart(2, '0')}`;
}

/**
 * 结束番茄钟专注会话
 * @param {boolean} isCompleted - 是否完成专注
 */
async function endPomodoroSession(isCompleted = false) {
  if (!pomodoroState.isActive) return;

  clearInterval(pomodoroState.timerId);
  clearInterval(pomodoroState.periodicTalkTimerId);

  // 在保存前，根据计时模式重新计算并更新最终的专注时长
  if (pomodoroState.currentSession.timerType === 'countup') {
    // 对于正计时，时长是结束时间减去开始时间
    pomodoroState.currentSession.duration = Math.floor((Date.now() - pomodoroState.currentSession.startTime) / 1000);
  }

  pomodoroState.currentSession.endTime = Date.now();
  await db.pomodoroSessions.add(pomodoroState.currentSession);

  document.getElementById('ls-pomodoro-timer-active').style.display = 'none';
  document.getElementById('ls-pomodoro-home').style.display = 'flex';
  await renderPomodoroHistory(activeLoversSpaceCharId);

  pomodoroState = { isActive: false, timerId: null, periodicTalkTimerId: null, currentSession: null };

  const chat = state.chats[activeLoversSpaceCharId];
  const endReason = isCompleted ? '时间到了，任务已完成' : '被用户手动中断';
  const hiddenMessage = {
    role: 'system',
    content: `[系统指令：番茄钟专注任务已结束。结束原因：${endReason}。]`,
    timestamp: Date.now(),
    isHidden: true,
  };
  chat.history.push(hiddenMessage);
  await db.chats.put(chat);

  if (isCompleted) {
    showCustomAlert('专注完成！', '恭喜你完成了一次专注时光，休息一下吧！');
  } else {
    showCustomAlert('专注结束', '你中断了本次专注。');
  }
}

/**
 * 触发番茄钟期间的AI互动
 * @param {string} triggerType - 触发类型, 'user_click' 或 'periodic_encouragement'
 */
async function triggerPomodoroAIResponse(triggerType) {
  if (!pomodoroState.isActive || !activeLoversSpaceCharId) return;

  const chat = state.chats[activeLoversSpaceCharId];
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) {
    console.warn('番茄钟AI互动失败：API未配置。');
    return;
  }

  const elapsedSeconds = Math.floor((Date.now() - pomodoroState.currentSession.startTime) / 1000);
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const timeContext = `用户已经持续专注了 ${elapsedMinutes} 分钟。`;
  const triggerReason =
    triggerType === 'user_click' ? '用户刚刚点击了你的头像，似乎需要一些鼓励。' : '到了你主动鼓励用户的时间。';

  const systemPrompt = `
# 任务
你正在和用户一起进行番茄钟专注。
- 你们正在进行的任务是: "${pomodoroState.currentSession.task}"
- ${timeContext}
- 触发本次对话的原因是: ${triggerReason}
- 你的角色人设: ${chat.settings.aiPersona}
- 你的聊天对象(用户)的人设: ${chat.settings.myPersona}

# 核心规则
1.  **保持专注**: 你的回复要更丰富、更有内容，大约50字左右，目的是帮助用户继续专注于任务，而不是闲聊。
2.  **格式铁律**: 你的回复【必须且只能】是一个严格的JSON对象，格式如下: \`{"type": "pomodoro_talk", "content": "你的鼓励语..."}\`

现在，请生成你的鼓励语。`;

  const userMessage = {
    role: 'user',
    content: `请根据你和我的角色人设，对我正在进行的"${pomodoroState.currentSession.task}"任务，说一段鼓励的话。`,
  };

  try {
    let isGemini = proxyUrl === GEMINI_API_URL;

    let requestBody;
    let requestUrl = `${proxyUrl}/v1/chat/completions`;
    let requestHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getRandomValue(apiKey)}`,
    };

    if (isGemini) {
      requestUrl = `${GEMINI_API_URL}/${model}:generateContent?key=${getRandomValue(apiKey)}`;
      requestHeaders = { 'Content-Type': 'application/json' };
      requestBody = {
        contents: [userMessage],
        generationConfig: {
          temperature: parseFloat(state.apiConfig.temperature) || 0.8,
          response_mime_type: 'application/json',
        },
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
      };
    } else {
      requestBody = {
        model: model,
        messages: [{ role: 'system', content: systemPrompt }, userMessage],
        temperature: parseFloat(state.apiConfig.temperature) || 0.8,
        response_format: { type: 'json_object' },
      };
    }

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API请求失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const rawContent = (isGemini ? data.candidates[0].content.parts[0].text : data.choices[0].message.content)
      .replace(/^```json\s*|```$/g, '')
      .trim();
    const responseObj = JSON.parse(rawContent);

    if (responseObj.type === 'pomodoro_talk' && responseObj.content) {
      const logEntry = { timestamp: Date.now(), content: responseObj.content };
      pomodoroState.currentSession.log.push(logEntry);

      const logEl = document.getElementById('pomodoro-char-log');
      logEl.textContent = responseObj.content;
      logEl.classList.add('visible');
      setTimeout(() => {
        logEl.classList.remove('visible');
      }, 4000);
    }
  } catch (error) {
    console.error('番茄钟AI互动失败:', error);
    const logEl = document.getElementById('pomodoro-char-log');
    logEl.textContent = `[错误: API调用失败，请检查F12控制台]`;
    logEl.classList.add('visible');
    setTimeout(() => {
      logEl.classList.remove('visible');
    }, 10000);
  }
}

/**
 * 发送情侣空间邀请
 * @param {string} targetChatId - 被邀请的角色ID
 */
async function sendLoversSpaceInvitation(targetChatId) {
  const chat = state.chats[targetChatId];
  if (!chat) return;

  const myNickname = state.qzoneSettings.nickname || '我';

  // 创建对用户可见的"邀请卡片"消息
  const visibleMessage = {
    role: 'user',
    senderName: myNickname,
    type: 'lovers_space_invitation',
    content: `${myNickname} 对 ${chat.name} 发送了一个情侣空间邀请`,
    timestamp: Date.now(),
    status: 'pending', // 状态：pending, accepted, rejected
  };
  chat.history.push(visibleMessage);

  // 创建对AI可见的"隐藏指令"消息
  const hiddenMessage = {
    role: 'system',
    content: `[系统指令：用户刚刚向你发起了"开启情侣空间"的邀请。请你根据人设，决定是否同意，并使用 'lovers_space_response' 指令回应。]`,
    timestamp: Date.now() + 1,
    isHidden: true,
  };
  chat.history.push(hiddenMessage);

  // 保存并触发AI响应
  await db.chats.put(chat);
  triggerAiResponse();
}

/**
 * 处理用户对情侣空间邀请的回应
 * @param {number} timestamp - 被回应的邀请消息的时间戳
 * @param {string} choice - 用户的选择, 'accepted' 或 'rejected'
 */
async function handleLoversSpaceResponse(timestamp, choice) {
  const chat = state.chats[state.activeChatId];
  if (!chat) return;

  const invitationMsg = chat.history.find(m => m.timestamp === timestamp);
  if (!invitationMsg || invitationMsg.status !== 'pending') return;

  // 更新原始邀请卡片的状态
  invitationMsg.status = choice;

  // 根据用户的选择执行操作
  if (choice === 'accepted') {
    // 如果同意，就为这个角色创建情侣空间数据
    chat.loversSpaceData = {
      background: 'https://i.postimg.cc/k495F4W5/profile-banner.jpg',
      relationshipStartDate: null,
      moments: [],
      albums: [],
      loveLetters: [],
      shares: [],
      questions: [],
    };

    // 创建一条对用户可见的系统通知
    const systemNotice = {
      role: 'system',
      type: 'pat_message',
      content: `[系统：你和"${chat.name}"的情侣空间已成功开启！]`,
      timestamp: Date.now(),
    };
    chat.history.push(systemNotice);
  }

  // 创建一条对用户隐藏，但对AI可见的系统指令，告诉AI你的决定
  const hiddenMessage = {
    role: 'system',
    content: `[系统指令：用户${choice === 'accepted' ? '同意了' : '拒绝了'}你开启情侣空间的邀请。]`,
    timestamp: Date.now() + 1,
    isHidden: true,
  };
  chat.history.push(hiddenMessage);

  // 保存所有更改到数据库
  await db.chats.put(chat);

  // 刷新聊天界面，并触发AI的回应
  renderChatInterface(state.activeChatId);
  triggerAiResponse();
}

/**
 * 初始化情侣空间功能
 * 绑定所有相关事件监听器
 */
function initLoversSpace() {
  document.getElementById('ls-change-bg-btn').addEventListener('click', handleChangeLoversSpaceBackground);

  // 绑定主屏幕App图标的点击事件
  document.getElementById('lovers-space-app-icon').addEventListener('click', openLoversSpaceEntry);

  document.getElementById('ls-char-selector-list').addEventListener('click', async e => {
    const item = e.target.closest('.chat-list-item');
    if (item && item.dataset.chatId) {
      const chatId = item.dataset.chatId;
      const chat = state.chats[chatId];

      // 关闭选择弹窗
      document.getElementById('ls-char-selector-modal').classList.remove('visible');

      // 判断情侣空间状态
      if (chat.loversSpaceData) {
        // 如果已开通，直接进入
        openLoversSpace(chatId);
      } else {
        // 如果未开通，弹窗确认是否发送邀请
        const confirmed = await showCustomConfirm(
          '邀请开启情侣空间',
          `你和"${chat.name}"的情侣空间还未开启，要现在邀请Ta吗？`,
        );
        if (confirmed) {
          // 如果用户确认，发送邀请并跳转到聊天界面
          await sendLoversSpaceInvitation(chatId);
          openChat(chatId);
        }
      }
    }
  });

  document.getElementById('ls-cancel-switch-char-btn').addEventListener('click', () => {
    document.getElementById('ls-char-selector-modal').classList.remove('visible');
  });
  document.getElementById('ls-switch-char-btn').addEventListener('click', openCharSelectorForLoversSpace);

  // 绑定页签切换事件
  document.getElementById('ls-tab-bar').addEventListener('click', e => {
    const tab = e.target.closest('.ls-tab-item');
    if (tab && tab.dataset.view) {
      const viewId = tab.dataset.view;
      // 切换高亮和视图
      document.querySelectorAll('.ls-tab-item').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      switchLoversSpaceTab(viewId);

      // 根据点击的页签，渲染对应的内容
      const chat = state.chats[activeLoversSpaceCharId];
      if (!chat) return;

      if (viewId === 'ls-moments-view') {
        renderLSMoments(chat.loversSpaceData.moments, chat);
      } else if (viewId === 'ls-album-view') {
        renderLSPhotos(chat.loversSpaceData.photos, chat);
      } else if (viewId === 'ls-letters-view') {
        renderLSLetters(chat.loversSpaceData.loveLetters, chat);
      } else if (viewId === 'ls-questions-view') {
        renderLSQuestions(chat.loversSpaceData.questions, chat);
      } else if (viewId === 'ls-diary-view') {
        const now = new Date();
        renderLSDiaryView(now.getFullYear(), now.getMonth() + 1);
      } else if (viewId === 'ls-shares-view') {
        renderLSShares(chat.loversSpaceData.shares, chat);
      } else if (viewId === 'ls-pomodoro-view') {
        openPomodoroScreen();
      }
    }
  });

  // 绑定"说说"功能的按钮
  document.getElementById('ls-add-moment-btn').addEventListener('click', openMomentCreator);
  document.getElementById('ls-cancel-moment-btn').addEventListener('click', () => {
    document.getElementById('ls-create-moment-modal').classList.remove('visible');
  });
  document.getElementById('ls-confirm-moment-btn').addEventListener('click', handlePostMoment);

  // 绑定"相册"功能的按钮
  document.getElementById('ls-add-album-btn').addEventListener('click', openAlbumCreator);
  document.getElementById('ls-select-photos-btn').addEventListener('click', () => {
    document.getElementById('ls-photo-input').click();
  });
  document.getElementById('ls-photo-input').addEventListener('change', e => {
    handlePhotoSelection(e.target.files);
  });
  // 绑定新弹窗里的模式切换按钮
  const lsImageModeBtn = document.getElementById('ls-switch-to-image-mode');
  const lsTextImageModeBtn = document.getElementById('ls-switch-to-text-image-mode');
  const lsImageModeContent = document.getElementById('ls-image-mode-content');
  const lsTextImageModeContent = document.getElementById('ls-text-image-mode-content');
  lsImageModeBtn.addEventListener('click', () => {
    lsImageModeBtn.classList.add('active');
    lsTextImageModeBtn.classList.remove('active');
    lsImageModeContent.classList.add('active');
    lsTextImageModeContent.classList.remove('active');
    lsImageModeContent.style.display = 'block';
    lsTextImageModeContent.style.display = 'none';
  });

  lsTextImageModeBtn.addEventListener('click', () => {
    lsTextImageModeBtn.classList.add('active');
    lsImageModeBtn.classList.remove('active');
    lsTextImageModeContent.classList.add('active');
    lsImageModeContent.classList.remove('active');
    lsTextImageModeContent.style.display = 'block';
    lsImageModeContent.style.display = 'none';
  });

  document.getElementById('ls-cancel-album-btn').addEventListener('click', () => {
    document.getElementById('ls-create-album-modal').classList.remove('visible');
  });
  document.getElementById('ls-confirm-album-btn').addEventListener('click', handleConfirmAlbum);

  // 情侣空间设置功能事件监听
  document.getElementById('ls-settings-btn').addEventListener('click', () => {
    const chat = state.chats[activeLoversSpaceCharId];
    if (chat && chat.loversSpaceData) {
      // 将已保存的日期加载到输入框中
      document.getElementById('ls-start-date-input').value = chat.loversSpaceData.relationshipStartDate || '';
    }
    document.getElementById('ls-settings-modal').classList.add('visible');
  });

  document.getElementById('ls-settings-cancel-btn').addEventListener('click', () => {
    document.getElementById('ls-settings-modal').classList.remove('visible');
  });

  document.getElementById('ls-settings-save-btn').addEventListener('click', async () => {
    const chat = state.chats[activeLoversSpaceCharId];
    if (!chat) return;

    const newDate = document.getElementById('ls-start-date-input').value;
    chat.loversSpaceData.relationshipStartDate = newDate;

    await db.chats.put(chat); // 保存到数据库

    // 重新渲染整个空间以显示更新
    await renderLoversSpace(chat);

    document.getElementById('ls-settings-modal').classList.remove('visible');
    alert('纪念日已保存！');
  });

  // 情侣空间相册事件监听
  document.getElementById('ls-album-list').addEventListener('click', e => {
    const item = e.target.closest('.ls-album-item');
    if (!item) return;

    const timestamp = parseInt(item.dataset.timestamp);
    if (isNaN(timestamp)) return;

    // 检查点击的是否是删除按钮
    if (e.target.classList.contains('ls-photo-delete-btn')) {
      handleDeleteLSPhoto(timestamp);
    } else {
      // 否则，就是点击了图片本身，执行查看描述的逻辑
      const chat = state.chats[activeLoversSpaceCharId];
      if (chat && chat.loversSpaceData && chat.loversSpaceData.photos) {
        const photo = chat.loversSpaceData.photos.find(p => p.timestamp === timestamp);
        if (photo) {
          showCustomAlert(`照片描述 (${formatPostTimestamp(photo.timestamp)})`, photo.description);
        }
      }
    }
  });

  // 情侣空间说说互动功能事件监听
  document.getElementById('ls-moments-list').addEventListener('click', async e => {
    const target = e.target;
    const momentCard = target.closest('.ls-moment-card');
    if (!momentCard) return;

    // 从被点击的卡片上获取正确的索引
    const momentIndex = parseInt(momentCard.dataset.momentIndex);
    const chat = state.chats[activeLoversSpaceCharId];
    // 安全检查，确保能找到对应的数据
    if (!chat || !chat.loversSpaceData || !chat.loversSpaceData.moments[momentIndex]) return;

    const moment = chat.loversSpaceData.moments[momentIndex];

    // 处理"发送评论"按钮
    if (target.classList.contains('ls-comment-send-btn')) {
      const input = momentCard.querySelector('.ls-comment-input-area input');
      const commentText = input.value.trim();
      if (!commentText) {
        alert('评论内容不能为空！');
        return;
      }

      const newComment = {
        author: chat.settings.myNickname || '我',
        text: commentText,
      };

      if (!moment.comments) {
        moment.comments = [];
      }
      moment.comments.push(newComment);

      await db.chats.put(chat); // 保存到数据库
      renderLSMoments(chat.loversSpaceData.moments, chat); // 刷新界面
    }

    // 处理"删除说说"按钮
    if (target.classList.contains('ls-moment-delete-btn')) {
      const confirmed = await showCustomConfirm('删除说说', '确定要删除这条说说吗？', {
        confirmButtonClass: 'btn-danger',
      });
      if (confirmed) {
        chat.loversSpaceData.moments.splice(momentIndex, 1);
        await db.chats.put(chat);
        renderLSMoments(chat.loversSpaceData.moments, chat);
      }
    }

    // 处理"删除评论"按钮
    if (target.classList.contains('ls-comment-delete-btn')) {
      const commentIndex = parseInt(target.dataset.commentIndex);
      const confirmed = await showCustomConfirm('删除评论', '确定要删除这条评论吗？', {
        confirmButtonClass: 'btn-danger',
      });
      if (confirmed) {
        moment.comments.splice(commentIndex, 1);
        await db.chats.put(chat);
        renderLSMoments(chat.loversSpaceData.moments, chat);
      }
    }
  });

  // 情侣空间情书功能事件监听

  // 绑定"写情书"的浮动按钮
  document.getElementById('ls-add-letter-btn').addEventListener('click', () => openLoveLetterEditor());

  // 绑定写信弹窗的"取消"和"寄出"按钮
  document.getElementById('ls-cancel-letter-btn').addEventListener('click', () => {
    document.getElementById('ls-create-letter-modal').classList.remove('visible');
  });
  document.getElementById('ls-confirm-letter-btn').addEventListener('click', handlePostLoveLetter);

  // 使用事件委托，为情书列表中的所有卡片和按钮绑定点击事件
  document.getElementById('ls-letters-list').addEventListener('click', async e => {
    const letterItem = e.target.closest('.ls-love-letter-item');
    if (!letterItem) return;

    // 检查点击的是否是删除按钮
    if (e.target.classList.contains('ls-letter-delete-btn')) {
      const letterId = letterItem.dataset.letterId;
      const chat = state.chats[activeLoversSpaceCharId];
      const letter = chat.loversSpaceData.loveLetters.find(l => l.id === letterId);

      const confirmed = await showCustomConfirm('删除情书', `确定要删除这封写给"${letter.recipientName}"的情书吗？`, {
        confirmButtonClass: 'btn-danger',
      });

      if (confirmed) {
        chat.loversSpaceData.loveLetters = chat.loversSpaceData.loveLetters.filter(l => l.id !== letterId);
        await db.chats.put(chat);
        renderLSLetters(chat.loversSpaceData.loveLetters, chat);
        alert('情书已删除。');
      }
    }
    // 否则，就是点击了卡片本身，执行查看详情的逻辑
    else if (letterItem.dataset.letterId) {
      showLoveLetterDetail(letterItem.dataset.letterId);
    }
  });

  // 情书查看器按钮事件监听
  document.getElementById('ls-close-letter-viewer-btn').addEventListener('click', () => {
    document.getElementById('ls-letter-viewer-modal').classList.remove('visible');
    activeLoveLetter = null; // 关闭时清理暂存的数据
  });

  document.getElementById('ls-reply-letter-btn').addEventListener('click', () => {
    // 先关闭查看器
    document.getElementById('ls-letter-viewer-modal').classList.remove('visible');
    // 然后打开回复编辑器
    if (activeLoveLetter) {
      openLoveLetterEditor(activeLoveLetter);
    }
    activeLoveLetter = null; // 清理
  });

  // 情侣空间-情侣提问功能事件监听

  // 绑定"提问"的浮动按钮
  document.getElementById('ls-add-question-btn').addEventListener('click', openQuestionAsker);

  // 绑定提问弹窗的按钮
  document.getElementById('ls-cancel-ask-btn').addEventListener('click', () => {
    document.getElementById('ls-ask-question-modal').classList.remove('visible');
  });
  document.getElementById('ls-confirm-ask-btn').addEventListener('click', handlePostQuestion);

  // 绑定回答弹窗的按钮
  document.getElementById('ls-cancel-answer-btn').addEventListener('click', () => {
    document.getElementById('ls-answer-question-modal').classList.remove('visible');
  });
  document.getElementById('ls-confirm-answer-btn').addEventListener('click', handlePostAnswer);

  // 使用事件委托，为所有"回答"和"删除"按钮绑定点击事件
  document.getElementById('ls-questions-list').addEventListener('click', e => {
    // 处理"回答"按钮的逻辑
    if (e.target.classList.contains('ls-answer-btn')) {
      const questionId = e.target.dataset.questionId;
      if (questionId) {
        openAnswerEditor(questionId);
      }
    }

    // 处理"删除"按钮的逻辑
    if (e.target.classList.contains('ls-question-delete-btn')) {
      const questionId = e.target.dataset.questionId;
      if (questionId) {
        handleDeleteLSQuestion(questionId);
      }
    }
  });

  // 情侣空间专属播放器事件监听器

  // 监听主播放器内的所有按钮
  document.getElementById('ls-close-player-btn').addEventListener('click', () => {
    document.getElementById('ls-music-player-overlay').classList.remove('visible');
  });
  document.getElementById('ls-playlist-btn').addEventListener('click', () => {
    renderLSMusicPlaylist();
    document.getElementById('ls-music-playlist-panel').classList.add('visible');
  });
  document.getElementById('ls-play-pause-btn').addEventListener('click', toggleLSMusicPlayPause);
  document.getElementById('ls-next-btn').addEventListener('click', playNextLSSong);
  document.getElementById('ls-prev-btn').addEventListener('click', playPrevLSSong);

  // 监听播放列表面板内的所有按钮
  document.getElementById('ls-close-playlist-btn').addEventListener('click', () => {
    document.getElementById('ls-music-playlist-panel').classList.remove('visible');
  });
  document.getElementById('ls-clear-playlist-btn').addEventListener('click', async () => {
    const confirmed = await showCustomConfirm('清空列表', '确定要清空情侣空间的播放列表吗？', {
      confirmButtonClass: 'btn-danger',
    });
    if (confirmed) {
      clearLSMusicPlaylist();
    }
  });
  document.getElementById('ls-playlist-body').addEventListener('click', e => {
    if (e.target.classList.contains('delete-track-btn')) {
      const index = parseInt(e.target.dataset.index);
      lsMusicState.playlist.splice(index, 1);

      // 如果删除的是正在播放的歌曲
      if (index === lsMusicState.currentIndex) {
        playNextLSSong();
      } else if (index < lsMusicState.currentIndex) {
        lsMusicState.currentIndex--; // 修正索引
      }
      renderLSMusicPlaylist();
    }
  });

  // 监听音频播放器的状态
  const lsAudioPlayer = document.getElementById('ls-audio-player');
  lsAudioPlayer.addEventListener('timeupdate', updateLSProgressBar);
  lsAudioPlayer.addEventListener('ended', playNextLSSong);
  lsAudioPlayer.addEventListener('play', () => {
    lsMusicState.isPlaying = true;
    renderLSMusicPlayerUI();
  });
  lsAudioPlayer.addEventListener('pause', () => {
    lsMusicState.isPlaying = false;
    renderLSMusicPlayerUI();
  });

  // 监听进度条的点击
  document.getElementById('ls-progress-bar').addEventListener('click', e => {
    if (!lsAudioPlayer.duration) return;
    const progressBar = e.currentTarget;
    const barWidth = progressBar.clientWidth;
    const clickX = e.offsetX;
    lsAudioPlayer.currentTime = (clickX / barWidth) * lsAudioPlayer.duration;
  });

  // 拦截情侣空间分享列表的点击事件，不再触发"一起听"
  document.getElementById('ls-shares-list').addEventListener('click', async e => {
    const item = e.target.closest('.ls-share-item');
    if (!item || !item.dataset.shareData) return;

    const shareData = JSON.parse(item.dataset.shareData);

    // 如果是歌曲，就调用我们新的播放器函数！
    if (shareData.shareType === 'song') {
      openLoversSpaceMusicPlayer(shareData);
    }
    // 其他类型的分享，保持原来的逻辑
    else if (shareData.shareType === 'movie' || shareData.shareType === 'book') {
      await showCustomAlert(`分享详情 - ${shareData.title}`, shareData.thoughts || shareData.summary || '暂无简介');
    } else if (shareData.shareType === 'game') {
      // 为游戏分享卡片构建一个更详细的弹窗内容
      const gameInfo = `游戏名：${shareData.title}\n\n简介：${shareData.summary || '暂无简介'}\n\nTa说："${
        shareData.thoughts || '一起玩吧！'
      }"`;
      await showCustomAlert(`分享的游戏`, gameInfo);
    }
  });

  // 情侣空间播放器封面/歌词切换事件
  document.getElementById('ls-display-area').addEventListener('click', () => {
    document.getElementById('ls-display-area').classList.toggle('show-lyrics');
  });

  // 情侣番茄钟事件监听器

  // 绑定"开启新的专注时光"按钮
  document.getElementById('ls-pomodoro-start-btn-container').addEventListener('click', openPomodoroSetup);

  // 绑定设置弹窗的按钮
  document.getElementById('pomodoro-cancel-setup-btn').addEventListener('click', () => {
    document.getElementById('ls-pomodoro-setup-modal').classList.remove('visible');
  });
  document.getElementById('pomodoro-confirm-setup-btn').addEventListener('click', startPomodoroSession);

  // 为我们新增的"本地上传"按钮绑定事件
  document.getElementById('pomodoro-bg-local-upload-btn').addEventListener('click', () => {
    document.getElementById('pomodoro-bg-file-input').click();
  });
  document.getElementById('pomodoro-bg-file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = event => {
        pomodoroState.tempBgDataUrl = event.target.result; // 将本地图片转为DataURL暂存起来
        document.getElementById('pomodoro-bg-url-input').value = `[本地图片: ${file.name}]`; // 在输入框里给个提示
      };
      reader.readAsDataURL(file);
    }
  });

  // 绑定计时器界面上的元素
  document.getElementById('pomodoro-char-avatar').addEventListener('click', () => {
    triggerPomodoroAIResponse('user_click');
  });
  document.getElementById('pomodoro-end-btn').addEventListener('click', () => {
    endPomodoroSession(false); // false表示是用户手动中断
  });

  // 绑定历史详情弹窗的关闭按钮
  document.getElementById('pomodoro-close-history-viewer-btn').addEventListener('click', () => {
    document.getElementById('ls-pomodoro-history-viewer-modal').classList.remove('visible');
  });

  // 为番茄钟计时模式新增的交互代码
  document.querySelector('#ls-pomodoro-setup-modal').addEventListener('change', e => {
    if (e.target.name === 'pomodoro-mode') {
      const durationGroup = document.getElementById('pomodoro-duration-input').parentElement;
      if (e.target.value === 'countup') {
        // 如果选择正计时，就隐藏时长输入框
        durationGroup.style.display = 'none';
      } else {
        // 否则（选择倒计时），就显示它
        durationGroup.style.display = 'block';
      }
    }
  });

  // 处理情侣空间邀请卡片的点击事件
  document.getElementById('chat-messages').addEventListener('click', async e => {
    const card = e.target.closest('.waimai-card');
    if (!card) return;
    const messageBubble = card.closest('.message-bubble');
    const invitationMsg = state.chats[state.activeChatId].history.find(
      m => m.timestamp === parseInt(messageBubble.dataset.timestamp),
    );

    if (invitationMsg && invitationMsg.type === 'lovers_space_invitation' && invitationMsg.status === 'pending') {
      const choice = e.target.dataset.choice; // 'accepted' or 'rejected'
      if (choice) {
        // 更新邀请卡片的状态
        invitationMsg.status = choice;
        const chat = state.chats[state.activeChatId];

        // 判断用户的选择
        if (choice === 'accepted') {
          // 如果同意，创建情侣空间数据
          chat.loversSpaceData = {
            background: 'https://i.postimg.cc/k495F4W5/profile-banner.jpg',
            relationshipStartDate: null,
            moments: [],
            albums: [],
            photos: [],
            loveLetters: [],
            shares: [],
            questions: [],
          };

          // 创建对用户可见的系统通知
          const visibleNotice = {
            role: 'system',
            type: 'pat_message',
            content: `[系统：你和"${chat.name}"的情侣空间已成功开启！]`,
            timestamp: Date.now(),
          };
          chat.history.push(visibleNotice);

          // 创建给AI看的隐藏指令
          const hiddenMessage = {
            role: 'system',
            content: `[系统指令：用户同意了你开启情侣空间的邀请。]`,
            timestamp: Date.now() + 1,
            isHidden: true,
          };
          chat.history.push(hiddenMessage);

          await db.chats.put(chat);
          renderChatInterface(state.activeChatId);
        } else {
          // 如果拒绝 (choice === 'rejected')

          // 创建一条对用户可见的系统通知
          const visibleNotice = {
            role: 'system',
            type: 'pat_message', // 复用灰色居中气泡样式
            content: `[系统：你拒绝了"${chat.name}"的情侣空间邀请。]`,
            timestamp: Date.now(),
          };
          chat.history.push(visibleNotice);

          // 创建一条给AI看的隐藏指令，告诉它被拒绝了
          const hiddenMessage = {
            role: 'system',
            content: `[系统指令：用户拒绝了你开启情侣空间的邀请。]`,
            timestamp: Date.now() + 1,
            isHidden: true,
          };
          chat.history.push(hiddenMessage);

          // 保存所有更改到数据库
          await db.chats.put(chat);

          // 刷新聊天界面，让卡片状态和新的系统通知都显示出来
          renderChatInterface(state.activeChatId);
        }
      }
    }
  });

  // 处理情侣空间邀请卡片的点击事件
  document.getElementById('chat-messages').addEventListener('click', async e => {
    // 寻找被点击的元素是否在邀请卡片内
    const card = e.target.closest('.waimai-card');
    if (!card) return;
    const messageBubble = card.closest('.message-bubble');
    // 通过时间戳找到对应的消息数据
    const invitationMsg = state.chats[state.activeChatId].history.find(
      m => m.timestamp === parseInt(messageBubble.dataset.timestamp),
    );

    // 确保这是一条待处理的情侣空间邀请
    if (invitationMsg && invitationMsg.type === 'lovers_space_invitation' && invitationMsg.status === 'pending') {
      const choice = e.target.dataset.choice; // 获取点击的是 'accepted' 还是 'rejected'
      if (choice) {
        // 调用我们刚刚创建的处理器函数
        handleLoversSpaceResponse(invitationMsg.timestamp, choice);
      }
    }
  });

  // 情侣空间-情绪日记事件监听
  document.getElementById('lovers-space-screen').addEventListener('click', e => {
    const chat = state.chats[activeLoversSpaceCharId];
    if (!chat) return;

    // 日历月份切换
    if (e.target.id === 'ls-prev-month-btn' || e.target.id === 'ls-next-month-btn') {
      const currentDisplay = document.getElementById('ls-current-month-display').textContent;
      const [year, month] = currentDisplay.match(/\d+/g).map(Number);
      let newDate = new Date(year, month - 1, 1);

      if (e.target.id === 'ls-prev-month-btn') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      renderLSDiaryView(newDate.getFullYear(), newDate.getMonth() + 1);
      return;
    }

    // 点击日历格子
    const dayCell = e.target.closest('.ls-calendar-day:not(.empty)');
    if (dayCell) {
      openDiaryModal(dayCell.dataset.date);
    }
  });

  // 日记编辑弹窗事件
  document.getElementById('ls-emoji-selector').addEventListener('click', e => {
    if (e.target.classList.contains('emoji-option')) {
      document.querySelectorAll('#ls-emoji-selector .emoji-option').forEach(el => el.classList.remove('selected'));
      e.target.classList.add('selected');
    }
  });
  document.getElementById('ls-cancel-diary-btn').addEventListener('click', () => {
    document.getElementById('ls-diary-editor-modal').classList.remove('visible');
  });
  document.getElementById('ls-save-diary-btn').addEventListener('click', handleSaveUserDiary);

  // 日记查看弹窗关闭按钮
  document.getElementById('ls-close-diary-viewer-btn').addEventListener('click', () => {
    document.getElementById('ls-diary-viewer-modal').classList.remove('visible');
  });

  // 头像编辑相关事件监听器
  const avatarModal = document.getElementById('ls-avatar-edit-modal');
  const avatarFileInput = document.getElementById('ls-avatar-file-input');
  const avatarUrlInput = document.getElementById('ls-avatar-url-input');
  const avatarUrlInputGroup = document.getElementById('ls-avatar-url-input-group');
  
  // 本地上传按钮
  document.getElementById('ls-avatar-upload-btn').addEventListener('click', () => {
    avatarFileInput.click();
  });
  
  // 文件选择处理
  avatarFileInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async event => {
        const dataUrl = event.target.result;
        const previewEl = document.getElementById('ls-avatar-edit-preview');
        previewEl.src = dataUrl;
        
        // 自动保存
        const type = avatarModal.dataset.editType;
        const chatId = avatarModal.dataset.chatId;
        const chat = state.chats[chatId];
        if (chat) {
          await saveAvatarChange(type, dataUrl, chat);
        }
      };
      reader.readAsDataURL(file);
      e.target.value = ''; // 清空以便下次选择
    }
  });
  
  // 使用网络URL按钮
  document.getElementById('ls-avatar-url-btn').addEventListener('click', () => {
    avatarUrlInputGroup.style.display = 'block';
  });
  
  // 确认使用URL按钮
  document.getElementById('ls-avatar-url-confirm-btn').addEventListener('click', async () => {
    const url = avatarUrlInput.value.trim();
    if (!url) {
      alert('请输入图片URL');
      return;
    }
    
    // 验证URL是否有效（简单检查）
    try {
      new URL(url);
    } catch {
      alert('请输入有效的URL');
      return;
    }
    
    // 更新预览
    const previewEl = document.getElementById('ls-avatar-edit-preview');
    previewEl.src = url;
    
    // 保存
    const type = avatarModal.dataset.editType;
    const chatId = avatarModal.dataset.chatId;
    const chat = state.chats[chatId];
    if (chat) {
      await saveAvatarChange(type, url, chat);
      avatarUrlInput.value = '';
      avatarUrlInputGroup.style.display = 'none';
    }
  });
  
  // 重置为默认按钮
  document.getElementById('ls-avatar-reset-btn').addEventListener('click', async () => {
    const type = avatarModal.dataset.editType;
    const chatId = avatarModal.dataset.chatId;
    const chat = state.chats[chatId];
    if (chat) {
      // 使用保存的原始头像（聊天设定中的头像）
      const originalAvatar = getOriginalAvatar(type, chat);
      await saveAvatarChange(type, originalAvatar, chat);
    }
  });
  
  // 关闭头像编辑弹窗
  document.getElementById('ls-avatar-edit-cancel-btn').addEventListener('click', () => {
    avatarModal.classList.remove('visible');
    avatarUrlInput.value = '';
    avatarUrlInputGroup.style.display = 'none';
  });
  
  // 用户名编辑相关事件监听器
  const usernameModal = document.getElementById('ls-username-edit-modal');
  
  // 保存用户名
  document.getElementById('ls-username-edit-save-btn').addEventListener('click', async () => {
    const newName = document.getElementById('ls-username-input').value.trim();
    const type = usernameModal.dataset.editType;
    const chatId = usernameModal.dataset.chatId;
    const chat = state.chats[chatId];
    if (chat) {
      await saveUsernameChange(type, newName, chat);
    }
  });
  
  // 关闭用户名编辑弹窗
  document.getElementById('ls-username-edit-cancel-btn').addEventListener('click', () => {
    usernameModal.classList.remove('visible');
  });
}
