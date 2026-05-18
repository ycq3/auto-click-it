// ==UserScript==
// @name         自动点击助手
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  可以用鼠标选择元素，设置自动点击网页按钮的脚本
// @author       pipiqiang@pipiqiang.cn
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'auto_click_tasks';
    const SETTINGS_KEY = 'auto_click_settings';

    let isSelecting = false;
    let selectedElement = null;
    let tasks = [];
    let activeIntervals = [];
    let overlay = null;
    let controlPanel = null;
    let floatingIcon = null;
    let highlightBox = null;
    let panelCollapsed = false;
    let panelIconMode = false;
    let currentSettings = {};

    const SNAP_THRESHOLD = 30;
    const ICON_SIZE = 44;
    const nativeWindow = unsafeWindow || window;

    function init() {
        loadTasks();
        loadSettings();
        createHighlightBox();
        createFloatingIcon();
        createControlPanel();
        applySettings();
        startSavedTasks();
    }

    function loadTasks() {
        const savedTasks = GM_getValue(STORAGE_KEY, '[]');
        try {
            tasks = JSON.parse(savedTasks);
        } catch (e) {
            tasks = [];
        }
    }

    function saveTasks() {
        GM_setValue(STORAGE_KEY, JSON.stringify(tasks));
    }

    function loadSettings() {
        const domain = window.location.hostname;
        const allSettings = GM_getValue(SETTINGS_KEY, '{}');
        try {
            const parsed = JSON.parse(allSettings);
            currentSettings = parsed[domain] || {};
        } catch (e) {
            currentSettings = {};
        }
    }

    function saveSettings() {
        const domain = window.location.hostname;
        const allSettings = GM_getValue(SETTINGS_KEY, '{}');
        let parsed;
        try {
            parsed = JSON.parse(allSettings);
        } catch (e) {
            parsed = {};
        }
        parsed[domain] = currentSettings;
        GM_setValue(SETTINGS_KEY, JSON.stringify(parsed));
    }

    function applySettings() {
        if (currentSettings.iconMode) {
            enterIconMode();
        } else {
            exitIconMode();
        }

        if (currentSettings.panelLeft !== undefined && currentSettings.panelTop !== undefined) {
            const target = panelIconMode ? floatingIcon : controlPanel;
            if (target) {
                target.style.left = currentSettings.panelLeft + 'px';
                target.style.top = currentSettings.panelTop + 'px';
                target.style.right = 'auto';
                target.style.bottom = 'auto';
            }
        }

        if (currentSettings.collapsed && controlPanel) {
            const content = document.getElementById('panel-content');
            const toggle = document.getElementById('toggle-panel');
            if (content && toggle) {
                content.style.display = 'none';
                toggle.textContent = '+';
                panelCollapsed = true;
            }
        }

        if (currentSettings.snappedSide && floatingIcon) {
            applySnapPosition(currentSettings.snappedSide);
        }
    }

    function createHighlightBox() {
        highlightBox = document.createElement('div');
        highlightBox.style.cssText = `
            position: fixed;
            pointer-events: none;
            border: 2px solid #007bff;
            background: rgba(0, 123, 255, 0.15);
            z-index: 2147483647;
            display: none;
            border-radius: 2px;
            transition: all 0.05s ease;
        `;
        document.documentElement.appendChild(highlightBox);
    }

    function createFloatingIcon() {
        floatingIcon = document.createElement('div');
        floatingIcon.id = 'auto-click-icon';
        floatingIcon.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: ${ICON_SIZE}px;
            height: ${ICON_SIZE}px;
            background: linear-gradient(135deg, #007bff, #0056b3);
            border-radius: 50%;
            z-index: 2147483646;
            cursor: pointer;
            display: none;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 12px rgba(0, 123, 255, 0.4);
            font-size: 20px;
            user-select: none;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        `;
        floatingIcon.innerHTML = '🖱️';
        floatingIcon.title = '自动点击助手 - 点击展开';

        floatingIcon.addEventListener('mouseenter', () => {
            floatingIcon.style.transform = 'scale(1.15)';
            floatingIcon.style.boxShadow = '0 4px 20px rgba(0, 123, 255, 0.6)';
        });
        floatingIcon.addEventListener('mouseleave', () => {
            floatingIcon.style.transform = 'scale(1)';
            floatingIcon.style.boxShadow = '0 2px 12px rgba(0, 123, 255, 0.4)';
        });
        floatingIcon.addEventListener('click', () => {
            exitIconMode();
            currentSettings.iconMode = false;
            saveSettings();
        });

        document.documentElement.appendChild(floatingIcon);
        makeDraggableIcon(floatingIcon);
    }

    function enterIconMode() {
        panelIconMode = true;
        if (controlPanel) controlPanel.style.display = 'none';
        if (floatingIcon) {
            floatingIcon.style.display = 'flex';
            if (currentSettings.snappedSide) {
                applySnapPosition(currentSettings.snappedSide);
            }
        }
    }

    function exitIconMode() {
        panelIconMode = false;
        if (floatingIcon) floatingIcon.style.display = 'none';
        if (controlPanel) {
            controlPanel.style.display = 'block';
            if (currentSettings.panelLeft !== undefined && currentSettings.panelTop !== undefined) {
                controlPanel.style.left = currentSettings.panelLeft + 'px';
                controlPanel.style.top = currentSettings.panelTop + 'px';
                controlPanel.style.right = 'auto';
                controlPanel.style.bottom = 'auto';
            }
        }
    }

    function applySnapPosition(side) {
        const target = panelIconMode ? floatingIcon : controlPanel;
        if (!target) return;

        const rect = target.getBoundingClientRect();
        const vh = window.innerHeight;
        const vw = window.innerWidth;

        switch (side) {
            case 'left':
                target.style.left = '0px';
                target.style.top = Math.min(Math.max(rect.top, 0), vh - rect.height) + 'px';
                break;
            case 'right':
                target.style.left = (vw - rect.width) + 'px';
                target.style.top = Math.min(Math.max(rect.top, 0), vh - rect.height) + 'px';
                break;
            case 'top':
                target.style.top = '0px';
                target.style.left = Math.min(Math.max(rect.left, 0), vw - rect.width) + 'px';
                break;
            case 'bottom':
                target.style.top = (vh - rect.height) + 'px';
                target.style.left = Math.min(Math.max(rect.left, 0), vw - rect.width) + 'px';
                break;
        }
        target.style.right = 'auto';
        target.style.bottom = 'auto';
    }

    function checkSnap(el) {
        const rect = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const distances = {
            left: rect.left,
            right: vw - rect.right,
            top: rect.top,
            bottom: vh - rect.bottom
        };

        let nearestSide = null;
        let nearestDist = SNAP_THRESHOLD + 1;

        for (const [side, dist] of Object.entries(distances)) {
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestSide = side;
            }
        }

        if (nearestDist <= SNAP_THRESHOLD) {
            currentSettings.snappedSide = nearestSide;
            applySnapPosition(nearestSide);
        } else {
            currentSettings.snappedSide = null;
        }

        const finalRect = el.getBoundingClientRect();
        currentSettings.panelLeft = finalRect.left;
        currentSettings.panelTop = finalRect.top;
        saveSettings();
    }

    function makeDraggableIcon(el) {
        let isDragging = false;
        let hasMoved = false;
        let startX, startY, startLeft, startTop;

        function dragStart(e) {
            isDragging = true;
            hasMoved = false;
            startX = e.clientX;
            startY = e.clientY;
            const rect = el.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            e.preventDefault();

            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', dragEnd);
        }

        function drag(e) {
            if (!isDragging) return;
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) hasMoved = true;

            let newLeft = startLeft + deltaX;
            let newTop = startTop + deltaY;
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - el.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - el.offsetHeight));

            el.style.left = newLeft + 'px';
            el.style.top = newTop + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        }

        function dragEnd(e) {
            isDragging = false;
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', dragEnd);

            if (hasMoved) {
                checkSnap(el);
            }
        }

        el.addEventListener('mousedown', dragStart);
    }

    function createControlPanel() {
        controlPanel = document.createElement('div');
        controlPanel.id = 'auto-click-panel';
        controlPanel.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 300px;
            background: #fff;
            border: 2px solid #007bff;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 2147483646;
            font-family: Arial, sans-serif;
            font-size: 14px;
        `;
        controlPanel.innerHTML = `
                <div style="
                    background: #007bff;
                    color: white;
                    padding: 10px;
                    border-radius: 6px 6px 0 0;
                    font-weight: bold;
                    cursor: move;
                    user-select: none;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                " id="panel-header">
                    <span>🖱️ 自动点击助手</span>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span style="cursor: pointer; font-size: 16px;" id="minimize-to-icon" title="缩小为图标">◉</span>
                        <span style="cursor: pointer;" id="toggle-panel">−</span>
                    </div>
                </div>
                <div id="panel-content" style="padding: 15px;">
                    <div style="margin-bottom: 15px;">
                        <button id="select-element" style="
                            background: #28a745;
                            color: white;
                            border: none;
                            padding: 8px 16px;
                            border-radius: 4px;
                            cursor: pointer;
                            width: 100%;
                            margin-bottom: 10px;
                        ">选择元素</button>

                        <div style="margin-bottom: 10px;">
                            <label>点击间隔(秒):</label>
                            <input type="number" id="interval-input" value="5" min="1" style="
                                width: 60px;
                                padding: 4px;
                                border: 1px solid #ddd;
                                border-radius: 4px;
                                margin-left: 10px;
                            ">
                        </div>

                        <div style="margin-bottom: 10px;">
                            <label>任务名称:</label>
                            <input type="text" id="task-name" placeholder="例如: 刷新按钮" style="
                                width: 100%;
                                padding: 6px;
                                border: 1px solid #ddd;
                                border-radius: 4px;
                                margin-top: 5px;
                                box-sizing: border-box;
                            ">
                        </div>

                        <button id="add-task" style="
                            background: #007bff;
                            color: white;
                            border: none;
                            padding: 8px 16px;
                            border-radius: 4px;
                            cursor: pointer;
                            width: 100%;
                        ">添加任务</button>
                    </div>

                    <div id="task-list" style="
                        max-height: 200px;
                        overflow-y: auto;
                        border-top: 1px solid #eee;
                        padding-top: 10px;
                    "></div>
                </div>
        `;

        document.body.appendChild(controlPanel);
        bindPanelEvents();
        makeDraggablePanel();
        updateTaskList();
    }

    function bindPanelEvents() {
        document.getElementById('select-element').addEventListener('click', startElementSelection);
        document.getElementById('add-task').addEventListener('click', addTask);
        document.getElementById('toggle-panel').addEventListener('click', togglePanel);
        document.getElementById('minimize-to-icon').addEventListener('click', () => {
            currentSettings.iconMode = true;
            currentSettings.panelLeft = controlPanel.getBoundingClientRect().left;
            currentSettings.panelTop = controlPanel.getBoundingClientRect().top;
            saveSettings();
            enterIconMode();
        });
    }

    function makeDraggablePanel() {
        const header = document.getElementById('panel-header');
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        function dragStart(e) {
            if (e.target.id === 'toggle-panel' || e.target.id === 'minimize-to-icon') return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = controlPanel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            e.preventDefault();
            e.stopPropagation();

            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', dragEnd);
        }

        function drag(e) {
            if (!isDragging) return;
            e.preventDefault();
            e.stopPropagation();

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            let newLeft = startLeft + deltaX;
            let newTop = startTop + deltaY;
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - controlPanel.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - controlPanel.offsetHeight));

            controlPanel.style.left = newLeft + 'px';
            controlPanel.style.top = newTop + 'px';
            controlPanel.style.right = 'auto';
            controlPanel.style.bottom = 'auto';
        }

        function dragEnd(e) {
            if (!isDragging) return;
            isDragging = false;
            e.preventDefault();
            e.stopPropagation();

            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', dragEnd);

            checkSnap(controlPanel);
        }

        header.addEventListener('mousedown', dragStart);
    }

    function togglePanel() {
        const content = document.getElementById('panel-content');
        const toggle = document.getElementById('toggle-panel');

        if (content.style.display === 'none') {
            content.style.display = 'block';
            toggle.textContent = '−';
            panelCollapsed = false;
            currentSettings.collapsed = false;
        } else {
            content.style.display = 'none';
            toggle.textContent = '+';
            panelCollapsed = true;
            currentSettings.collapsed = true;
        }
        saveSettings();
    }

    function startElementSelection() {
        if (isSelecting) {
            stopElementSelection();
            return;
        }

        isSelecting = true;
        document.getElementById('select-element').textContent = '取消选择';
        document.getElementById('select-element').style.background = '#dc3545';

        createOverlay();
        document.addEventListener('mousemove', onMouseMoveForSelection, true);
        document.addEventListener('click', selectElement, true);

        showToast('请点击要自动点击的元素');
    }

    function stopElementSelection() {
        isSelecting = false;
        document.getElementById('select-element').textContent = '选择元素';
        document.getElementById('select-element').style.background = '#28a745';

        if (overlay) {
            overlay.remove();
            overlay = null;
        }

        document.removeEventListener('mousemove', onMouseMoveForSelection, true);
        document.removeEventListener('click', selectElement, true);

        if (highlightBox) {
            highlightBox.style.display = 'none';
        }
    }

    function createOverlay() {
        overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 123, 255, 0.05);
            z-index: 2147483645;
            pointer-events: none;
        `;
        document.body.appendChild(overlay);
    }

    function getRealElementAtPoint(x, y) {
        const elements = document.elementsFromPoint(x, y);
        for (const el of elements) {
            if (el.id === 'auto-click-panel' || el.closest('#auto-click-panel')) continue;
            if (el.id === 'auto-click-icon') continue;
            if (el === highlightBox) continue;
            if (el === overlay) continue;
            if (el === document.documentElement || el === document.body) continue;
            return el;
        }
        return null;
    }

    function onMouseMoveForSelection(e) {
        if (!isSelecting) return;

        const el = getRealElementAtPoint(e.clientX, e.clientY);
        if (!el) {
            highlightBox.style.display = 'none';
            return;
        }

        const rect = el.getBoundingClientRect();
        highlightBox.style.display = 'block';
        highlightBox.style.left = rect.left + 'px';
        highlightBox.style.top = rect.top + 'px';
        highlightBox.style.width = rect.width + 'px';
        highlightBox.style.height = rect.height + 'px';
    }

    function selectElement(e) {
        if (!isSelecting) return;

        const el = getRealElementAtPoint(e.clientX, e.clientY);
        if (!el) return;
        if (el.id === 'auto-click-panel' || el.closest('#auto-click-panel')) return;
        if (el.id === 'auto-click-icon') return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        selectedElement = el;
        stopElementSelection();

        const elementInfo = getElementInfo(selectedElement);
        showToast(`已选择: ${elementInfo}`);

        const taskNameInput = document.getElementById('task-name');
        if (!taskNameInput.value) {
            taskNameInput.value = elementInfo;
        }
    }

    function getElementInfo(element) {
        const tagName = element.tagName.toLowerCase();
        const text = element.textContent.trim().substring(0, 20);
        const id = element.id ? `#${element.id}` : '';
        const className = element.className && typeof element.className === 'string'
            ? `.${element.className.split(' ').filter(c => c.trim())[0]}`
            : '';

        return `${tagName}${id}${className}${text ? ` "${text}"` : ''}`;
    }

    function generateSelector(element) {
        if (element.id && document.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1) {
            return `#${CSS.escape(element.id)}`;
        }

        const path = [];
        let current = element;
        while (current && current !== document.documentElement && current !== document.body) {
            let selector = current.tagName.toLowerCase();

            if (current.id && document.querySelectorAll(`#${CSS.escape(current.id)}`).length === 1) {
                path.unshift(`#${CSS.escape(current.id)}`);
                break;
            }

            const parent = current.parentElement;
            if (parent) {
                const siblings = Array.from(parent.children).filter(
                    child => child.tagName === current.tagName
                );
                if (siblings.length > 1) {
                    const index = siblings.indexOf(current) + 1;
                    selector += `:nth-of-type(${index})`;
                }
            }

            if (current.className && typeof current.className === 'string') {
                const classes = current.className.split(' ')
                    .filter(c => c.trim() && !c.includes(':'))
                    .slice(0, 2);
                for (const cls of classes) {
                    selector += `.${CSS.escape(cls)}`;
                }
            }

            const attrs = ['data-id', 'data-action', 'data-testid', 'name', 'type', 'role', 'aria-label'];
            for (const attr of attrs) {
                if (current.hasAttribute(attr)) {
                    const val = current.getAttribute(attr);
                    selector += `[${attr}="${CSS.escape(val)}"]`;
                    break;
                }
            }

            path.unshift(selector);
            current = current.parentElement;
        }

        if (path.length > 4) {
            const last = path[path.length - 1];
            const secondLast = path[path.length - 2];
            return secondLast + ' > ' + last;
        }

        return path.join(' > ');
    }

    function addTask() {
        if (!selectedElement) {
            showToast('请先选择一个元素', 'error');
            return;
        }

        const interval = parseInt(document.getElementById('interval-input').value);
        const taskName = document.getElementById('task-name').value.trim();

        if (!taskName) {
            showToast('请输入任务名称', 'error');
            return;
        }

        if (interval < 1) {
            showToast('点击间隔必须大于0秒', 'error');
            return;
        }

        const selector = generateSelector(selectedElement);

        const verifyEl = document.querySelector(selector);
        if (!verifyEl) {
            showToast('选择器生成异常，请重新选择元素', 'error');
            return;
        }

        const task = {
            id: Date.now(),
            name: taskName,
            selector: selector,
            interval: interval,
            url: window.location.href,
            domain: window.location.hostname,
            active: false,
            created: new Date().toLocaleString()
        };

        tasks.push(task);
        saveTasks();
        updateTaskList();

        document.getElementById('task-name').value = '';
        selectedElement = null;

        showToast(`任务 "${taskName}" 已添加`);
    }

    function updateTaskList() {
        const taskList = document.getElementById('task-list');
        if (!taskList) return;

        if (tasks.length === 0) {
            taskList.innerHTML = '<div style="color: #666; text-align: center; padding: 20px;">暂无任务</div>';
            return;
        }

        const currentDomain = window.location.hostname;
        const relevantTasks = tasks.filter(task => task.domain === currentDomain);

        if (relevantTasks.length === 0) {
            taskList.innerHTML = '<div style="color: #666; text-align: center; padding: 20px;">当前域名无任务</div>';
            return;
        }

        taskList.innerHTML = '';
        relevantTasks.forEach(task => {
            const taskDiv = document.createElement('div');
            taskDiv.style.cssText = `
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 10px;
                margin-bottom: 10px;
                background: ${task.active ? '#e8f5e8' : '#f8f9fa'};
            `;

            taskDiv.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 5px; word-break: break-all;">${task.name}</div>
                <div style="font-size: 12px; color: #666; margin-bottom: 4px; word-break: break-all;">
                    选择器: ${task.selector}
                </div>
                <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                    间隔: ${task.interval}秒 | 创建: ${task.created}
                </div>
                <div style="display: flex; gap: 5px;">
                    <button class="toggle-btn" style="
                        background: ${task.active ? '#dc3545' : '#28a745'};
                        color: white;
                        border: none;
                        padding: 4px 8px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 12px;
                    ">
                        ${task.active ? '停止' : '启动'}
                    </button>
                    <button class="delete-btn" style="
                        background: #6c757d;
                        color: white;
                        border: none;
                        padding: 4px 8px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 12px;
                    ">
                        删除
                    </button>
                </div>
            `;

            const toggleBtn = taskDiv.querySelector('.toggle-btn');
            const deleteBtn = taskDiv.querySelector('.delete-btn');

            toggleBtn.addEventListener('click', () => toggleTask(task.id));
            deleteBtn.addEventListener('click', () => deleteTask(task.id));

            taskList.appendChild(taskDiv);
        });
    }

    function toggleTask(taskId) {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        if (task.active) {
            stopTask(taskId);
        } else {
            startTask(taskId);
        }
    }

    function simulateClick(element) {
        const rect = element.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        const eventInit = {
            bubbles: true,
            cancelable: true,
            view: nativeWindow,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
            button: 0,
            buttons: 1
        };

        const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
        for (const eventType of events) {
            const event = new MouseEvent(eventType, eventInit);
            element.dispatchEvent(event);
        }
    }

    function isElementRendered(el) {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function performClick(element) {
        if (!isElementRendered(element)) {
            console.warn(`[自动点击助手] 元素无有效尺寸`);
            return false;
        }

        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const inViewport = rect.bottom > 0 && rect.right > 0 &&
            rect.top < window.innerHeight && rect.left < window.innerWidth;

        if (inViewport) {
            simulateClick(element);
            return true;
        }

        const scrollContainer = element.scrollIntoView
            ? element
            : findScrollableParent(element);

        if (scrollContainer && scrollContainer !== document.documentElement && scrollContainer !== document.body) {
            scrollContainer.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
        } else {
            const targetY = centerY - window.innerHeight / 2;
            const targetX = centerX - window.innerWidth / 2;
            window.scrollTo({ left: targetX, top: targetY, behavior: 'instant' });
        }

        simulateClick(element);
        return true;
    }

    function findScrollableParent(el) {
        let parent = el.parentElement;
        while (parent && parent !== document.documentElement) {
            const style = window.getComputedStyle(parent);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll' ||
                style.overflowX === 'auto' || style.overflowX === 'scroll') {
                return parent;
            }
            parent = parent.parentElement;
        }
        return null;
    }

    function startTask(taskId) {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        const element = document.querySelector(task.selector);
        if (!element) {
            showToast(`找不到元素: ${task.selector}`, 'error');
            return;
        }

        if (!isElementRendered(element)) {
            showToast(`元素 "${task.name}" 无有效尺寸，无法点击`, 'error');
            return;
        }

        task.active = true;
        const intervalId = setInterval(() => {
            const currentElement = document.querySelector(task.selector);
            if (currentElement) {
                if (isElementRendered(currentElement)) {
                    performClick(currentElement);
                    console.log(`[自动点击助手] 点击: ${task.name}`);
                } else {
                    console.warn(`[自动点击助手] 元素无有效尺寸: ${task.name}`);
                }
            } else {
                console.warn(`[自动点击助手] 元素不存在: ${task.name}`);
                stopTask(taskId);
            }
        }, task.interval * 1000);

        activeIntervals.push({ taskId, intervalId });
        saveTasks();
        updateTaskList();

        showToast(`任务 "${task.name}" 已启动`);
    }

    function stopTask(taskId) {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        task.active = false;
        const intervalIndex = activeIntervals.findIndex(item => item.taskId === taskId);

        if (intervalIndex !== -1) {
            clearInterval(activeIntervals[intervalIndex].intervalId);
            activeIntervals.splice(intervalIndex, 1);
        }

        saveTasks();
        updateTaskList();

        showToast(`任务 "${task.name}" 已停止`);
    }

    function deleteTask(taskId) {
        if (!confirm('确定要删除这个任务吗？')) return;

        stopTask(taskId);
        tasks = tasks.filter(t => t.id !== taskId);
        saveTasks();
        updateTaskList();

        showToast('任务已删除');
    }

    function startSavedTasks() {
        const currentDomain = window.location.hostname;
        const relevantTasks = tasks.filter(task =>
            task.domain === currentDomain && task.active
        );

        relevantTasks.forEach(task => {
            setTimeout(() => {
                const element = document.querySelector(task.selector);
                if (element) {
                    task.active = false;
                    startTask(task.id);
                } else {
                    console.warn(`[自动点击助手] 页面加载后找不到元素: ${task.name}`);
                    task.active = false;
                    saveTasks();
                }
            }, 2000);
        });
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 50px;
            right: 20px;
            background: ${type === 'error' ? '#dc3545' : '#28a745'};
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            z-index: 2147483647;
            font-family: Arial, sans-serif;
            font-size: 14px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            max-width: 300px;
            word-break: break-all;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.transition = 'opacity 0.3s';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
