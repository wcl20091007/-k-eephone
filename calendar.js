/**
 * 日历App功能
 */

let currentCalendarDate = new Date();
let selectedDate = null; // 当前选中的日期 (YYYY-MM-DD格式)
let currentTab = 'events'; // 当前显示的标签：'events' 或 'todos'

/**
 * 初始化日历App
 */
function initCalendar() {
  // 渲染当前月份
  renderCalendar(currentCalendarDate);

  // 绑定月份切换按钮
  document.getElementById('calendar-prev-month').addEventListener('click', () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    renderCalendar(currentCalendarDate);
  });

  document.getElementById('calendar-next-month').addEventListener('click', () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    renderCalendar(currentCalendarDate);
  });

  // 绑定"今天"按钮
  document.getElementById('calendar-today-btn').addEventListener('click', () => {
    currentCalendarDate = new Date();
    selectedDate = formatDate(new Date());
    renderCalendar(currentCalendarDate);
    loadDayInfo(selectedDate);
  });

  // 绑定标签切换
  document.getElementById('calendar-tab-events').addEventListener('click', () => switchTab('events'));
  document.getElementById('calendar-tab-todos').addEventListener('click', () => switchTab('todos'));

  // 绑定添加行程按钮
  document.getElementById('calendar-add-event-btn').addEventListener('click', () => openAddEventModal());
  document.getElementById('calendar-save-event-btn').addEventListener('click', () => saveEvent());
  document.getElementById('calendar-cancel-event-btn').addEventListener('click', () => closeAddEventModal());
  document.getElementById('calendar-close-event-modal').addEventListener('click', () => closeAddEventModal());

  // 绑定添加待办按钮
  document.getElementById('calendar-add-todo-btn').addEventListener('click', () => openAddTodoModal());
  document.getElementById('calendar-save-todo-btn').addEventListener('click', () => saveTodo());
  document.getElementById('calendar-cancel-todo-btn').addEventListener('click', () => closeAddTodoModal());
  document.getElementById('calendar-close-todo-modal').addEventListener('click', () => closeAddTodoModal());
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 将数字转换为罗马数字
 */
function toRomanNumeral(num) {
  const romanNumerals = [
    { value: 1000, numeral: 'M' },
    { value: 900, numeral: 'CM' },
    { value: 500, numeral: 'D' },
    { value: 400, numeral: 'CD' },
    { value: 100, numeral: 'C' },
    { value: 90, numeral: 'XC' },
    { value: 50, numeral: 'L' },
    { value: 40, numeral: 'XL' },
    { value: 10, numeral: 'X' },
    { value: 9, numeral: 'IX' },
    { value: 5, numeral: 'V' },
    { value: 4, numeral: 'IV' },
    { value: 1, numeral: 'I' }
  ];

  let result = '';
  for (const { value, numeral } of romanNumerals) {
    const count = Math.floor(num / value);
    result += numeral.repeat(count);
    num -= value * count;
  }
  return result;
}

/**
 * 渲染日历
 * @param {Date} date - 要显示的月份日期
 */
async function renderCalendar(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  // 检查DOM元素是否存在
  const monthYearEl = document.getElementById('calendar-month-year');
  const grid = document.getElementById('calendar-grid');
  
  if (!monthYearEl || !grid) {
    console.warn('日历DOM元素未找到，可能还未加载完成');
    return;
  }

  // 更新月份年份标题（只显示数字，不用年和月字）
  monthYearEl.textContent = `${year} ${month + 1}`;

  // 获取月份的第一天和最后一天
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay(); // 0 = 星期日

  // 清空日历网格
  grid.innerHTML = '';

  // 添加空白单元格（月初之前的空白）
  for (let i = 0; i < startingDayOfWeek; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.style.padding = '12px';
    emptyCell.style.minHeight = '50px';
    grid.appendChild(emptyCell);
  }

  // 获取该月所有有行程和待办事项的日期（用于显示小点）
  const monthStart = formatDate(new Date(year, month, 1));
  const monthEnd = formatDate(new Date(year, month + 1, 0));
  
  // 使用 try-catch 处理数据库查询错误，确保即使查询失败也能显示日期
  let datesWithEvents = new Set();
  let datesWithTodos = new Set();
  
  try {
    if (db && db.calendarEvents) {
      const eventsInMonth = await db.calendarEvents
        .where('date')
        .between(monthStart, monthEnd, true, true)
        .toArray();
      datesWithEvents = new Set(eventsInMonth.map(e => e.date));
    }
  } catch (error) {
    console.warn('查询行程数据失败:', error);
  }
  
  try {
    if (db && db.calendarTodos) {
      const todosInMonth = await db.calendarTodos
        .where('date')
        .between(monthStart, monthEnd, true, true)
        .toArray();
      datesWithTodos = new Set(todosInMonth.map(t => t.date));
    }
  } catch (error) {
    console.warn('查询待办数据失败:', error);
  }

  // 添加日期单元格
  for (let day = 1; day <= daysInMonth; day++) {
    const dayDate = new Date(year, month, day);
    const dateStr = formatDate(dayDate);
    const isToday = isCurrentMonth && day === today.getDate();
    
    // 检查该日期是否有行程或待办事项
    const hasEvents = datesWithEvents.has(dateStr);
    const hasTodos = datesWithTodos.has(dateStr);
    const hasAnyItem = hasEvents || hasTodos;
    
    const isSelected = selectedDate === dateStr;

    const dayCell = document.createElement('div');
    dayCell.style.padding = '12px';
    dayCell.style.minHeight = '50px';
    dayCell.style.borderRadius = '8px';
    dayCell.style.cursor = 'pointer';
    dayCell.style.transition = 'all 0.2s';
    dayCell.style.textAlign = 'center';
    dayCell.style.display = 'flex';
    dayCell.style.flexDirection = 'column';
    dayCell.style.alignItems = 'center';
    dayCell.style.justifyContent = 'center';
    dayCell.style.fontSize = '16px';
    dayCell.style.fontWeight = '500';
    dayCell.style.position = 'relative';

    // 设置样式
    if (isSelected) {
      dayCell.style.backgroundColor = 'var(--accent-color)';
      dayCell.style.color = 'white';
      dayCell.style.border = '2px solid var(--accent-color)';
    } else if (isToday) {
      dayCell.style.backgroundColor = 'rgba(var(--accent-color-rgb), 0.2)';
      dayCell.style.color = 'var(--accent-color)';
      dayCell.style.border = '2px solid var(--accent-color)';
    } else {
      dayCell.style.color = 'var(--text-primary)';
      dayCell.style.border = '2px solid transparent';
    }

    // 如果有行程或待办事项，显示小点
    if (hasAnyItem && !isSelected) {
      const dot = document.createElement('div');
      dot.style.width = '6px';
      dot.style.height = '6px';
      dot.style.borderRadius = '50%';
      dot.style.backgroundColor = isToday ? 'var(--accent-color)' : '#888';
      dot.style.marginTop = '4px';
      dayCell.appendChild(dot);
    }

    // 日期数字
    const dayNumber = document.createElement('div');
    dayNumber.textContent = day;
    dayCell.insertBefore(dayNumber, dayCell.firstChild);

    // 点击事件
    dayCell.addEventListener('click', () => {
      selectedDate = dateStr;
      // 如果选中的日期不在当前显示的月份，切换到那个月份
      if (year !== currentCalendarDate.getFullYear() || month !== currentCalendarDate.getMonth()) {
        currentCalendarDate = new Date(year, month, day);
      }
      renderCalendar(currentCalendarDate);
      loadDayInfo(selectedDate);
    });

    // 鼠标悬停效果
    dayCell.addEventListener('mouseenter', () => {
      if (!isSelected && !isToday) {
        dayCell.style.backgroundColor = 'var(--secondary-bg)';
      }
    });
    dayCell.addEventListener('mouseleave', () => {
      if (!isSelected && !isToday) {
        dayCell.style.backgroundColor = 'transparent';
      }
    });

    grid.appendChild(dayCell);
  }
}

/**
 * 加载选中日期的信息
 */
async function loadDayInfo(dateStr) {
  const dateObj = new Date(dateStr);
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
  
  // 只显示月日，使用中文格式：1月1日
  const dateText = `${month}月${day}日`;
  document.getElementById('calendar-selected-date').textContent = dateText;
  
  // 显示日期信息区域，并设置为独立卡片样式
  const dayInfoEl = document.getElementById('calendar-day-info');
  document.getElementById('calendar-no-selection').style.display = 'none';
  dayInfoEl.style.display = 'block';
  
  // 设置卡片样式：泡泡框样式
  dayInfoEl.style.padding = '20px';
  dayInfoEl.style.borderRadius = '16px';
  dayInfoEl.style.backgroundColor = 'var(--secondary-bg)';
  dayInfoEl.style.border = '1px solid var(--border-color)';
  dayInfoEl.style.boxShadow = '0 2px 12px rgba(0, 0, 0, 0.08)';
  dayInfoEl.style.margin = '0';
  dayInfoEl.style.position = 'relative';

  // 添加卡片关闭按钮（如果还没有的话）
  let closeBtn = dayInfoEl.querySelector('.calendar-card-close-btn');
  if (!closeBtn) {
    closeBtn = document.createElement('button');
    closeBtn.className = 'calendar-card-close-btn';
    closeBtn.textContent = '❌';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '12px';
    closeBtn.style.right = '12px';
    closeBtn.style.background = 'transparent';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '16px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '4px';
    closeBtn.style.width = '28px';
    closeBtn.style.height = '28px';
    closeBtn.style.display = 'flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.justifyContent = 'center';
    closeBtn.style.borderRadius = '50%';
    closeBtn.style.transition = 'background-color 0.2s';
    closeBtn.style.zIndex = '10';
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.backgroundColor = 'transparent';
    });
    closeBtn.addEventListener('click', () => {
      dayInfoEl.style.display = 'none';
      document.getElementById('calendar-no-selection').style.display = 'block';
      selectedDate = null; // 清除选中的日期
    });
    dayInfoEl.appendChild(closeBtn);
  }

  // 加载行程和待办事项
  await loadEvents(dateStr);
  await loadTodos(dateStr);
}

/**
 * 加载行程列表
 */
async function loadEvents(dateStr) {
  const events = await db.calendarEvents
    .where('date')
    .equals(dateStr)
    .sortBy('time');

  const eventsList = document.getElementById('calendar-events-list');
  eventsList.innerHTML = '';

  if (events.length === 0) {
    eventsList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">暂无行程</p>';
    return;
  }

  events.forEach(event => {
    const eventItem = document.createElement('div');
    eventItem.style.padding = '16px';
    eventItem.style.borderRadius = '16px';
    eventItem.style.backgroundColor = 'var(--secondary-bg)';
    eventItem.style.border = '1px solid var(--border-color)';
    eventItem.style.position = 'relative';
    eventItem.style.marginBottom = '12px';
    eventItem.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08)';

    const eventContent = document.createElement('div');

    const timeDiv = document.createElement('div');
    timeDiv.style.fontSize = '14px';
    timeDiv.style.fontWeight = '600';
    timeDiv.style.color = 'var(--accent-color)';
    timeDiv.style.marginBottom = '8px';
    timeDiv.textContent = event.time;

    const contentDiv = document.createElement('div');
    contentDiv.style.fontSize = '14px';
    contentDiv.style.color = 'var(--text-primary)';
    contentDiv.style.lineHeight = '1.5';
    contentDiv.textContent = event.content;

    eventContent.appendChild(timeDiv);
    eventContent.appendChild(contentDiv);

    eventItem.appendChild(eventContent);
    
    // 添加长按事件
    addLongPressListener(eventItem, () => showEventActionMenu(event, dateStr));
    
    eventsList.appendChild(eventItem);
  });
}

/**
 * 加载待办事项列表
 */
async function loadTodos(dateStr) {
  const todos = await db.calendarTodos
    .where('date')
    .equals(dateStr)
    .toArray();

  const todosList = document.getElementById('calendar-todos-list');
  todosList.innerHTML = '';

  if (todos.length === 0) {
    todosList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">暂无待办事项</p>';
    return;
  }

  todos.forEach(todo => {
    const todoItem = document.createElement('div');
    todoItem.style.padding = '12px';
    todoItem.style.borderRadius = '8px';
    todoItem.style.backgroundColor = 'var(--secondary-bg)';
    todoItem.style.border = '1px solid var(--border-color)';
    todoItem.style.display = 'flex';
    todoItem.style.alignItems = 'center';
    todoItem.style.gap = '10px';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = todo.completed;
    checkbox.style.width = '20px';
    checkbox.style.height = '20px';
    checkbox.addEventListener('change', async () => {
      await db.calendarTodos.update(todo.id, { completed: checkbox.checked });
      await loadTodos(dateStr);
    });

    const contentDiv = document.createElement('div');
    contentDiv.style.flex = '1';
    contentDiv.style.fontSize = '14px';
    contentDiv.style.color = todo.completed ? 'var(--text-secondary)' : 'var(--text-primary)';
    contentDiv.style.textDecoration = todo.completed ? 'line-through' : 'none';
    contentDiv.textContent = todo.content;

    todoItem.appendChild(checkbox);
    todoItem.appendChild(contentDiv);
    
    // 添加长按事件
    addLongPressListener(todoItem, () => showTodoActionMenu(todo, dateStr));
    
    todosList.appendChild(todoItem);
  });
}

/**
 * 切换标签
 */
function switchTab(tab) {
  currentTab = tab;
  
  // 更新按钮样式
  document.querySelectorAll('.calendar-tab-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.style.borderBottomColor = 'transparent';
    btn.style.color = 'var(--text-secondary)';
  });

  if (tab === 'events') {
    const btn = document.getElementById('calendar-tab-events');
    btn.classList.add('active');
    btn.style.borderBottomColor = 'var(--accent-color)';
    btn.style.color = 'var(--accent-color)';
    document.getElementById('calendar-events-content').style.display = 'block';
    document.getElementById('calendar-todos-content').style.display = 'none';
  } else {
    const btn = document.getElementById('calendar-tab-todos');
    btn.classList.add('active');
    btn.style.borderBottomColor = 'var(--accent-color)';
    btn.style.color = 'var(--accent-color)';
    document.getElementById('calendar-events-content').style.display = 'none';
    document.getElementById('calendar-todos-content').style.display = 'block';
  }
}

/**
 * 打开添加行程模态框
 */
function openAddEventModal() {
  editingEventId = null;
  const modal = document.getElementById('calendar-add-event-modal');
  modal.classList.add('visible');
  
  // 设置默认日期为选中的日期
  document.getElementById('calendar-event-date').value = selectedDate || formatDate(new Date());
  document.getElementById('calendar-event-time').value = '';
  document.getElementById('calendar-event-content').value = '';
  
  // 重置标题
  const header = modal.querySelector('.modal-header span:first-child');
  if (header) header.textContent = '添加行程';
}

/**
 * 关闭添加行程模态框
 */
function closeAddEventModal() {
  document.getElementById('calendar-add-event-modal').classList.remove('visible');
}

/**
 * 保存行程
 */
async function saveEvent() {
  const date = document.getElementById('calendar-event-date').value;
  const time = document.getElementById('calendar-event-time').value;
  const content = document.getElementById('calendar-event-content').value.trim();

  if (!date || !time || !content) {
    alert('请填写完整信息');
    return;
  }

  await db.calendarEvents.add({
    date,
    time,
    content,
    type: 'event'
  });

  closeAddEventModal();
  
  // 如果选中的是当前日期，刷新显示
  if (selectedDate === date) {
    await loadEvents(date);
  }
  
  // 刷新日历以更新小点
  renderCalendar(currentCalendarDate);
  alert('行程已添加！');
}

/**
 * 打开添加待办事项模态框
 */
function openAddTodoModal() {
  editingTodoId = null;
  const modal = document.getElementById('calendar-add-todo-modal');
  modal.classList.add('visible');
  
  // 设置默认日期为选中的日期
  document.getElementById('calendar-todo-date').value = selectedDate || formatDate(new Date());
  document.getElementById('calendar-todo-content').value = '';
  
  // 重置标题
  const header = modal.querySelector('.modal-header span:first-child');
  if (header) header.textContent = '添加待办事项';
}

/**
 * 关闭添加待办事项模态框
 */
function closeAddTodoModal() {
  document.getElementById('calendar-add-todo-modal').classList.remove('visible');
}

/**
 * 保存待办事项
 */
async function saveTodo() {
  const date = document.getElementById('calendar-todo-date').value;
  const content = document.getElementById('calendar-todo-content').value.trim();

  if (!date || !content) {
    alert('请填写完整信息');
    return;
  }

  await db.calendarTodos.add({
    date,
    content,
    completed: false
  });

  closeAddTodoModal();
  
  // 如果选中的是当前日期，刷新显示
  if (selectedDate === date) {
    await loadTodos(date);
  }
  
  alert('待办事项已添加！');
}

/**
 * 显示行程操作菜单（编辑/删除）
 */
function showEventActionMenu(event, dateStr) {
  const options = [
    { text: '编辑', value: 'edit' },
    { text: '删除', value: 'delete' }
  ];
  
  showChoiceModal('选择操作', options).then(async (choice) => {
    if (choice === 'edit') {
      openEditEventModal(event);
    } else if (choice === 'delete') {
      if (confirm('确定要删除这个行程吗？')) {
        await db.calendarEvents.delete(event.id);
        await loadEvents(dateStr);
        renderCalendar(currentCalendarDate); // 刷新日历以更新小点
      }
    }
  });
}

/**
 * 显示待办事项操作菜单（编辑/删除）
 */
function showTodoActionMenu(todo, dateStr) {
  const options = [
    { text: '编辑', value: 'edit' },
    { text: '删除', value: 'delete' }
  ];
  
  showChoiceModal('选择操作', options).then(async (choice) => {
    if (choice === 'edit') {
      openEditTodoModal(todo);
    } else if (choice === 'delete') {
      if (confirm('确定要删除这个待办事项吗？')) {
        await db.calendarTodos.delete(todo.id);
        await loadTodos(dateStr);
      }
    }
  });
}

let editingEventId = null;
let editingTodoId = null;

/**
 * 打开编辑行程模态框
 */
function openEditEventModal(event) {
  editingEventId = event.id;
  const modal = document.getElementById('calendar-add-event-modal');
  modal.classList.add('visible');
  
  document.getElementById('calendar-event-date').value = event.date;
  document.getElementById('calendar-event-time').value = event.time;
  document.getElementById('calendar-event-content').value = event.content;
  
  // 更新标题
  const header = modal.querySelector('.modal-header span:first-child');
  header.textContent = '编辑行程';
}

/**
 * 打开编辑待办事项模态框
 */
function openEditTodoModal(todo) {
  editingTodoId = todo.id;
  const modal = document.getElementById('calendar-add-todo-modal');
  modal.classList.add('visible');
  
  document.getElementById('calendar-todo-date').value = todo.date;
  document.getElementById('calendar-todo-content').value = todo.content;
  
  // 更新标题
  const header = modal.querySelector('.modal-header span:first-child');
  header.textContent = '编辑待办事项';
}

/**
 * 修改保存行程函数，支持编辑
 */
async function saveEvent() {
  const date = document.getElementById('calendar-event-date').value;
  const time = document.getElementById('calendar-event-time').value;
  const content = document.getElementById('calendar-event-content').value.trim();

  if (!date || !time || !content) {
    alert('请填写完整信息');
    return;
  }

  if (editingEventId) {
    // 编辑模式
    await db.calendarEvents.update(editingEventId, {
      date,
      time,
      content
    });
    editingEventId = null;
    alert('行程已更新！');
  } else {
    // 新建模式
    await db.calendarEvents.add({
      date,
      time,
      content,
      type: 'event'
    });
    alert('行程已添加！');
  }

  closeAddEventModal();
  
  // 如果选中的是当前日期，刷新显示
  if (selectedDate === date) {
    await loadEvents(date);
  }
  
  // 刷新日历以更新小点
  renderCalendar(currentCalendarDate);
}

/**
 * 修改保存待办事项函数，支持编辑
 */
async function saveTodo() {
  const date = document.getElementById('calendar-todo-date').value;
  const content = document.getElementById('calendar-todo-content').value.trim();

  if (!date || !content) {
    alert('请填写完整信息');
    return;
  }

  if (editingTodoId) {
    // 编辑模式
    await db.calendarTodos.update(editingTodoId, {
      date,
      content
    });
    editingTodoId = null;
    alert('待办事项已更新！');
  } else {
    // 新建模式
    await db.calendarTodos.add({
      date,
      content,
      completed: false
    });
    alert('待办事项已添加！');
  }

  closeAddTodoModal();
  
  // 如果选中的是当前日期，刷新显示
  if (selectedDate === date) {
    await loadTodos(date);
  }
}

/**
 * 修改关闭模态框函数，重置编辑状态
 */
function closeAddEventModal() {
  document.getElementById('calendar-add-event-modal').classList.remove('visible');
  editingEventId = null;
  // 重置标题
  const header = document.querySelector('#calendar-add-event-modal .modal-header span:first-child');
  if (header) header.textContent = '添加行程';
}

function closeAddTodoModal() {
  document.getElementById('calendar-add-todo-modal').classList.remove('visible');
  editingTodoId = null;
  // 重置标题
  const header = document.querySelector('#calendar-add-todo-modal .modal-header span:first-child');
  if (header) header.textContent = '添加待办事项';
}

// 当DOM加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCalendar);
} else {
  initCalendar();
}
