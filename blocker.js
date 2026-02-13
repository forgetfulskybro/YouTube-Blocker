const BLOCKED_CHANNELS_KEY = 'blockedChannels';
const TOTAL_VIDEOS_BLOCKED_KEY = 'totalVideosBlocked';

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get([BLOCKED_CHANNELS_KEY, TOTAL_VIDEOS_BLOCKED_KEY], (result) => {
        if (!result[BLOCKED_CHANNELS_KEY]) {
            chrome.storage.sync.set({ [BLOCKED_CHANNELS_KEY]: [] });
        }
        if (result[TOTAL_VIDEOS_BLOCKED_KEY] === undefined) {
            chrome.storage.sync.set({ [TOTAL_VIDEOS_BLOCKED_KEY]: 0 });
        }
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'blockChannel') {
        blockChannel(request.channelName, request.channelId)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    if (request.action === 'unblockChannel') {
        unblockChannel(request.channelId)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    if (request.action === 'getBlockedChannels') {
        getBlockedChannels()
            .then(channels => sendResponse({ success: true, channels }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    if (request.action === 'unblockAll') {
        unblockAll()
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    if (request.action === 'isChannelBlocked') {
        isChannelBlocked(request.channelId)
            .then(blocked => sendResponse({ success: true, blocked }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    if (request.action === 'getTotalVideosBlocked') {
        getTotalVideosBlocked()
            .then(count => sendResponse({ success: true, count }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    if (request.action === 'incrementVideosBlocked') {
        incrementVideosBlocked()
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

async function blockChannel(channelName, channelId) {
    try {
        const normalizedChannelId = (channelId || '').toString().trim();
        if (!normalizedChannelId) {
            throw new Error('Could not identify channel ID');
        }
        const result = await chrome.storage.sync.get([BLOCKED_CHANNELS_KEY]);
        const blockedChannels = result[BLOCKED_CHANNELS_KEY] || [];
        if (blockedChannels.some(channel => (channel.channelId || '').toString().trim() === normalizedChannelId)) {
            throw new Error('Channel is already blocked');
        }
        const newChannel = {
            channelId: normalizedChannelId,
            channelName: channelName || 'Unknown Channel',
            blockedAt: new Date().toISOString()
        };
        blockedChannels.push(newChannel);
        await chrome.storage.sync.set({ [BLOCKED_CHANNELS_KEY]: blockedChannels });

        console.log('Channel blocked:', newChannel);
        const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { 
                action: 'channelBlocked', 
                channelId: normalizedChannelId 
            }).catch(() => {
            });
        });
    } catch (error) {
        console.error('Error blocking channel:', error);
        throw error;
    }
}

async function unblockChannel(channelId) {
    try {
        const result = await chrome.storage.sync.get([BLOCKED_CHANNELS_KEY]);
        const blockedChannels = result[BLOCKED_CHANNELS_KEY] || [];
        const filteredChannels = blockedChannels.filter(channel => channel.channelId !== channelId);
        if (filteredChannels.length === blockedChannels.length) {
            throw new Error('Channel not found in blocked list');
        }
        await chrome.storage.sync.set({ [BLOCKED_CHANNELS_KEY]: filteredChannels });
        console.log('Channel unblocked:', channelId);
        const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { 
                action: 'channelUnblocked', 
                channelId: channelId 
            }).catch(() => {
            });
        });
    } catch (error) {
        console.error('Error unblocking channel:', error);
        throw error;
    }
}

async function unblockAll() {
    try {
        await chrome.storage.sync.set({ [BLOCKED_CHANNELS_KEY]: [] });
        console.log('All channels unblocked');
        const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'unblockedAll'
            }).catch(() => {
            });
        });
    } catch (error) {
        console.error('Error unblocking all channels:', error);
        throw error;
    }
}

async function getBlockedChannels() {
    try {
        const result = await chrome.storage.sync.get([BLOCKED_CHANNELS_KEY]);
        return result[BLOCKED_CHANNELS_KEY] || [];
    } catch (error) {
        console.error('Error getting blocked channels:', error);
        throw error;
    }
}

async function isChannelBlocked(channelId) {
    try {
        const blockedChannels = await getBlockedChannels();
        return blockedChannels.some(channel => channel.channelId === channelId);
    } catch (error) {
        console.error('Error checking if channel is blocked:', error);
        throw error;
    }
}

async function getTotalVideosBlocked() {
    try {
        const result = await chrome.storage.sync.get([TOTAL_VIDEOS_BLOCKED_KEY]);
        return result[TOTAL_VIDEOS_BLOCKED_KEY] || 0;
    } catch (error) {
        console.error('Error getting total videos blocked:', error);
        throw error;
    }
}

async function incrementVideosBlocked() {
    try {
        const result = await chrome.storage.sync.get([TOTAL_VIDEOS_BLOCKED_KEY]);
        const currentTotal = result[TOTAL_VIDEOS_BLOCKED_KEY] || 0;
        await chrome.storage.sync.set({ [TOTAL_VIDEOS_BLOCKED_KEY]: currentTotal + 1 });
    } catch (error) {
        console.error('Error incrementing videos blocked:', error);
        throw error;
    }
}

// chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
//     if (details.url.includes('youtube.com')) {
//         try {
//             const blockedChannels = await getBlockedChannels();
//         } catch (error) {
//             console.error('Error in navigation filter:', error);
//         }
//     }
// });