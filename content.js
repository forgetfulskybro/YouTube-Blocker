(function() {
    'use strict';

    console.log('YouTube Blocker content script loaded');

    const MENU_CONTEXT_TTL_MS = 8000;
    let lastMenuContext = null;
    let lastMenuContextAt = 0;
    let lastMenuTriggerRect = null;

    let blockedChannelIds = new Set();
    let blockedChannelNamesLower = new Set();
    let lastFilterRunAt = 0;

    function isFreshMenuContext() {
        return !!lastMenuContext && (Date.now() - lastMenuContextAt) < MENU_CONTEXT_TTL_MS;
    }

    function isDropdownNearLastTrigger(dropdown) {
        try {
            if (!dropdown || !lastMenuTriggerRect) return false;
            const dr = dropdown.getBoundingClientRect();

            const horizontalClose = Math.abs(dr.left - lastMenuTriggerRect.left) < 250;
            const verticalClose = dr.top < (lastMenuTriggerRect.bottom + 80);
            return horizontalClose && verticalClose;
        } catch (e) {
            return false;
        }
    }

    function extractChannelInfoFromChannelHeader(headerRoot) {
        try {
            const header = headerRoot instanceof Element ? headerRoot : document;
            const nameEl = header.querySelector('h1.dynamicTextViewModelH1 span.yt-core-attributed-string');
            const channelName = (nameEl && nameEl.textContent ? nameEl.textContent : '').trim() || null;
            const channelId = getChannelIdFromContext();
            return { channelName, channelId };
        } catch (e) {
            return { channelName: null, channelId: null };
        }
    }

    function injectBlockButtonIntoChannelHeader(headerRoot) {
        if (!(headerRoot instanceof Element)) return;

        const existing = headerRoot.querySelector('[data-ytb-channel-header-block]');
        if (existing) {
            const existingBtn = existing.querySelector('button');
            if (existingBtn) {
                const channelId = (existingBtn.getAttribute('data-channel-id') || '').toString().trim();
                const isBlocked = channelId && blockedChannelIds.has(channelId);
                existingBtn.setAttribute('data-ytb-state', isBlocked ? 'unblock' : 'block');
                existingBtn.setAttribute('aria-label', isBlocked ? 'Unblock Channel' : 'Block Channel');
                existingBtn.classList.add('yt-spec-button-shape-next--icon-leading');
                existingBtn.innerHTML = isBlocked
                    ? '<div aria-hidden="true" class="yt-spec-button-shape-next__icon" style="margin-right: 8px;"><span class="ytIconWrapperHost" style="width: 24px; height: 24px;"><span class="yt-icon-shape ytSpecIconShapeHost"><div style="width: 100%; height: 100%; display: block; fill: currentcolor;"><svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 2c1.85 0 3.55.634 4.91 1.697L5.697 16.91A7.96 7.96 0 0 1 4 12c0-4.411 3.589-8 8-8zm0 16a7.96 7.96 0 0 1-4.91-1.697L18.303 7.09A7.96 7.96 0 0 1 20 12c0 4.411-3.589 8-8 8z"></path></svg></div></span></span></div><div class="yt-spec-button-shape-next__button-text-content">Unblock Channel</div>'
                    : '<div aria-hidden="true" class="yt-spec-button-shape-next__icon" style="margin-right: 8px;"><span class="ytIconWrapperHost" style="width: 24px; height: 24px;"><span class="yt-icon-shape ytSpecIconShapeHost"><div style="width: 100%; height: 100%; display: block; fill: currentcolor;"><svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 2c1.85 0 3.55.634 4.91 1.697L5.697 16.91A7.96 7.96 0 0 1 4 12c0-4.411 3.589-8 8-8zm0 16a7.96 7.96 0 0 1-4.91-1.697L18.303 7.09A7.96 7.96 0 0 1 20 12c0 4.411-3.589 8-8 8z"></path></svg></div></span></span></div><div class="yt-spec-button-shape-next__button-text-content">Block Channel</div>';

                if (isBlocked) {
                    existingBtn.style.background = '#ff0000';
                    existingBtn.style.color = '#ffffff';
                } else {
                    existingBtn.style.removeProperty('background');
                    existingBtn.style.removeProperty('color');
                }
            }
            return;
        }

        const actions = headerRoot.querySelector('yt-flexible-actions-view-model');
        if (!actions) return;

        const actionRow = actions.querySelector('.ytFlexibleActionsViewModelInline') || actions;
        if (!(actionRow instanceof Element)) return;

        const info = extractChannelInfoFromChannelHeader(headerRoot);
        const normalizedChannelId = (info.channelId || '').toString().trim();
        if (!normalizedChannelId) return;

        const isBlocked = blockedChannelIds.has(normalizedChannelId);

        const actionWrapper = document.createElement('div');
        actionWrapper.className = 'ytFlexibleActionsViewModelAction';
        actionWrapper.setAttribute('data-ytb-channel-header-block', 'true');

        const btn = document.createElement('button');
        btn.className = 'yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m yt-spec-button-shape-next--icon-leading yt-spec-button-shape-next--enable-backdrop-filter-experiment';
        btn.setAttribute('data-channel-id', normalizedChannelId);
        if (info.channelName) btn.setAttribute('data-channel-name', info.channelName);
        btn.setAttribute('data-ytb-state', isBlocked ? 'unblock' : 'block');
        btn.setAttribute('aria-label', isBlocked ? 'Unblock Channel' : 'Block Channel');
        btn.innerHTML = isBlocked
            ? '<div aria-hidden="true" class="yt-spec-button-shape-next__icon" style="margin-right: 8px;"><span class="ytIconWrapperHost" style="width: 24px; height: 24px;"><span class="yt-icon-shape ytSpecIconShapeHost"><div style="width: 100%; height: 100%; display: block; fill: currentcolor;"><svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 2c1.85 0 3.55.634 4.91 1.697L5.697 16.91A7.96 7.96 0 0 1 4 12c0-4.411 3.589-8 8-8zm0 16a7.96 7.96 0 0 1-4.91-1.697L18.303 7.09A7.96 7.96 0 0 1 20 12c0 4.411-3.589 8-8 8z"></path></svg></div></span></span></div><div class="yt-spec-button-shape-next__button-text-content">Unblock Channel</div>'
            : '<div aria-hidden="true" class="yt-spec-button-shape-next__icon" style="margin-right: 8px;"><span class="ytIconWrapperHost" style="width: 24px; height: 24px;"><span class="yt-icon-shape ytSpecIconShapeHost"><div style="width: 100%; height: 100%; display: block; fill: currentcolor;"><svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 2c1.85 0 3.55.634 4.91 1.697L5.697 16.91A7.96 7.96 0 0 1 4 12c0-4.411 3.589-8 8-8zm0 16a7.96 7.96 0 0 1-4.91-1.697L18.303 7.09A7.96 7.96 0 0 1 20 12c0 4.411-3.589 8-8 8z"></path></svg></div></span></span></div><div class="yt-spec-button-shape-next__button-text-content">Block Channel</div>';

        if (isBlocked) {
            btn.style.background = '#ff0000';
            btn.style.color = '#ffffff';
        }

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const channelId = (btn.getAttribute('data-channel-id') || '').toString().trim();
            const channelName = btn.getAttribute('data-channel-name');
            const state = btn.getAttribute('data-ytb-state');

            if (state === 'unblock') {
                chrome.runtime.sendMessage({
                    action: 'unblockChannel',
                    channelId: channelId
                }, (response) => {
                    if (response && response.success) {
                        showNotification(`Channel "${channelName || 'Unknown'}" has been unblocked`);
                        refreshBlockedChannels();
                    } else {
                        showNotification(response?.error || 'Failed to unblock channel', 'error');
                    }
                });
                return;
            }

            if (blockedChannelIds.has(channelId)) {
                showNotification('This channel is already blocked', 'error');
                return;
            }

            chrome.runtime.sendMessage({
                action: 'blockChannel',
                channelName: channelName,
                channelId: channelId
            }, (response) => {
                if (response && response.success) {
                    showNotification(`Channel "${channelName || 'Unknown'}" has been blocked`);
                    refreshBlockedChannels();
                } else {
                    const msg = response?.error && response.error.toLowerCase().includes('already blocked')
                        ? 'This channel is already blocked'
                        : (response?.error || 'Failed to block channel');
                    showNotification(msg, 'error');
                }
            });
        });

        actionWrapper.appendChild(btn);
        actionRow.appendChild(actionWrapper);
    }

    function scanForChannelHeaders() {
        const header = document.querySelector('#page-header ytd-tabbed-page-header') || document.querySelector('ytd-tabbed-page-header');
        if (header) {
            injectBlockButtonIntoChannelHeader(header);
        }
    }

    function clearMenuContext() {
        lastMenuContext = null;
        lastMenuContextAt = 0;
        lastMenuTriggerRect = null;
    }

    function setBlockedChannels(channels) {
        blockedChannelIds = new Set(
            (channels || [])
                .map(c => c && c.channelId)
                .filter(Boolean)
                .map(x => x.toString())
        );
        blockedChannelNamesLower = new Set();
    }

    function isChannelBlockedByInfo(info) {
        const id = info?.channelId ? info.channelId.toString() : '';
        if (id && blockedChannelIds.has(id)) return true;

        return false;
    }

    function getVideoContainersFromRoot(root) {
        const selector = 'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-playlist-video-renderer, ytd-reel-item-renderer, yt-lockup-view-model';
        if (root instanceof Element && root.matches(selector)) return [root];
        if (root instanceof Element) return Array.from(root.querySelectorAll(selector));
        return Array.from(document.querySelectorAll(selector));
    }

    function hideIfBlocked(container) {
        if (!(container instanceof Element)) return;
        if (container.hasAttribute('data-ytb-hidden')) return;

        const info = extractChannelInfoFromContainer(container);
        if (!isChannelBlockedByInfo(info)) return;

        container.setAttribute('data-ytb-hidden', 'true');
        container.style.display = 'none';
    }

    function restoreIfUnblocked(container) {
        if (!(container instanceof Element)) return;
        if (!container.hasAttribute('data-ytb-hidden')) return;

        const info = extractChannelInfoFromContainer(container);
        if (isChannelBlockedByInfo(info)) return;

        container.removeAttribute('data-ytb-hidden');
        container.style.removeProperty('display');
    }

    function applyBlockingToPage(root) {
        const now = Date.now();
        if (now - lastFilterRunAt < 250) return;
        lastFilterRunAt = now;

        const containers = getVideoContainersFromRoot(root);
        for (const c of containers) hideIfBlocked(c);

        const hidden = document.querySelectorAll('[data-ytb-hidden]');
        hidden.forEach(restoreIfUnblocked);
    }

    function closeDropdownMenu(dropdown) {
        try {
            if (dropdown && typeof dropdown.close === 'function') {
                dropdown.close();
                return;
            }

            if (dropdown && typeof dropdown.removeAttribute === 'function') {
                dropdown.removeAttribute('opened');
            }

            if (dropdown && dropdown.style) {
                dropdown.style.display = 'none';
            }

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
            document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));

            if (document.body) {
                document.body.click();
            }
        } catch (e) {
        }
    }

    async function refreshBlockedChannels() {
        try {
            const res = await chrome.runtime.sendMessage({ action: 'getBlockedChannels' });
            if (res && res.success) {
                setBlockedChannels(res.channels);
                applyBlockingToPage(document);
                scanForChannelHeaders();
            }
        } catch (e) {
        }
    }

    function getVideoContainerFromNode(node) {
        if (!node) return null;
        return node.closest(
            'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-playlist-video-renderer, ytd-reel-item-renderer'
        );
    }

    function extractChannelInfoFromContainer(container) {
        if (!container) return { channelName: null, channelId: null };

        if (container.matches('yt-lockup-view-model')) {
            const metaLink = container.querySelector('.yt-lockup-metadata-view-model__metadata a[href*="/@"], .yt-lockup-metadata-view-model__metadata a[href*="/channel/"]');
            if (metaLink) {
                const channelName = (metaLink.textContent || '').trim() || metaLink.getAttribute('title') || metaLink.getAttribute('aria-label');
                const href = metaLink.href || '';
                let channelId = null;

                const channelMatch = href.match(/\/channel\/([^\/\?]+)/);
                if (channelMatch && channelMatch[1]) {
                    channelId = channelMatch[1];
                } else {
                    const handleMatch = href.match(/\/@([^\/\?]+)/);
                    if (handleMatch && handleMatch[1]) {
                        channelId = handleMatch[1];
                    }
                }

                if (channelName || channelId) {
                    return { channelName: channelName || null, channelId: channelId || null };
                }
            }
        }

        const linkSelectors = [
            'ytd-channel-name a',
            '.ytd-channel-name a',
            '#channel-name a',
            'a.yt-simple-endpoint[href*="/channel/"]',
            'a.yt-simple-endpoint[href*="/@"]',
            'a[href*="/channel/"], a[href*="/@"]'
        ];

        for (const selector of linkSelectors) {
            const el = container.querySelector(selector);
            if (!el) continue;

            const channelName = (el.textContent || '').trim() || el.getAttribute('title') || el.getAttribute('aria-label');
            const href = el.href || '';
            let channelId = null;

            const channelMatch = href.match(/\/channel\/([^\/\?]+)/);
            if (channelMatch && channelMatch[1]) {
                channelId = channelMatch[1];
            } else {
                const handleMatch = href.match(/\/@([^\/\?]+)/);
                if (handleMatch && handleMatch[1]) {
                    channelId = handleMatch[1];
                }
            }

            if (channelName || channelId) {
                return { channelName: channelName || null, channelId: channelId || null };
            }
        }

        return { channelName: null, channelId: null };
    }

    function captureMenuContextFromClickTarget(target) {
        const container = getVideoContainerFromNode(target);
        const channelInfo = extractChannelInfoFromContainer(container);
        if (channelInfo.channelName || channelInfo.channelId) {
            lastMenuContext = channelInfo;
            lastMenuContextAt = Date.now();
        }
    }

    document.addEventListener(
        'click',
        (e) => {
            const t = e.target;
            if (!(t instanceof Element)) return;

            const menuButton = t.closest(
                'ytd-menu-renderer button, ytd-menu-renderer yt-icon-button, button[aria-label*="More"], button[aria-label*="more"], tp-yt-paper-icon-button'
            );
            if (!menuButton) return;

            clearMenuContext();
            lastMenuTriggerRect = menuButton.getBoundingClientRect();
            captureMenuContextFromClickTarget(menuButton);
        },
        true
    );

    function addBlockChannelButton(dropdown) {
        const hasLegacy = !!dropdown.querySelector('yt-list-view-model');
        const hasSearchMenu = !!dropdown.querySelector('tp-yt-paper-listbox');

        if (hasLegacy) {
            addBlockChannelButtonLegacy(dropdown);
            return;
        }

        if (hasSearchMenu) {
            addBlockChannelButtonSearch(dropdown);
            return;
        }
    }

    function addBlockChannelButtonLegacy(dropdown) {
        const listViewModel = dropdown.querySelector('yt-list-view-model');
        if (!listViewModel) {
            console.log('List view model not found in dropdown');
            return;
        }

        const injectedContext = (isFreshMenuContext() && isDropdownNearLastTrigger(dropdown)) ? lastMenuContext : null;

        if (listViewModel.querySelector('[data-blocker-button]')) {
            const existing = listViewModel.querySelector('[data-blocker-button]');
            if (existing) {
                if (injectedContext?.channelName) existing.setAttribute('data-channel-name', injectedContext.channelName);
                if (injectedContext?.channelId) existing.setAttribute('data-channel-id', injectedContext.channelId);

                const btn = existing.querySelector('button');
                if (btn) {
                    if (injectedContext?.channelName) btn.setAttribute('data-channel-name', injectedContext.channelName);
                    if (injectedContext?.channelId) btn.setAttribute('data-channel-id', injectedContext.channelId);
                }
            }
            return;
        }

        console.log('Adding Block Channel button to legacy dropdown');

        const blockItem = document.createElement('yt-list-item-view-model');
        blockItem.setAttribute('role', 'menuitem');
        blockItem.setAttribute('data-blocker-button', 'true');
        if (injectedContext?.channelName) blockItem.setAttribute('data-channel-name', injectedContext.channelName);
        if (injectedContext?.channelId) blockItem.setAttribute('data-channel-id', injectedContext.channelId);

        blockItem.innerHTML = `
            <div class="yt-list-item-view-model__label yt-list-item-view-model__container yt-list-item-view-model__container--compact yt-list-item-view-model__container--tappable yt-list-item-view-model__container--in-popup">
                <div aria-hidden="true" class="yt-list-item-view-model__image-container yt-list-item-view-model__leading">
                    <span class="ytIconWrapperHost yt-list-item-view-model__accessory yt-list-item-view-model__image" role="img" aria-label="" aria-hidden="true" style="">
                        <span class="yt-icon-shape ytSpecIconShapeHost">
                            <div style="width: 100%; height: 100%; display: block; fill: currentcolor;">
                                <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4 11H8v-2h8v2z"></path>
                                </svg>
                            </div>
                        </span>
                    </span>
                </div>
                <button class="ytButtonOrAnchorHost ytButtonOrAnchorButton yt-list-item-view-model__button-or-anchor" style="">
                    <div class="yt-list-item-view-model__text-wrapper">
                        <div class="yt-list-item-view-model__title-wrapper">
                            <span class="yt-core-attributed-string yt-list-item-view-model__title yt-core-attributed-string--white-space-pre-wrap" role="text">Block Channel</span>
                        </div>
                    </div>
                </button>
            </div>
        `;

        const button = blockItem.querySelector('button');
        if (button) {
            button.style.cursor = 'pointer';
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleBlockChannel(dropdown, {
                    channelName: blockItem.getAttribute('data-channel-name'),
                    channelId: blockItem.getAttribute('data-channel-id')
                });
            });
        }

        listViewModel.appendChild(blockItem);
        console.log('Block Channel button added successfully (legacy)');
    }

    function addBlockChannelButtonSearch(dropdown) {
        const listbox = dropdown.querySelector('tp-yt-paper-listbox');
        if (!listbox) {
            console.log('Listbox not found in dropdown');
            return;
        }

        if (dropdown.hasAttribute('data-ytb-search-injecting')) {
            return;
        }

        const injectedContext = (isFreshMenuContext() && isDropdownNearLastTrigger(dropdown)) ? lastMenuContext : null;

        const existing = listbox.querySelector('[data-blocker-button]');
        if (existing) {
            if (injectedContext?.channelName) existing.setAttribute('data-channel-name', injectedContext.channelName);
            if (injectedContext?.channelId) existing.setAttribute('data-channel-id', injectedContext.channelId);
            return;
        }

        console.log('Adding Block Channel button to search dropdown');

        dropdown.setAttribute('data-ytb-search-injecting', 'true');

        const startedAt = Date.now();
        const maxWaitMs = 8000;
        const pollMs = 250;

        const tryInject = () => {
            try {
                const lb = dropdown.querySelector('tp-yt-paper-listbox');
                if (!lb) {
                    if (Date.now() - startedAt < maxWaitMs) {
                        setTimeout(tryInject, pollMs);
                    } else {
                        dropdown.removeAttribute('data-ytb-search-injecting');
                    }
                    return;
                }

                if (lb.querySelector('[data-blocker-button]')) {
                    dropdown.removeAttribute('data-ytb-search-injecting');
                    return;
                }

                const hasNativeItem = !!lb.querySelector('ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, ytd-menu-service-item-download-renderer');
                if (!hasNativeItem) {
                    if (Date.now() - startedAt < maxWaitMs) {
                        setTimeout(tryInject, pollMs);
                    } else {
                        dropdown.removeAttribute('data-ytb-search-injecting');
                    }
                    return;
                }

                const paperItem = document.createElement('tp-yt-paper-item');
                paperItem.setAttribute('class', 'style-scope ytd-menu-service-item-renderer');
                paperItem.setAttribute('style-target', 'host');
                paperItem.setAttribute('role', 'option');
                paperItem.setAttribute('tabindex', '0');
                paperItem.setAttribute('aria-disabled', 'false');
                paperItem.setAttribute('data-blocker-button', 'true');
                paperItem.style.cursor = 'pointer';
                if (injectedContext?.channelName) paperItem.setAttribute('data-channel-name', injectedContext.channelName);
                if (injectedContext?.channelId) paperItem.setAttribute('data-channel-id', injectedContext.channelId);

                paperItem.innerHTML = `
                    <span aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;margin-right:16px;flex:0 0 auto;">
                        <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events:none;display:block;width:24px;height:24px;fill:currentcolor;">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4 11H8v-2h8v2z"></path>
                        </svg>
                    </span>
                    <span style="font-size:14px;line-height:20px;">Block Channel</span>
                `;

                paperItem.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleBlockChannel(dropdown, {
                        channelName: paperItem.getAttribute('data-channel-name'),
                        channelId: paperItem.getAttribute('data-channel-id')
                    });
                });

                lb.appendChild(paperItem);
                dropdown.removeAttribute('data-ytb-search-injecting');

                const menuPopup = dropdown.querySelector('ytd-menu-popup-renderer');
                if (menuPopup) {
                    menuPopup.style.maxWidth = '180px';
                    menuPopup.style.maxHeight = '220px';
                }

                void paperItem.offsetWidth;
                console.log('Block Channel button added successfully (search)');
            } catch (e) {
                dropdown.removeAttribute('data-ytb-search-injecting');
            }
        };

        tryInject();
    }

    function handleBlockChannel(dropdown, channelInfoOverride) {
        try {
            console.log('Block Channel button clicked');

            const normalize = (v) => {
                const s = (v == null ? '' : String(v)).trim();
                return s.length ? s : null;
            };

            const allowMenuContext = isFreshMenuContext() && isDropdownNearLastTrigger(dropdown);
            const overrideName = normalize(channelInfoOverride?.channelName);
            const overrideId = normalize(channelInfoOverride?.channelId);

            const channelName = overrideName || (allowMenuContext ? normalize(lastMenuContext?.channelName) : null) || getChannelNameFromContext();
            const channelId = overrideId || (allowMenuContext ? normalize(lastMenuContext?.channelId) : null) || getChannelIdFromContext();

            console.log('Channel info:', { channelName, channelId, channelInfoOverride, lastMenuContext });

            const normalizedChannelId = (channelId || '').toString().trim();
            if (!normalizedChannelId) {
                showNotification('Could not identify channel ID', 'error');
                closeDropdownMenu(dropdown);
                clearMenuContext();
                return;
            }

            if (blockedChannelIds.has(normalizedChannelId)) {
                showNotification('This channel is already blocked', 'error');
                closeDropdownMenu(dropdown);
                clearMenuContext();
                return;
            }

            if (channelName || normalizedChannelId) {
                chrome.runtime.sendMessage({
                    action: 'blockChannel',
                    channelName: channelName,
                    channelId: normalizedChannelId
                }, (response) => {
                    if (response && response.success) {
                        showNotification(`Channel "${channelName || 'Unknown'}" has been blocked`);

                        closeDropdownMenu(dropdown);
                        refreshBlockedChannels();
                        clearMenuContext();
                    } else {
                        const msg = response?.error && response.error.toLowerCase().includes('already blocked')
                            ? 'This channel is already blocked'
                            : 'Failed to block channel';
                        showNotification(msg, 'error');
                        closeDropdownMenu(dropdown);
                        clearMenuContext();
                    }
                });
            } else {
                showNotification('Could not identify channel information', 'error');
                closeDropdownMenu(dropdown);
                clearMenuContext();
            }
        } catch (error) {
            console.error('YouTube Blocker Error:', error);
            showNotification('An error occurred while blocking the channel', 'error');
            closeDropdownMenu(dropdown);
            clearMenuContext();
        }
    }

    function getChannelNameFromContext() {
        const selectors = [
            '#owner-name a',
            '.ytd-video-owner-renderer a',
            '#channel-name a',
            '.ytd-channel-name a',
            '#upload-info a',
            'ytd-video-owner-renderer a',
            'ytd-channel-name a',
            '.ytd-channel-name a yt-formatted-string'
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent && element.textContent.trim()) {
                return element.textContent.trim();
            }
        }

        const titleElement = document.querySelector('title');
        if (titleElement) {
            const title = titleElement.textContent;
            const match = title.match(/^(.+?) - YouTube$/);
            if (match && match[1]) {
                return match[1];
            }
        }

        return null;
    }

    function getChannelIdFromContext() {
        const urlMatch = window.location.href.match(/\/channel\/([^\/\?]+)/);
        if (urlMatch && urlMatch[1]) {
            return urlMatch[1];
        }

        const handleMatch = window.location.href.match(/\/@([^\/\?]+)/);
        if (handleMatch && handleMatch[1]) {
            return handleMatch[1];
        }

        const channelLink = document.querySelector('#owner-name a, .ytd-video-owner-renderer a, ytd-video-owner-renderer a');
        if (channelLink && channelLink.href) {
            const linkMatch = channelLink.href.match(/\/(?:channel|@)([^\/\?]+)/);
            if (linkMatch && linkMatch[1]) {
                return linkMatch[1];
            }
        }

        return null;
    }

    function ensureToastUi() {
        if (!document.getElementById('ytb-toast-styles')) {
            const style = document.createElement('style');
            style.id = 'ytb-toast-styles';
            style.textContent = `
                #ytb-toast-root{position:fixed;top:16px;right:16px;z-index:100000;display:flex;flex-direction:column;gap:10px;pointer-events:none;}
                .ytb-toast{pointer-events:auto;min-width:260px;max-width:360px;display:flex;align-items:flex-start;gap:10px;padding:12px 12px 10px 12px;border-radius:12px;color:#f1f1f1;background:rgba(24,24,24,.98);backdrop-filter:saturate(140%) blur(10px);box-shadow:0 14px 34px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.10);font-family:Roboto,Arial,sans-serif;}
                .ytb-toast__icon{flex:0 0 auto;margin-top:2px;width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:6px;}
                .ytb-toast__body{flex:1 1 auto;}
                .ytb-toast__message{font-size:13px;line-height:1.3;font-weight:500;word-break:break-word;}
                .ytb-toast__close{flex:0 0 auto;appearance:none;border:0;background:transparent;color:rgba(255,255,255,.70);cursor:pointer;padding:4px;margin:-4px -2px 0 0;border-radius:8px;}
                .ytb-toast__close:hover{background:rgba(255,255,255,.08);}
                .ytb-toast__bar{height:2px;margin-top:8px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.12);}
                .ytb-toast__bar > div{height:100%;width:100%;transform-origin:left;}
                .ytb-toast--success .ytb-toast__icon{background:rgba(16,185,129,.18);color:#6ee7b7;}
                .ytb-toast--success .ytb-toast__bar > div{background:rgba(16,185,129,.9);}
                .ytb-toast--error .ytb-toast__icon{background:rgba(239,68,68,.18);color:#fca5a5;}
                .ytb-toast--error .ytb-toast__bar > div{background:rgba(239,68,68,.9);}
                @keyframes ytbToastIn{from{transform:translate3d(0,-6px,0);opacity:0}to{transform:translate3d(0,0,0);opacity:1}}
                @keyframes ytbToastOut{from{transform:translate3d(0,0,0);opacity:1}to{transform:translate3d(0,-6px,0);opacity:0}}
                .ytb-toast--in{animation:ytbToastIn .16s ease-out both;}
                .ytb-toast--out{animation:ytbToastOut .14s ease-in both;}
            `;
            (document.head || document.documentElement).appendChild(style);
        }

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

    function showNotification(message, type = 'success') {
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

    function scanForDropdowns() {
        const dropdowns = document.querySelectorAll('tp-yt-iron-dropdown');
        console.log(`Found ${dropdowns.length} dropdowns`);
        
        dropdowns.forEach((dropdown, index) => {
            console.log(`Processing dropdown ${index}`);
            addBlockChannelButton(dropdown);
        });
    }

    const observer = new MutationObserver((mutations) => {
        let shouldScan = false;
        let shouldFilter = false;
        let shouldScanChannel = false;
        
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.classList?.contains('tp-yt-iron-dropdown') || 
                        node.tagName === 'TP-YT-IRON-DROPDOWN' ||
                        node.querySelector?.('tp-yt-iron-dropdown')) {
                        shouldScan = true;
                    }

                    if (node.id === 'page-header' ||
                        node.tagName === 'YTD-TABBED-PAGE-HEADER' ||
                        node.querySelector?.('ytd-tabbed-page-header')) {
                        shouldScanChannel = true;
                    }

                    shouldFilter = true;
                }
            });
        });
        
        if (shouldScan) {
            setTimeout(scanForDropdowns, 100);
        }

        if (shouldScanChannel) {
            setTimeout(scanForChannelHeaders, 100);
        }

        if (shouldFilter) {
            applyBlockingToPage(document);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    setTimeout(scanForDropdowns, 1000);
    setTimeout(scanForChannelHeaders, 1000);
    refreshBlockedChannels();
    setInterval(scanForDropdowns, 2000);

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (!request || !request.action) return;
        if (request.action === 'channelBlocked' || request.action === 'channelUnblocked' || request.action === 'unblockedAll') {
            refreshBlockedChannels();
        }

        if (request.action === 'getHiddenCount') {
            const hiddenCount = document.querySelectorAll('[data-ytb-hidden]').length;
            sendResponse({ success: true, hiddenCount });
            return;
        }
    });

    console.log('YouTube Blocker content script initialized');

})();
