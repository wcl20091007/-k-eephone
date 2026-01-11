// 拆分机app - 帮助用户将目标拆分成小任务
let activeTaskSplitterCharId = null;
let currentTaskData = null; // 存储当前任务数据

/**
 * 【总入口】打开拆分机功能
 */
async function openTaskSplitter() {
  const characters = Object.values(state.chats).filter(chat => !chat.isGroup);
  
  if (characters.length === 0) {
    await showCustomAlert('提示', '还没有可以使用的角色');
    return;
  }

  // 获取第一个置顶角色，如果没有则获取第一个角色
  const pinnedChars = characters.filter(char => char.isPinned);
  const defaultChar = pinnedChars.length > 0 ? pinnedChars[0] : characters[0];
  
  // 直接使用默认角色打开主界面
  await openTaskSplitterWithChar(defaultChar.id);
}

/**
 * 使用指定角色打开拆分机主界面
 * @param {string} charId - 角色ID
 */
async function openTaskSplitterWithChar(charId) {
  activeTaskSplitterCharId = charId;
  const chat = state.chats[charId];
  if (!chat) return;

  // 隐藏对话气泡
  hideDialogBubble();
  
  // 显示主界面
  showScreen('task-splitter-main-screen');
  
  // 检查是否有保存的进度
  const savedProgress = loadTaskProgress(charId);
  if (savedProgress && savedProgress.taskGroups && savedProgress.taskGroups.length > 0) {
    // 恢复保存的进度
    currentTaskData = {
      charId: savedProgress.charId,
      goal: savedProgress.goal,
      currentStatus: savedProgress.currentStatus,
      startMessage: savedProgress.startMessage,
      endMessage: savedProgress.endMessage,
      taskGroups: savedProgress.taskGroups,
      completedTasks: new Set(savedProgress.completedTasks || []),
      createdAt: savedProgress.createdAt,
    };
    
    // 检查是否所有任务都已完成
    const allTasksCompleted = currentTaskData.taskGroups.every(group =>
      group.tasks.every(task => currentTaskData.completedTasks.has(task.id))
    );
    
    if (allTasksCompleted) {
      // 所有任务已完成，显示完成界面
      const completionView = document.getElementById('task-splitter-completion-view');
      const endMessageEl = document.getElementById('task-splitter-end-message');
      const helpBtn = document.getElementById('task-splitter-help-btn');
      const tasksView = document.getElementById('task-splitter-tasks-view');
      
      tasksView.style.display = 'block';
      endMessageEl.textContent = currentTaskData.endMessage;
      completionView.style.display = 'block';
      helpBtn.style.display = 'none';
      
      // 显示结束语
      showDialogBubble(currentTaskData.endMessage);
    } else {
      // 显示任务界面
      renderTaskList();
      // 显示开始语
      if (currentTaskData.startMessage) {
        showDialogBubble(currentTaskData.startMessage);
      }
    }
  } else {
    // 没有保存的进度，显示初始界面
    currentTaskData = null;
    await renderTaskSplitterInitialView(chat);
  }
  
  // 加载保存的背景图片
  loadTaskSplitterBackground();
}

/**
 * 渲染初始界面
 */
async function renderTaskSplitterInitialView(chat) {
  const avatarEl = document.getElementById('task-splitter-char-avatar');
  const greetingEl = document.getElementById('task-splitter-greeting');
  const initialView = document.getElementById('task-splitter-initial-view');
  const currentStatusView = document.getElementById('task-splitter-current-status-view');
  const tasksView = document.getElementById('task-splitter-tasks-view');
  const loadingView = document.getElementById('task-splitter-loading-view');
  
  // 显示初始界面，隐藏其他视图
  initialView.style.display = 'flex';
  currentStatusView.style.display = 'none';
  tasksView.style.display = 'none';
  loadingView.style.display = 'none';
  document.getElementById('task-splitter-help-btn').style.display = 'none';
  
  // 设置头像
  avatarEl.src = chat.settings.aiAvatar || defaultAvatar;
  
  // 设置问候语
  const username = chat.settings.myNickname || state.qzoneSettings.nickname || '你';
  greetingEl.textContent = `${username}，有什麼目標未達成嗎？`;
  
  // 清空输入框
  document.getElementById('task-splitter-goal-input').value = '';
  document.getElementById('task-splitter-current-status-input').value = '';
  
  // 绑定事件
  setupTaskSplitterEvents(chat);
}

/**
 * 设置事件监听
 */
function setupTaskSplitterEvents(chat) {
  // 头像点击选择角色
  document.getElementById('task-splitter-char-avatar-container').onclick = () => {
    showTaskSplitterCharSelection();
  };
  
  // 提交目标按钮
  const submitGoalBtn = document.getElementById('task-splitter-submit-goal-btn');
  submitGoalBtn.onclick = async () => {
    const goalInput = document.getElementById('task-splitter-goal-input');
    const goal = goalInput.value.trim();
    if (!goal) {
      await showCustomAlert('提示', '请输入你的目标');
      return;
    }
    
    // 隐藏初始界面，显示当前状态询问界面
    document.getElementById('task-splitter-initial-view').style.display = 'none';
    document.getElementById('task-splitter-current-status-view').style.display = 'block';
  };
  
  // 提交当前状态按钮
  const submitStatusBtn = document.getElementById('task-splitter-submit-status-btn');
  submitStatusBtn.onclick = async () => {
    const goalInput = document.getElementById('task-splitter-goal-input');
    const statusInput = document.getElementById('task-splitter-current-status-input');
    const goal = goalInput.value.trim();
    const currentStatus = statusInput.value.trim();
    
    if (!currentStatus) {
      await showCustomAlert('提示', '请告诉我你现在在做什么');
      return;
    }
    
    // 开始生成任务拆解
    await generateTaskBreakdown(activeTaskSplitterCharId, goal, currentStatus);
  };
  
  // 回车键提交
  document.getElementById('task-splitter-goal-input').onkeypress = (e) => {
    if (e.key === 'Enter') {
      submitGoalBtn.click();
    }
  };
  
  document.getElementById('task-splitter-current-status-input').onkeypress = (e) => {
    if (e.key === 'Enter') {
      submitStatusBtn.click();
    }
  };
  
  // 返回按钮
  document.getElementById('task-splitter-back-btn').onclick = () => {
    // 保存当前进度
    if (currentTaskData) {
      saveTaskProgress();
    }
    hideDialogBubble();
    showScreen('home-screen');
  };
  
  // 设置按钮（图片区域右上角）
  document.getElementById('task-splitter-image-settings-btn').onclick = () => {
    showTaskSplitterImageSettings();
  };
  
  // 查看历史按钮
  document.getElementById('task-splitter-history-btn').onclick = () => {
    openTaskSplitterHistory();
  };
  
  // 遇到困难按钮
  document.getElementById('task-splitter-help-btn').onclick = async () => {
    await handleTaskSplitterHelp();
  };
  
  // 新增目标按钮
  const newGoalBtn = document.getElementById('task-splitter-new-goal-btn');
  if (newGoalBtn) {
    newGoalBtn.onclick = () => {
      // 清除保存的进度
      clearTaskProgress(activeTaskSplitterCharId);
      // 重置状态，返回初始界面
      currentTaskData = null;
      renderTaskSplitterInitialView(chat);
      hideDialogBubble();
    };
  }
  
  // 背景图片设置模态框事件
  setupImageSettingsModal();
}

/**
 * 显示角色选择界面
 */
async function showTaskSplitterCharSelection() {
  const listEl = document.getElementById('task-splitter-char-list');
  listEl.innerHTML = '';
  const characters = Object.values(state.chats).filter(chat => !chat.isGroup);

  if (characters.length === 0) {
    listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">还没有可以使用的角色</p>';
  } else {
    characters.forEach(char => {
      const item = document.createElement('div');
      item.className = 'character-select-item';
      item.dataset.chatId = char.id;
      item.innerHTML = `
        <img src="${char.settings.aiAvatar || defaultAvatar}" alt="${char.name}">
        <span class="name">${char.name}</span>
      `;
      item.onclick = () => {
        openTaskSplitterWithChar(char.id);
      };
      listEl.appendChild(item);
    });
  }
  showScreen('task-splitter-char-selection-screen');
}

/**
 * 【AI核心】生成任务拆解
 * @param {string} charId - 角色ID
 * @param {string} goal - 用户目标
 * @param {string} currentStatus - 用户当前状态
 */
async function generateTaskBreakdown(charId, goal, currentStatus) {
  const chat = state.chats[charId];
  if (!chat) return;

  // 显示加载动画
  document.getElementById('task-splitter-initial-view').style.display = 'none';
  document.getElementById('task-splitter-current-status-view').style.display = 'none';
  document.getElementById('task-splitter-tasks-view').style.display = 'none';
  document.getElementById('task-splitter-loading-view').style.display = 'block';

  try {
    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      throw new Error('API未配置');
    }

    const userNickname = chat.settings.myNickname || state.qzoneSettings.nickname || '我';
    const charName = chat.name;
    const charPersona = chat.settings.aiPersona || '一个友善的助手。';

    // 构建世界书上下文
    const recentHistory = chat.history
      .slice(-10)
      .map(msg => {
        const sender = msg.role === 'user' ? userNickname : charName;
        return `${sender}: ${msg.content}`;
      })
      .join('\n');
    
    const worldBookByPosition = (typeof window.buildWorldBookContentByPosition === 'function')
      ? window.buildWorldBookContentByPosition(chat, recentHistory, false)
      : { all: '' };
    const worldBookContext = worldBookByPosition.all || '';

    const systemPrompt = `# 任务：目标拆分助手

你现在是角色"${charName}"，你的人设是："${charPersona}"

你的任务是帮助用户将一个大目标拆分成多个可执行的小任务。

# 用户信息
- 用户名：${userNickname}
- 目标：${goal}
- 当前状态：${currentStatus}

${worldBookContext ? `# 世界观设定\n${worldBookContext}\n` : ''}

# 你的任务

1. **分析差距**：分析从"${currentStatus}"到"${goal}"之间的差距
2. **生成开始语**：根据你的人设和目标，生成一段鼓励用户完成目标的开始语（50-100字）
3. **拆分任务**：将目标拆分成多个小任务，任务可以分组
4. **生成结束语**：生成一段角色赞美用户成功完成目标的结束语（50-100字）

# 任务拆分规则

- 任务应该具体、可执行
- 任务可以分组，例如："不玩手机"这个任务可以拆分为：
  - 关闭小红书
  - 静音手机
  - 把手机放回床上
- 根据你的人设，你的拆分策略可能不是完全科学的，可能包含一些符合你人设的建议（比如先点杯奶茶）
- 任务数量建议在5-15个之间

# 输出格式（必须是严格的JSON）

{
  "startMessage": "开始语内容",
  "endMessage": "结束语内容",
  "taskGroups": [
    {
      "groupName": "任务组名称（可选，如果不需要分组可以为空字符串）",
      "tasks": [
        {
          "id": "task_1",
          "content": "任务内容",
          "completed": false,
          "completionMessage": "完成这个任务时的鼓励话语（20-40字）"
        }
      ]
    }
  ]
}

注意：
- 如果不需要分组，可以只有一个taskGroup，groupName为空字符串
- 每个任务必须有唯一的id
- 每个任务必须包含completionMessage字段，这是完成该任务时角色要说的话
- 直接输出JSON，不要添加任何其他文字`;

    const isGemini = proxyUrl === 'https://generativelanguage.googleapis.com/v1beta/models';
    const temperature = parseFloat(state.apiConfig.temperature) || 0.8;

    const messagesForApi = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '请开始拆分任务。' },
    ];

    const requestData = isGemini
      ? window.toGeminiRequestData(
          model,
          apiKey,
          systemPrompt,
          [{ role: 'user', content: '请开始拆分任务。' }],
          true,
          temperature,
        )
      : {
          url: `${proxyUrl}/v1/chat/completions`,
          data: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model, messages: messagesForApi, temperature }),
          },
        };

    const response = await fetch(requestData.url, requestData.data);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API请求失败: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const aiContent = isGemini
      ? result?.candidates?.[0]?.content?.parts?.[0]?.text
      : result?.choices?.[0]?.message?.content;

    if (!aiContent) {
      throw new Error('API返回了空内容');
    }

    // 解析JSON（去除可能的markdown代码块）
    const jsonContent = aiContent.replace(/^```json\s*|```$/g, '').trim();
    const taskData = JSON.parse(jsonContent);

    // 保存任务数据
    currentTaskData = {
      charId: charId,
      goal: goal,
      currentStatus: currentStatus,
      startMessage: taskData.startMessage,
      endMessage: taskData.endMessage,
      taskGroups: taskData.taskGroups,
      completedTasks: new Set(),
      createdAt: Date.now(),
    };

    // 保存进度
    saveTaskProgress();

    // 显示开始语在对话气泡中
    showDialogBubble(taskData.startMessage);

    // 渲染任务列表
    renderTaskList();

  } catch (error) {
    console.error('生成任务拆解失败:', error);
    await showCustomAlert('错误', `生成任务拆解失败：${error.message}`);
    // 返回初始界面
    await renderTaskSplitterInitialView(chat);
  }
}

/**
 * 渲染任务列表
 */
/**
 * 显示对话气泡
 */
function showDialogBubble(message) {
  const bubble = document.getElementById('task-splitter-dialog-bubble');
  const content = document.getElementById('task-splitter-dialog-content');
  if (bubble && content) {
    content.textContent = message;
    bubble.style.display = 'block';
  }
}

/**
 * 隐藏对话气泡
 */
function hideDialogBubble() {
  const bubble = document.getElementById('task-splitter-dialog-bubble');
  if (bubble) {
    bubble.style.display = 'none';
  }
}

function renderTaskList() {
  const loadingView = document.getElementById('task-splitter-loading-view');
  const tasksView = document.getElementById('task-splitter-tasks-view');
  const tasksContainer = document.getElementById('task-splitter-tasks-container');
  const helpBtn = document.getElementById('task-splitter-help-btn');

  // 隐藏加载，显示任务列表
  loadingView.style.display = 'none';
  tasksView.style.display = 'block';
  helpBtn.style.display = 'block';

  // 清空任务容器
  tasksContainer.innerHTML = '';

  // 渲染任务分组
  let currentGroupIndex = 0;
  currentTaskData.taskGroups.forEach((group, groupIndex) => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'task-group';
    groupDiv.dataset.groupIndex = groupIndex;
    groupDiv.style.cssText = `
      margin-bottom: 30px;
      ${groupIndex > 0 ? 'display: none;' : ''}
    `;

    // 如果有组名，显示组名
    if (group.groupName) {
      const groupTitle = document.createElement('h3');
      groupTitle.textContent = group.groupName;
      groupTitle.style.cssText = `
        font-size: 18px;
        color: #333;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 2px solid #4CAF50;
      `;
      groupDiv.appendChild(groupTitle);
    }

    // 任务列表
    const tasksList = document.createElement('div');
    tasksList.className = 'tasks-list';
    group.tasks.forEach((task, taskIndex) => {
      const taskItem = document.createElement('div');
      taskItem.className = 'task-item';
      taskItem.dataset.taskId = task.id;
      taskItem.style.cssText = `
        display: flex;
        align-items: center;
        padding: 15px;
        margin-bottom: 10px;
        background: #f5f5f5;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.3s;
      `;

      const isCompleted = currentTaskData.completedTasks.has(task.id);
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `task-checkbox-${task.id}`;
      checkbox.checked = isCompleted;
      checkbox.style.cssText = `
        width: 20px;
        height: 20px;
        margin-right: 15px;
        cursor: pointer;
      `;

      const taskLabel = document.createElement('label');
      taskLabel.htmlFor = `task-checkbox-${task.id}`;
      taskLabel.textContent = task.content;
      taskLabel.style.cssText = `
        flex: 1;
        font-size: 16px;
        color: #333;
        cursor: pointer;
        ${isCompleted ? 'text-decoration: line-through; color: #999;' : ''}
      `;
      
      if (isCompleted) {
        taskItem.style.opacity = '0.7';
      }

      taskItem.appendChild(checkbox);
      taskItem.appendChild(taskLabel);

      // 点击事件
      checkbox.onchange = async () => {
        await handleTaskCompletion(task.id, checkbox.checked);
      };

      taskItem.onclick = (e) => {
        if (e.target !== checkbox && e.target !== taskLabel) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change'));
        }
      };

      tasksList.appendChild(taskItem);
    });

    groupDiv.appendChild(tasksList);
    tasksContainer.appendChild(groupDiv);
  });

  // 滚动到顶部
  document.getElementById('task-splitter-content-area').scrollTop = 0;
}

/**
 * 处理任务完成
 */
async function handleTaskCompletion(taskId, completed) {
  if (completed) {
    currentTaskData.completedTasks.add(taskId);
    
    // 找到对应的任务，显示预生成的完成消息
    for (const group of currentTaskData.taskGroups) {
      const task = group.tasks.find(t => t.id === taskId);
      if (task && task.completionMessage) {
        showDialogBubble(task.completionMessage);
        break;
      }
    }
  } else {
    currentTaskData.completedTasks.delete(taskId);
  }
  
  // 保存进度
  saveTaskProgress();

  // 更新UI
  const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
  if (!taskItem) return;
  
  const taskLabel = taskItem.querySelector('label');
  if (completed) {
    taskLabel.style.textDecoration = 'line-through';
    taskLabel.style.color = '#999';
    taskItem.style.opacity = '0.7';
  } else {
    taskLabel.style.textDecoration = 'none';
    taskLabel.style.color = '#333';
    taskItem.style.opacity = '1';
  }

  // 检查当前分组是否全部完成
  const groupDiv = taskItem.closest('.task-group');
  const groupIndex = parseInt(groupDiv.dataset.groupIndex);
  const group = currentTaskData.taskGroups[groupIndex];
  const allCompleted = group.tasks.every(task => 
    currentTaskData.completedTasks.has(task.id)
  );

  if (allCompleted && groupIndex < currentTaskData.taskGroups.length - 1) {
    // 当前分组完成，显示下一个分组（翻页动画）
    await showNextTaskGroup(groupIndex);
  }

  // 检查所有任务是否完成
  const allTasksCompleted = currentTaskData.taskGroups.every(group =>
    group.tasks.every(task => currentTaskData.completedTasks.has(task.id))
  );

  if (allTasksCompleted) {
    // 所有任务完成，显示完成界面
    await showTaskCompletion();
  }
}

/**
 * 显示下一个任务分组（翻页动画）
 */
async function showNextTaskGroup(currentGroupIndex) {
  const currentGroup = document.querySelector(`[data-group-index="${currentGroupIndex}"]`);
  const nextGroup = document.querySelector(`[data-group-index="${currentGroupIndex + 1}"]`);
  
  if (!nextGroup) return;

  // 翻页动画
  currentGroup.style.transition = 'transform 0.5s, opacity 0.5s';
  currentGroup.style.transform = 'translateX(-100%)';
  currentGroup.style.opacity = '0';

  await new Promise(resolve => setTimeout(resolve, 500));

  currentGroup.style.display = 'none';
  nextGroup.style.display = 'block';
  nextGroup.style.opacity = '0';
  nextGroup.style.transform = 'translateX(100%)';
  
  await new Promise(resolve => setTimeout(resolve, 50));
  
  nextGroup.style.transition = 'transform 0.5s, opacity 0.5s';
  nextGroup.style.transform = 'translateX(0)';
  nextGroup.style.opacity = '1';

  // 滚动到新分组
  nextGroup.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * 显示任务完成界面
 */
async function showTaskCompletion() {
  const completionView = document.getElementById('task-splitter-completion-view');
  const endMessageEl = document.getElementById('task-splitter-end-message');
  const helpBtn = document.getElementById('task-splitter-help-btn');

  // 显示结束语在对话气泡中
  showDialogBubble(currentTaskData.endMessage);

  endMessageEl.textContent = currentTaskData.endMessage;
  completionView.style.display = 'block';
  helpBtn.style.display = 'none';

  // 保存记录
  await saveTaskRecord();
  
  // 清除保存的进度（因为已经完成了）
  clearTaskProgress(activeTaskSplitterCharId);

  // 滚动到完成界面
  completionView.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // 播放完成动画
  completionView.style.opacity = '0';
  completionView.style.transition = 'opacity 0.5s';
  setTimeout(() => {
    completionView.style.opacity = '1';
  }, 10);
}

/**
 * 保存任务记录
 */
async function saveTaskRecord() {
  if (!currentTaskData) return;

  try {
    // 获取保存的记录列表
    let records = JSON.parse(localStorage.getItem('task-splitter-records') || '[]');
    
    // 添加新记录
    const record = {
      id: Date.now().toString(),
      charId: currentTaskData.charId,
      charName: state.chats[currentTaskData.charId]?.name || '未知',
      goal: currentTaskData.goal,
      currentStatus: currentTaskData.currentStatus,
      startMessage: currentTaskData.startMessage,
      endMessage: currentTaskData.endMessage,
      taskGroups: currentTaskData.taskGroups,
      completedTasks: Array.from(currentTaskData.completedTasks),
      createdAt: currentTaskData.createdAt,
      completedAt: Date.now(),
    };
    
    records.unshift(record); // 最新的在前面
    localStorage.setItem('task-splitter-records', JSON.stringify(records));
  } catch (error) {
    console.error('保存任务记录失败:', error);
  }
}

/**
 * 处理"遇到困难"按钮
 */
async function handleTaskSplitterHelp() {
  const chat = state.chats[activeTaskSplitterCharId];
  if (!chat || !currentTaskData) return;

  const completedCount = currentTaskData.completedTasks.size;
  const totalTasks = currentTaskData.taskGroups.reduce((sum, group) => sum + group.tasks.length, 0);
  const currentGroup = currentTaskData.taskGroups.find(group =>
    group.tasks.some(task => !currentTaskData.completedTasks.has(task.id))
  );
  const currentTask = currentGroup?.tasks.find(task => !currentTaskData.completedTasks.has(task.id));

  try {
    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      showDialogBubble('API未配置，无法帮助你...');
      return;
    }

    // 在气泡中显示"思考中..."
    showDialogBubble('思考中...');

    const charName = chat.name;
    const charPersona = chat.settings.aiPersona || '一个友善的助手。';
    const userNickname = chat.settings.myNickname || state.qzoneSettings.nickname || '你';

    const systemPrompt = `你是角色"${charName}"，你的人设是："${charPersona}"

用户正在完成目标："${currentTaskData.goal}"
当前进度：已完成 ${completedCount}/${totalTasks} 个任务
${currentTask ? `当前任务：${currentTask.content}` : '所有任务都已完成'}

用户遇到了困难，需要你的帮助、鼓励或陪伴。请根据你的人设，给出一段鼓励或建议（50-100字）。直接输出文字，不要添加引号或其他格式。`;

    const isGemini = proxyUrl === 'https://generativelanguage.googleapis.com/v1beta/models';
    const temperature = parseFloat(state.apiConfig.temperature) || 0.8;

    const messagesForApi = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '我遇到困难了，需要帮助。' },
    ];

    const requestData = isGemini
      ? window.toGeminiRequestData(
          model,
          apiKey,
          systemPrompt,
          [{ role: 'user', content: '我遇到困难了，需要帮助。' }],
          true,
          temperature,
        )
      : {
          url: `${proxyUrl}/v1/chat/completions`,
          data: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model, messages: messagesForApi, temperature }),
          },
        };

    const response = await fetch(requestData.url, requestData.data);
    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`);
    }

    const result = await response.json();
    const aiContent = isGemini
      ? result?.candidates?.[0]?.content?.parts?.[0]?.text
      : result?.choices?.[0]?.message?.content;

    if (aiContent) {
      // 在气泡中显示回应
      showDialogBubble(aiContent.trim());
    }
  } catch (error) {
    console.error('生成帮助回应失败:', error);
    showDialogBubble(`抱歉，我遇到了一些问题：${error.message}`);
  }
}

/**
 * 设置背景图片
 */
function setupImageSettingsModal() {
  const modal = document.getElementById('task-splitter-image-settings-modal');
  const cancelBtn = document.getElementById('task-splitter-image-cancel-btn');
  const saveBtn = document.getElementById('task-splitter-image-save-btn');
  const uploadInput = document.getElementById('task-splitter-image-upload');
  const urlInput = document.getElementById('task-splitter-image-url-input');

  cancelBtn.onclick = () => {
    modal.classList.remove('visible');
  };

  saveBtn.onclick = () => {
    const url = urlInput.value.trim();
    if (url) {
      saveTaskSplitterBackground(url);
      modal.classList.remove('visible');
    }
  };

  uploadInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        saveTaskSplitterBackground(dataUrl);
        modal.classList.remove('visible');
      };
      reader.readAsDataURL(file);
    }
  };
}

/**
 * 显示背景图片设置
 */
function showTaskSplitterImageSettings() {
  const modal = document.getElementById('task-splitter-image-settings-modal');
  modal.classList.add('visible');
  
  // 加载当前设置
  const savedBg = localStorage.getItem('task-splitter-background');
  if (savedBg) {
    document.getElementById('task-splitter-image-url-input').value = savedBg;
  }
}

/**
 * 保存背景图片
 */
function saveTaskSplitterBackground(imageUrl) {
  localStorage.setItem('task-splitter-background', imageUrl);
  loadTaskSplitterBackground();
}

/**
 * 加载背景图片
 */
function loadTaskSplitterBackground() {
  const imageArea = document.getElementById('task-splitter-image-area');
  const savedBg = localStorage.getItem('task-splitter-background');
  if (savedBg) {
    imageArea.style.backgroundImage = `url(${savedBg})`;
  } else {
    imageArea.style.backgroundImage = 'none';
  }
}

/**
 * 打开历史记录
 */
function openTaskSplitterHistory() {
  const modal = document.getElementById('task-splitter-history-modal');
  const listEl = document.getElementById('task-splitter-history-list');
  
  // 获取保存的记录
  const records = JSON.parse(localStorage.getItem('task-splitter-records') || '[]');
  
  listEl.innerHTML = '';
  
  if (records.length === 0) {
    listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 40px;">暂无完成记录</p>';
  } else {
    records.forEach(record => {
      const item = document.createElement('div');
      item.style.cssText = `
        padding: 15px;
        margin-bottom: 10px;
        background: #f5f5f5;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.3s;
      `;
      
      const completedDate = new Date(record.completedAt).toLocaleString();
      const createdDate = new Date(record.createdAt).toLocaleString();
      const completedCount = record.completedTasks.length;
      const totalTasks = record.taskGroups.reduce((sum, group) => sum + group.tasks.length, 0);
      
      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
          <div style="flex: 1;">
            <div style="font-weight: bold; font-size: 16px; color: #333; margin-bottom: 5px;">
              ${record.goal}
            </div>
            <div style="font-size: 12px; color: #999;">
              角色：${record.charName} | 完成 ${completedCount}/${totalTasks} 个任务
            </div>
          </div>
        </div>
        <div style="font-size: 12px; color: #666; margin-top: 8px;">
          <div>开始：${createdDate}</div>
          <div>完成：${completedDate}</div>
        </div>
      `;
      
      item.onclick = () => {
        showTaskSplitterHistoryDetail(record);
      };
      
      listEl.appendChild(item);
    });
  }
  
  // 绑定关闭按钮
  const closeBtn = document.getElementById('task-splitter-history-close-btn');
  closeBtn.onclick = () => {
    modal.classList.remove('visible');
  };
  
  modal.classList.add('visible');
}

/**
 * 显示历史记录详情
 */
async function showTaskSplitterHistoryDetail(record) {
  // 创建一个详情模态框
  let detailModal = document.getElementById('task-splitter-history-detail-modal');
  if (!detailModal) {
    detailModal = document.createElement('div');
    detailModal.id = 'task-splitter-history-detail-modal';
    detailModal.className = 'modal';
    detailModal.innerHTML = `
      <div class="modal-content" style="width: 90%; max-width: 600px; max-height: 80%;">
        <div class="modal-header">
          <span>目标详情</span>
          <span id="task-splitter-history-detail-close-btn" style="cursor: pointer; font-size: 24px;">×</span>
        </div>
        <div class="modal-body" id="task-splitter-history-detail-content" style="padding: 20px; overflow-y: auto; max-height: calc(80vh - 100px);">
        </div>
      </div>
    `;
    document.body.appendChild(detailModal);
    
    document.getElementById('task-splitter-history-detail-close-btn').onclick = () => {
      detailModal.classList.remove('visible');
    };
  }
  
  const contentEl = document.getElementById('task-splitter-history-detail-content');
  const completedCount = record.completedTasks.length;
  const totalTasks = record.taskGroups.reduce((sum, group) => sum + group.tasks.length, 0);
  
  contentEl.innerHTML = `
    <div>
      <h3 style="margin-bottom: 15px; color: #333; font-size: 18px;">${record.goal}</h3>
      <div style="margin-bottom: 15px; padding: 12px; background: #f0f0f0; border-radius: 8px;">
        <div style="font-size: 13px; color: #666; margin-bottom: 5px;">开始语：</div>
        <div style="font-size: 14px; color: #333; line-height: 1.6;">${record.startMessage}</div>
      </div>
      <div style="margin-bottom: 15px;">
        <div style="font-size: 14px; font-weight: bold; margin-bottom: 10px; color: #333;">任务列表（完成 ${completedCount}/${totalTasks}）：</div>
        ${record.taskGroups.map((group) => `
          ${group.groupName ? `<div style="font-size: 14px; font-weight: bold; margin: 15px 0 8px 0; color: #4CAF50; padding-bottom: 5px; border-bottom: 2px solid #4CAF50;">${group.groupName}</div>` : ''}
          ${group.tasks.map((task) => `
            <div style="padding: 10px; margin: 5px 0; background: ${record.completedTasks.includes(task.id) ? '#e8f5e9' : '#fff3e0'}; border-left: 3px solid ${record.completedTasks.includes(task.id) ? '#4CAF50' : '#ff9800'}; border-radius: 4px;">
              <span style="margin-right: 8px; font-size: 16px;">${record.completedTasks.includes(task.id) ? '✓' : '○'}</span>
              <span style="text-decoration: ${record.completedTasks.includes(task.id) ? 'line-through' : 'none'}; color: ${record.completedTasks.includes(task.id) ? '#999' : '#333'};">
                ${task.content}
              </span>
            </div>
          `).join('')}
        `).join('')}
      </div>
      <div style="margin-top: 15px; padding: 12px; background: #e3f2fd; border-radius: 8px;">
        <div style="font-size: 13px; color: #666; margin-bottom: 5px;">结束语：</div>
        <div style="font-size: 14px; color: #333; line-height: 1.6;">${record.endMessage}</div>
      </div>
      <div style="margin-top: 15px; font-size: 12px; color: #999; text-align: center; padding-top: 15px; border-top: 1px solid #eee;">
        创建时间：${new Date(record.createdAt).toLocaleString()}<br>
        完成时间：${new Date(record.completedAt).toLocaleString()}
      </div>
    </div>
  `;
  
  detailModal.classList.add('visible');
}

/**
 * 保存当前任务进度
 */
function saveTaskProgress() {
  if (!currentTaskData || !activeTaskSplitterCharId) return;
  
  try {
    const progressData = {
      charId: currentTaskData.charId,
      goal: currentTaskData.goal,
      currentStatus: currentTaskData.currentStatus,
      startMessage: currentTaskData.startMessage,
      endMessage: currentTaskData.endMessage,
      taskGroups: currentTaskData.taskGroups,
      completedTasks: Array.from(currentTaskData.completedTasks),
      createdAt: currentTaskData.createdAt,
      savedAt: Date.now(),
    };
    
    // 使用charId作为key的一部分，这样每个角色有独立的进度
    localStorage.setItem(`task-splitter-progress-${activeTaskSplitterCharId}`, JSON.stringify(progressData));
  } catch (error) {
    console.error('保存任务进度失败:', error);
  }
}

/**
 * 加载保存的任务进度
 * @param {string} charId - 角色ID
 * @returns {object|null} - 保存的进度数据，如果没有则返回null
 */
function loadTaskProgress(charId) {
  try {
    const savedData = localStorage.getItem(`task-splitter-progress-${charId}`);
    if (!savedData) return null;
    
    const progressData = JSON.parse(savedData);
    
    // 检查数据是否完整
    if (!progressData.taskGroups || progressData.taskGroups.length === 0) {
      return null;
    }
    
    return progressData;
  } catch (error) {
    console.error('加载任务进度失败:', error);
    return null;
  }
}

/**
 * 清除保存的任务进度
 * @param {string} charId - 角色ID
 */
function clearTaskProgress(charId) {
  try {
    localStorage.removeItem(`task-splitter-progress-${charId}`);
  } catch (error) {
    console.error('清除任务进度失败:', error);
  }
}
