document.addEventListener('DOMContentLoaded', function() {
    loadBlockedChannels();
    setupEventListeners();
});

let allBlockedChannels = [];

function formatBlockedDate(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;

    const month = d.toLocaleString(undefined, { month: 'short' });
    const day = d.getDate();
    const year = d.getFullYear();

    const mod10 = day % 10;
    const mod100 = day % 100;
    let suffix = 'th';
    if (mod100 < 11 || mod100 > 13) {
        if (mod10 === 1) suffix = 'st';
        else if (mod10 === 2) suffix = 'nd';
        else if (mod10 === 3) suffix = 'rd';
    }

    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${month} ${day}${suffix}, ${year} ${hh}:${mm}`;
}

function setupEventListeners() {
    const clearAllBtn = document.getElementById('clearAllBtn');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', showClearAllModal);
    }

    const modalCloseBtn = document.getElementById('modalCloseBtn');
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', hideClearAllModal);
    }

    const modalClearBtn = document.getElementById('modalClearBtn');
    if (modalClearBtn) {
        modalClearBtn.addEventListener('click', confirmClearAll);
    }

    const channelSearch = document.getElementById('channelSearch');
    if (channelSearch) {
        channelSearch.addEventListener('input', () => {
            renderFilteredChannels();
        });
    }
}

function showClearAllModal() {
    const modal = document.getElementById('clearAllModal');
    if (modal) {
        modal.classList.add('modal-overlay--visible');
    }
}

function hideClearAllModal() {
    const modal = document.getElementById('clearAllModal');
    if (modal) {
        modal.classList.remove('modal-overlay--visible');
    }
}

async function confirmClearAll() {
    hideClearAllModal();
    await clearAllChannels();
}

async function loadBlockedChannels() {
    try {
        const response = await sendMessage({ action: 'getBlockedChannels' });

        if (response.success) {
            allBlockedChannels = response.channels || [];
            renderFilteredChannels();
            updateStats(allBlockedChannels);
            updateTotalVideosBlocked();
        } else {
            showError('Failed to load blocked channels');
        }
    } catch (error) {
        console.error('Error loading blocked channels:', error);
        showError('Error loading blocked channels');
    }
}

function renderFilteredChannels() {
    const channelSearch = document.getElementById('channelSearch');
    const query = (channelSearch && channelSearch.value ? channelSearch.value : '').trim().toLowerCase();

    const filtered = !query
        ? allBlockedChannels
        : allBlockedChannels.filter((c) => {
            const name = (c && c.channelName ? c.channelName : '').toString().toLowerCase();
            const id = (c && c.channelId ? c.channelId : '').toString().toLowerCase();
            return name.includes(query) || id.includes(query);
        });

    displayChannels(filtered);
}

async function updateTotalVideosBlocked() {
    const hiddenCount = document.getElementById('hiddenCount');
    if (!hiddenCount) return;

    try {
        const response = await sendMessage({ action: 'getTotalVideosBlocked' });
        if (response && response.success && typeof response.count === 'number') {
            hiddenCount.textContent = response.count;
        } else {
            hiddenCount.textContent = '0';
        }
    } catch (e) {
        hiddenCount.textContent = '0';
    }
}

function displayChannels(channels) {
    const content = document.getElementById('content');
    const clearAllBtn = document.getElementById('clearAllBtn');

    if (!allBlockedChannels || allBlockedChannels.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🚫</div>
                <div class="empty-text">No blocked channels</div>
                <div class="empty-subtext">Block channels will show up here</div>
            </div>
        `;
        clearAllBtn.style.display = 'none';
        return;
    }

    clearAllBtn.style.display = 'block';

    if (!channels || channels.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <div class="empty-text">No channels match your search</div>
            </div>
        `;
        return;
    }

    const channelList = document.createElement('div');
    channelList.className = 'channel-list';

    channels.forEach(channel => {
        const channelItem = createChannelItem(channel);
        channelList.appendChild(channelItem);
    });

    content.innerHTML = '';
    content.appendChild(channelList);
}

function createChannelItem(channel) {
    const item = document.createElement('div');
    item.className = 'channel-item';

    const info = document.createElement('div');
    info.className = 'channel-info';

    const name = document.createElement('div');
    name.className = 'channel-name';
    name.textContent = channel.channelName || 'Unknown Channel';
    name.style.cursor = 'pointer';
    name.addEventListener('click', () => {
        const id = (channel.channelId || '').toString().trim();
        if (!id) return;

        const url = id.startsWith('UC')
            ? `https://www.youtube.com/channel/${id}`
            : `https://www.youtube.com/@${id}`;

        chrome.tabs.create({ url });
    });

    const id = document.createElement('div');
    id.className = 'channel-id';
    id.textContent = channel.channelId || 'Unknown ID';

    const date = document.createElement('div');
    date.className = 'channel-date';
    const formatted = formatBlockedDate(channel.blockedAt);
    date.textContent = formatted ? `Blocked ${formatted}` : '';

    info.appendChild(name);
    info.appendChild(id);
    info.appendChild(date);

    const unblockBtn = document.createElement('button');
    unblockBtn.className = 'unblock-btn';
    unblockBtn.textContent = 'Unblock';
    unblockBtn.addEventListener('click', () => unblockChannel(channel.channelId, channel.channelName));

    item.appendChild(info);
    item.appendChild(unblockBtn);

    return item;
}

function updateStats(channels) {
    const blockedCount = document.getElementById('blockedCount');
    const hiddenCount = document.getElementById('hiddenCount');

    if (blockedCount) {
        blockedCount.textContent = channels ? channels.length : 0;
    }

    if (hiddenCount) {
        hiddenCount.textContent = '0';
    }
}

async function unblockChannel(channelId, channelName) {
    try {
        const response = await sendMessage({
            action: 'unblockChannel',
            channelId: channelId
        });

        if (response.success) {
            showNotification(`Channel "${channelName}" has been unblocked`);
            loadBlockedChannels();
        } else {
            showError('Failed to unblock channel');
        }
    } catch (error) {
        console.error('Error unblocking channel:', error);
        showError('Error unblocking channel');
    }
}

async function clearAllChannels() {
    try {
        const response = await sendMessage({ action: 'unblockAll' });
        if (response && response.success) {
            showNotification('All channels have been unblocked');
            loadBlockedChannels();
        } else {
            showError('Failed to unblock all channels');
        }
    } catch (error) {
        console.error('Error clearing all channels:', error);
        showError('Error clearing all channels');
    }
}

function sendMessage(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response);
            }
        });
    });
}

function ensureToastUi() {
    let root = document.getElementById('ytb-toast-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'ytb-toast-root';
        document.documentElement.appendChild(root);
    }
    return root;
}

function dismissToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.remove('ytb-toast--in');
    toast.classList.add('ytb-toast--out');
    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 160);
}

function showToast(message, type = 'success') {
    const root = ensureToastUi();
    const toast = document.createElement('div');
    const toastType = type === 'error' ? 'error' : 'success';
    const durationMs = toastType === 'error' ? 4500 : 3200;
    toast.className = `ytb-toast ytb-toast--${toastType} ytb-toast--in`;

    const iconSvg = toastType === 'error'
        ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 13c-.55 0-1-.45-1-1V7c0-.55.45-1 1-1s1 .45 1 1v7c0 .55-.45 1-1 1zm0 3c-.69 0-1.25-.56-1.25-1.25S11.31 15.5 12 15.5s1.25.56 1.25 1.25S12.69 18 12 18z"/></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.9-4.9 1.4 1.4-6.3 6.3z"/></svg>';

    toast.innerHTML = `
        <div class="ytb-toast__icon">${iconSvg}</div>
        <div class="ytb-toast__body">
            <div class="ytb-toast__message"></div>
            <div class="ytb-toast__bar"><div></div></div>
        </div>
        <button class="ytb-toast__close" aria-label="Dismiss notification">✕</button>
    `;

    const msgEl = toast.querySelector('.ytb-toast__message');
    if (msgEl) msgEl.textContent = message;

    const closeBtn = toast.querySelector('.ytb-toast__close');
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dismissToast(toast);
        });
    }

    root.insertBefore(toast, root.firstChild);

    while (root.childElementCount > 4) {
        const last = root.lastElementChild;
        if (!last) break;
        root.removeChild(last);
    }

    const barInner = toast.querySelector('.ytb-toast__bar > div');
    if (barInner) {
        barInner.animate(
            [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
            { duration: durationMs, easing: 'linear', fill: 'forwards' }
        );
    }

    setTimeout(() => dismissToast(toast), durationMs);
}

function showError(message) {
    showToast(message, 'error');
}

function showNotification(message) {
    showToast(message, 'success');
}