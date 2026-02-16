// ================================================
// Calendar Free Time Finder - Main Logic
// ================================================

let authToken = null;
let lastBusyData = null;
let lastEmails = null;

const STORAGE_KEYS = { LAST_INPUT: 'lastInput', PRESETS: 'presets', EMAIL_HISTORY: 'emailHistory' };
const MEMBER_IDS = ['member1', 'member2', 'member3', 'member4', 'member5'];

// ---- DOM Elements ----
const $ = (sel) => document.querySelector(sel);
const loginView = $('#login-view');
const mainView = $('#main-view');
const loginBtn = $('#login-btn');
const logoutBtn = $('#logout-btn');
const findBtn = $('#find-btn');
const loadingEl = $('#loading');
const errorEl = $('#error-msg');
const resultsEl = $('#results');

// ---- Storage: Auto-save / Restore ----
// Exclude keyword format:
//   "b"     → exact match (case-sensitive, title must equal "b")
//   block   → partial match (case-insensitive, title contains "block")
function parseExcludeKeywords(text) {
  return text.split(',').map(k => k.trim()).filter(Boolean).map(k => {
    // Check for "quoted" exact-match syntax
    const exactMatch = k.match(/^"(.+)"$/);
    if (exactMatch) {
      return { keyword: exactMatch[1], exact: true };
    }
    return { keyword: k, exact: false };
  });
}

function matchesExcludeKeyword(title, keywords) {
  return keywords.find(kw => {
    if (kw.exact) {
      // Exact match: title must equal keyword exactly (case-sensitive)
      return title === kw.keyword;
    } else {
      // Partial match: case-insensitive contains
      return title.toLowerCase().includes(kw.keyword.toLowerCase());
    }
  });
}

function saveLastInput() {
  const emails = MEMBER_IDS.map(id => $(`#${id}`).value.trim());
  const excludeKeywordsRaw = $('#exclude-keywords').value;
  chrome.storage.local.set({ [STORAGE_KEYS.LAST_INPUT]: { emails, excludeKeywordsRaw } });
}

async function restoreLastInput() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.LAST_INPUT, (result) => {
      const data = result[STORAGE_KEYS.LAST_INPUT];
      if (data) {
        if (data.emails) {
          MEMBER_IDS.forEach((id, i) => {
            $(`#${id}`).value = data.emails[i] || '';
          });
        }
        if (data.excludeKeywordsRaw != null) {
          $('#exclude-keywords').value = data.excludeKeywordsRaw;
        } else if (data.excludeKeywords) {
          // Backward compatibility: old format was array of strings or objects
          const keywords = data.excludeKeywords;
          if (Array.isArray(keywords)) {
            $('#exclude-keywords').value = keywords.map(k =>
              typeof k === 'object' ? (k.exact ? `"${k.keyword}"` : k.keyword) : k
            ).join(', ');
          }
        }
      }
      resolve();
    });
  });
}

// Auto-save on every input change
[...MEMBER_IDS, 'exclude-keywords'].forEach(id => {
  $(`#${id}`).addEventListener('input', saveLastInput);
});

// ---- Email History & Suggest ----
let emailHistoryCache = [];

async function loadEmailHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.EMAIL_HISTORY, (result) => {
      emailHistoryCache = result[STORAGE_KEYS.EMAIL_HISTORY] || [];
      resolve(emailHistoryCache);
    });
  });
}

async function addEmailsToHistory(emails) {
  const history = await loadEmailHistory();
  let changed = false;
  for (const email of emails) {
    const trimmed = email.trim().toLowerCase();
    if (trimmed && !history.includes(trimmed)) {
      history.push(trimmed);
      changed = true;
    }
  }
  if (changed) {
    emailHistoryCache = history;
    chrome.storage.local.set({ [STORAGE_KEYS.EMAIL_HISTORY]: history });
  }
}

function setupEmailSuggest() {
  let activeDropdown = null;
  let activeIndex = -1;

  function closeSuggest() {
    if (activeDropdown) {
      activeDropdown.remove();
      activeDropdown = null;
      activeIndex = -1;
    }
  }

  function showSuggest(input) {
    closeSuggest();
    const query = input.value.trim().toLowerCase();
    if (!query) return;

    // Get emails already entered in other fields to exclude them
    const usedEmails = new Set(
      MEMBER_IDS.map(id => $(`#${id}`).value.trim().toLowerCase()).filter(Boolean)
    );

    const matches = emailHistoryCache.filter(
      email => email.includes(query) && !usedEmails.has(email)
    );
    if (matches.length === 0) return;

    const dropdown = document.createElement('div');
    dropdown.className = 'email-suggest';
    matches.slice(0, 6).forEach((email, i) => {
      const item = document.createElement('div');
      item.className = 'email-suggest-item';
      item.textContent = email;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault(); // prevent blur before click registers
        input.value = email;
        closeSuggest();
        saveLastInput();
        // Move focus to next empty member input
        const nextEmpty = MEMBER_IDS.find(id => !$(`#${id}`).value.trim());
        if (nextEmpty) $(`#${nextEmpty}`).focus();
      });
      dropdown.appendChild(item);
    });

    input.closest('.member-row').appendChild(dropdown);
    activeDropdown = dropdown;
    activeIndex = -1;
  }

  function highlightItem(index) {
    if (!activeDropdown) return;
    const items = activeDropdown.querySelectorAll('.email-suggest-item');
    items.forEach((item, i) => item.classList.toggle('active', i === index));
    activeIndex = index;
  }

  MEMBER_IDS.forEach(id => {
    const input = $(`#${id}`);

    input.addEventListener('input', () => showSuggest(input));
    input.addEventListener('focus', () => {
      if (input.value.trim()) showSuggest(input);
    });
    input.addEventListener('blur', () => {
      // Small delay so mousedown on item fires first
      setTimeout(closeSuggest, 150);
    });
    input.addEventListener('keydown', (e) => {
      if (!activeDropdown) return;
      const items = activeDropdown.querySelectorAll('.email-suggest-item');
      if (items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightItem(Math.min(activeIndex + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightItem(Math.max(activeIndex - 1, 0));
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        input.value = items[activeIndex].textContent;
        closeSuggest();
        saveLastInput();
        const nextEmpty = MEMBER_IDS.find(mid => !$(`#${mid}`).value.trim());
        if (nextEmpty) $(`#${nextEmpty}`).focus();
      } else if (e.key === 'Escape') {
        closeSuggest();
      }
    });
  });
}

// Initialize email suggest on load
loadEmailHistory().then(() => setupEmailSuggest());

// ---- Preset Management ----
async function loadPresets() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.PRESETS, (result) => {
      resolve(result[STORAGE_KEYS.PRESETS] || []);
    });
  });
}

async function savePresets(presets) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.PRESETS]: presets }, resolve);
  });
}

async function populatePresetDropdown() {
  const presets = await loadPresets();
  const select = $('#preset-select');
  select.innerHTML = '<option value="">-- プリセット --</option>';
  presets.forEach((preset, index) => {
    const opt = document.createElement('option');
    opt.value = index;
    opt.textContent = preset.name;
    select.appendChild(opt);
  });
}

function updatePresetButtons() {
  const hasSelection = $('#preset-select').value !== '';
  $('#preset-overwrite-btn').classList.toggle('hidden', !hasSelection);
  $('#preset-delete-btn').classList.toggle('hidden', !hasSelection);
}

$('#preset-select').addEventListener('change', async () => {
  updatePresetButtons();
  const index = $('#preset-select').value;
  if (index === '') return;
  const presets = await loadPresets();
  const preset = presets[parseInt(index)];
  if (!preset) return;
  MEMBER_IDS.forEach((id, i) => {
    $(`#${id}`).value = preset.emails[i] || '';
  });
  // Restore exclude keywords (support both old array format and new raw text format)
  if (preset.excludeKeywordsRaw != null) {
    $('#exclude-keywords').value = preset.excludeKeywordsRaw;
  } else if (preset.excludeKeywords) {
    $('#exclude-keywords').value = Array.isArray(preset.excludeKeywords)
      ? preset.excludeKeywords.map(k =>
          typeof k === 'object' ? (k.exact ? `"${k.keyword}"` : k.keyword) : k
        ).join(', ')
      : '';
  } else {
    $('#exclude-keywords').value = '';
  }
  $('#preset-name').value = preset.name;
  saveLastInput();
});

$('#preset-save-btn').addEventListener('click', async () => {
  const name = $('#preset-name').value.trim();
  if (!name) {
    showError('プリセット名を入力してください。');
    return;
  }
  const emails = MEMBER_IDS.map(id => $(`#${id}`).value.trim());
  const excludeKeywordsRaw = $('#exclude-keywords').value;
  const presets = await loadPresets();
  const existing = presets.findIndex(p => p.name === name);
  if (existing >= 0) {
    if (!confirm(`プリセット「${name}」は既に存在します。上書きしますか？`)) return;
    presets[existing] = { name, emails, excludeKeywordsRaw };
  } else {
    presets.push({ name, emails, excludeKeywordsRaw });
  }
  await savePresets(presets);
  await populatePresetDropdown();
  const newIndex = existing >= 0 ? existing : presets.length - 1;
  $('#preset-select').value = newIndex;
  updatePresetButtons();
  hideError();
});

$('#preset-overwrite-btn').addEventListener('click', async () => {
  const index = $('#preset-select').value;
  if (index === '') {
    showError('上書きするプリセットを選択してください。');
    return;
  }
  const presets = await loadPresets();
  const preset = presets[parseInt(index)];
  if (!preset) return;
  if (!confirm(`プリセット「${preset.name}」を現在の入力内容で上書きしますか？`)) return;
  const emails = MEMBER_IDS.map(id => $(`#${id}`).value.trim());
  const excludeKeywordsRaw = $('#exclude-keywords').value;
  presets[parseInt(index)] = { name: preset.name, emails, excludeKeywordsRaw };
  await savePresets(presets);
  hideError();
});

$('#preset-delete-btn').addEventListener('click', async () => {
  const index = $('#preset-select').value;
  if (index === '') {
    showError('削除するプリセットを選択してください。');
    return;
  }
  const presets = await loadPresets();
  const preset = presets[parseInt(index)];
  if (!confirm(`プリセット「${preset.name}」を削除しますか？`)) return;
  presets.splice(parseInt(index), 1);
  await savePresets(presets);
  await populatePresetDropdown();
  $('#preset-name').value = '';
  updatePresetButtons();
});

// ---- Auth ----
loginBtn.addEventListener('click', () => {
  chrome.identity.getAuthToken({ interactive: true }, async (token) => {
    if (chrome.runtime.lastError) {
      showError('ログインに失敗しました: ' + chrome.runtime.lastError.message);
      return;
    }
    authToken = token;
    showView('main');
    await restoreLastInput();
    await populatePresetDropdown();
  });
});

logoutBtn.addEventListener('click', () => {
  if (authToken) {
    chrome.identity.removeCachedAuthToken({ token: authToken }, () => {
      authToken = null;
      showView('login');
    });
  }
});

// On load: check if already authenticated
chrome.identity.getAuthToken({ interactive: false }, async (token) => {
  if (chrome.runtime.lastError || !token) {
    showView('login');
    return;
  }
  authToken = token;
  showView('main');
  await restoreLastInput();
  await populatePresetDropdown();
});

function showView(view) {
  loginView.classList.toggle('hidden', view !== 'login');
  mainView.classList.toggle('hidden', view !== 'main');
}

// ---- Google Calendar Events API ----
async function refreshAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.removeCachedAuthToken({ token: authToken }, () => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) reject(new Error('再認証に失敗'));
        else resolve(token);
      });
    });
  });
}

async function fetchCalendarEvents(email, timeMin, timeMax) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    timeZone: tz,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '2500'
  });

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(email)}/events?${params}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  if (res.status === 401) {
    authToken = await refreshAuthToken();
    return fetchCalendarEvents(email, timeMin, timeMax);
  }

  if (res.status === 403 || res.status === 404) {
    return { events: null, error: 'noAccess' };
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `API エラー (${res.status})`);
  }

  const data = await res.json();
  console.log(`[FTF] ${email}: ${(data.items || []).length}件のイベント取得`);
  const events = (data.items || [])
    .filter(item => {
      if (item.status === 'cancelled') return false;
      if (item.transparency === 'transparent') return false;
      if (!item.start?.dateTime || !item.end?.dateTime) return false;
      // Find the calendar owner's attendance status
      // When fetching someone else's calendar, a.self refers to the authenticated user, not the calendar owner.
      // So we must match by email. Also check organizer.self to detect calendar owner's own events.
      const attendees = item.attendees || [];
      const calOwner = attendees.find(a => a.email?.toLowerCase() === email.toLowerCase());
      // If no attendees list (single-person event) or owner not found, treat as accepted
      const ownerStatus = calOwner ? calOwner.responseStatus : 'accepted';
      if (ownerStatus === 'declined') return false;
      if (!calOwner && attendees.length > 0) {
        console.log(`[FTF] ⚠️ attendeeにメール不一致: "${item.summary}" email=${email} attendees=[${attendees.map(a => a.email).join(', ')}]`);
      }
      return true;
    })
    .map(item => {
      const attendees = item.attendees || [];
      const calOwner = attendees.find(a => a.email?.toLowerCase() === email.toLowerCase());
      return {
        start: new Date(item.start.dateTime),
        end: new Date(item.end.dateTime),
        summary: item.summary || '',
        responseStatus: calOwner ? calOwner.responseStatus : 'accepted'
      };
    });

  return { events, error: null };
}

async function fetchFreeBusyFallback(email, timeMin, timeMax) {
  const body = {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    items: [{ id: email }]
  };

  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) return { busy: [], error: 'freeBusyFailed' };

  const data = await res.json();
  const cal = data.calendars?.[email];
  if (cal?.errors?.length) {
    return { busy: [], error: cal.errors[0].reason };
  }
  return {
    busy: (cal?.busy || []).map(b => ({
      start: new Date(b.start),
      end: new Date(b.end)
    })),
    isFreeBusyFallback: true
  };
}

async function fetchAllMemberEvents(emails, timeMin, timeMax, excludeKeywords, includeTentative) {
  const results = await Promise.all(
    emails.map(email => fetchCalendarEvents(email, timeMin, timeMax))
  );

  const busyData = {};
  const fallbackPromises = [];
  let excludedByKeyword = 0;
  let excludedByStatus = 0;

  emails.forEach((email, i) => {
    const result = results[i];
    if (result.error) {
      fallbackPromises.push(
        fetchFreeBusyFallback(email, timeMin, timeMax).then(fb => {
          busyData[email] = fb;
        })
      );
    } else {
      const filteredEvents = result.events.filter(event => {
        // Filter by response status
        if (!includeTentative) {
          const rs = event.responseStatus;
          if (rs === 'needsAction' || rs === 'tentative') {
            console.log(`[FTF] 除外(未回答/仮承諾): "${event.summary}" status=${rs} email=${email}`);
            excludedByStatus++;
            return false;
          }
        }
        // Filter by exclude keywords
        if (excludeKeywords.length > 0) {
          const title = event.summary;
          const matchedKw = matchesExcludeKeyword(title, excludeKeywords);
          if (matchedKw) {
            console.log(`[FTF] 除外(キーワード): "${event.summary}" matched="${matchedKw.keyword}"(${matchedKw.exact ? '完全一致' : '部分一致'}) email=${email}`);
            excludedByKeyword++;
            return false;
          }
        }
        console.log(`[FTF] 予定あり: "${event.summary}" status=${event.responseStatus} email=${email} ${event.start.toLocaleString()}-${event.end.toLocaleString()}`);
        return true;
      });
      busyData[email] = {
        busy: filteredEvents.map(e => ({ start: e.start, end: e.end }))
      };
    }
  });

  await Promise.all(fallbackPromises);
  return { busyData, excludedByKeyword, excludedByStatus };
}

// ---- Find Free Time ----
findBtn.addEventListener('click', async () => {
  const emails = MEMBER_IDS.map(id => $(`#${id}`).value.trim()).filter(Boolean);

  if (emails.length < 2) {
    showError('少なくとも2名のメールアドレスを入力してください。');
    return;
  }

  const days = parseInt($('#period-select').value);
  const startHour = parseInt($('#start-hour').value);
  const endHour = parseInt($('#end-hour').value);
  const minDuration = parseInt($('#min-duration').value);
  const excludeKeywords = parseExcludeKeywords($('#exclude-keywords').value);
  const includeTentative = $('#include-tentative').checked;

  hideError();
  hideInfo();
  resultsEl.classList.add('hidden');
  loadingEl.classList.remove('hidden');
  findBtn.disabled = true;

  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + days);

    const result = await fetchAllMemberEvents(emails, start, end, excludeKeywords, includeTentative);
    const busyData = result.busyData;
    lastBusyData = busyData;
    lastEmails = emails;

    // Save emails to history for future suggestions
    await addEmailsToHistory(emails);

    // Check for errors and fallbacks
    const errorEmails = emails.filter(e => busyData[e]?.error);
    const fallbackEmails = emails.filter(e => busyData[e]?.isFreeBusyFallback);
    const trueErrors = errorEmails.filter(e => !busyData[e]?.isFreeBusyFallback);

    const errorMsgs = [];
    if (trueErrors.length > 0) {
      errorMsgs.push(`以下のカレンダーにアクセスできません: ${trueErrors.join(', ')}（権限を確認してください）`);
    }
    if (fallbackEmails.length > 0) {
      errorMsgs.push(`以下はフリービジー情報のみ取得（除外キーワード適用外）: ${fallbackEmails.join(', ')}`);
    }
    if (errorMsgs.length > 0) showError(errorMsgs.join('\n'));

    const infoMsgs = [];
    if (result.excludedByKeyword > 0) {
      infoMsgs.push(`除外キーワードにより ${result.excludedByKeyword}件の予定を空き扱いにしました`);
    }
    if (result.excludedByStatus > 0) {
      infoMsgs.push(`未回答・仮承諾により ${result.excludedByStatus}件の予定を除外しました`);
    }
    if (infoMsgs.length > 0) showInfo(infoMsgs.join('\n'));

    const freeSlots = calculateFreeSlots(
      busyData, emails, start, end, startHour, endHour, minDuration
    );

    renderResults(freeSlots, emails, start, days, startHour, endHour);
  } catch (err) {
    showError('エラーが発生しました: ' + err.message);
  } finally {
    loadingEl.classList.add('hidden');
    findBtn.disabled = false;
  }
});

// ---- Free Slot Calculation ----
function calculateFreeSlots(busyData, emails, rangeStart, rangeEnd, startHour, endHour, minDurationMin) {
  const slots = [];
  const current = new Date(rangeStart);
  const now = new Date();

  while (current < rangeEnd) {
    const dayOfWeek = current.getDay();

    // Skip weekends
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      let dayStart = new Date(current);
      dayStart.setHours(startHour, 0, 0, 0);
      const dayEnd = new Date(current);
      dayEnd.setHours(endHour, 0, 0, 0);

      // For today, skip past time slots (round up to next 30-min boundary)
      if (current.toDateString() === now.toDateString() && now > dayStart) {
        const rounded = new Date(now);
        rounded.setMinutes(Math.ceil(rounded.getMinutes() / 30) * 30, 0, 0);
        dayStart = rounded > dayEnd ? dayEnd : rounded;
      }

      // Merge all busy periods from all members
      const allBusy = [];
      for (const email of emails) {
        const data = busyData[email];
        if (!data || data.error) continue;
        for (const b of data.busy) {
          if (b.end > dayStart && b.start < dayEnd) {
            allBusy.push({
              start: b.start < dayStart ? new Date(dayStart) : new Date(b.start),
              end: b.end > dayEnd ? new Date(dayEnd) : new Date(b.end)
            });
          }
        }
      }

      // Sort and merge overlapping busy periods
      allBusy.sort((a, b) => a.start - b.start);
      const merged = [];
      for (const b of allBusy) {
        if (merged.length && b.start <= merged[merged.length - 1].end) {
          merged[merged.length - 1].end = new Date(
            Math.max(merged[merged.length - 1].end.getTime(), b.end.getTime())
          );
        } else {
          merged.push({ start: new Date(b.start), end: new Date(b.end) });
        }
      }

      // Find gaps = free slots
      let cursor = new Date(dayStart);
      for (const busy of merged) {
        if (busy.start > cursor) {
          const durationMin = (busy.start - cursor) / 60000;
          if (durationMin >= minDurationMin) {
            slots.push({
              date: new Date(current),
              start: new Date(cursor),
              end: new Date(busy.start),
              durationMin
            });
          }
        }
        if (busy.end > cursor) cursor = new Date(busy.end);
      }
      // Remaining time after last busy period
      if (cursor < dayEnd) {
        const durationMin = (dayEnd - cursor) / 60000;
        if (durationMin >= minDurationMin) {
          slots.push({
            date: new Date(current),
            start: new Date(cursor),
            end: new Date(dayEnd),
            durationMin
          });
        }
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return slots;
}

// ---- Per-member busy status for grid ----
function getMemberBusyStatus(busyData, emails, dateTime, slotMinutes) {
  const slotEnd = new Date(dateTime.getTime() + slotMinutes * 60000);
  let busyCount = 0;
  const busyMembers = [];

  for (const email of emails) {
    const data = busyData[email];
    if (!data || data.error) continue;
    const isBusy = data.busy.some(b => b.start < slotEnd && b.end > dateTime);
    if (isBusy) {
      busyCount++;
      busyMembers.push(email.split('@')[0]);
    }
  }

  return { busyCount, busyMembers, total: emails.length };
}

// ---- Render Results ----
function renderResults(slots, emails, rangeStart, days, startHour, endHour) {
  resultsEl.classList.remove('hidden');
  $('#result-count').textContent = `${slots.length}件`;

  renderListView(slots);
  renderGridView(emails, rangeStart, days, startHour, endHour);

  // If 0 results, default to grid view so user can see why
  const defaultTab = slots.length === 0 ? 'grid' : 'list';
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === defaultTab);
  });
  $('#list-view').classList.toggle('hidden', defaultTab !== 'list');
  $('#grid-view').classList.toggle('hidden', defaultTab !== 'grid');

  // Tab switching (use event delegation to avoid duplicate listeners)
  const tabBar = document.querySelector('.tab-bar');
  tabBar.onclick = (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    $('#list-view').classList.toggle('hidden', target !== 'list');
    $('#grid-view').classList.toggle('hidden', target !== 'grid');
  };
}

function buildCalendarUrl(start, end) {
  const fmt = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  };
  const emails = MEMBER_IDS.map(id => $(`#${id}`).value.trim()).filter(Boolean);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    dates: `${fmt(start)}/${fmt(end)}`
  });
  emails.forEach(email => params.append('add', email));
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function renderListView(slots) {
  const container = $('#slot-list');
  container.innerHTML = '';

  if (slots.length === 0) {
    container.innerHTML = '<div class="no-slots">共通の空き時間が見つかりませんでした</div>';
    return;
  }

  // Group by date
  const groups = {};
  for (const slot of slots) {
    const key = slot.date.toDateString();
    if (!groups[key]) groups[key] = { date: slot.date, slots: [] };
    groups[key].slots.push(slot);
  }

  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

  for (const group of Object.values(groups)) {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'day-group';

    const d = group.date;
    const label = document.createElement('div');
    label.className = 'day-label';
    label.innerHTML = `${d.getMonth() + 1}/${d.getDate()} <span class="weekday">(${weekdays[d.getDay()]})</span>`;
    dayDiv.appendChild(label);

    for (const slot of group.slots) {
      const card = document.createElement('div');
      card.className = 'slot-card';
      const calUrl = buildCalendarUrl(slot.start, slot.end);
      card.innerHTML = `
        <span class="slot-time">${formatTime(slot.start)} 〜 ${formatTime(slot.end)}</span>
        <span class="slot-duration">${formatDuration(slot.durationMin)}</span>
        <a class="slot-book-btn" href="${calUrl}" target="_blank" title="Googleカレンダーで予約">📅 予約</a>
      `;
      dayDiv.appendChild(card);
    }

    container.appendChild(dayDiv);
  }
}

function renderGridView(emails, rangeStart, days, startHour, endHour) {
  const container = $('#time-grid');

  if (!lastBusyData) {
    container.innerHTML = '<div class="no-slots">グリッド表示にはデータが必要です</div>';
    return;
  }

  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let html = '<table class="grid-table"><thead><tr><th class="time-col">時間</th>';

  // Date headers
  const dates = [];
  const d = new Date(rangeStart);
  for (let i = 0; i < days; i++) {
    const dd = new Date(d);
    const isWeekend = dd.getDay() === 0 || dd.getDay() === 6;
    const isToday = dd.getTime() === today.getTime();
    dates.push({ date: dd, isWeekend, isToday });
    const cls = isToday ? 'today-col' : '';
    const style = isWeekend ? 'color:#ccc' : '';
    html += `<th class="${cls}" style="${style}">${dd.getMonth() + 1}/${dd.getDate()}<br>${weekdays[dd.getDay()]}</th>`;
    d.setDate(d.getDate() + 1);
  }
  html += '</tr></thead><tbody>';

  // Time rows (every 30 min)
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += 30) {
      const timeLabel = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      html += `<tr><td class="time-col">${timeLabel}</td>`;

      for (const dateInfo of dates) {
        if (dateInfo.isWeekend) {
          html += '<td class="cell-weekend"></td>';
          continue;
        }

        const slotTime = new Date(dateInfo.date);
        slotTime.setHours(h, m, 0, 0);

        const status = getMemberBusyStatus(lastBusyData, emails, slotTime, 30);
        let cls = 'cell-free';
        let tip = '全員空き';

        if (status.busyCount === status.total) {
          cls = 'cell-busy';
          tip = '全員予定あり';
        } else if (status.busyCount > 0) {
          cls = 'cell-partial';
          tip = `予定あり: ${status.busyMembers.join(', ')}`;
        }

        if (dateInfo.isToday) cls += ' today-col';

        if (cls.includes('cell-free')) {
          const iso = slotTime.toISOString();
          html += `<td class="${cls} cell-tooltip cell-clickable" data-tip="${tip}" data-time="${iso}"></td>`;
        } else {
          html += `<td class="${cls} cell-tooltip" data-tip="${tip}"></td>`;
        }
      }
      html += '</tr>';
    }
  }

  html += '</tbody></table>';
  container.innerHTML = html;

  // Add click-to-book on free cells
  container.querySelectorAll('.cell-clickable').forEach(cell => {
    cell.addEventListener('click', () => {
      const start = new Date(cell.dataset.time);
      const end = new Date(start.getTime() + 30 * 60000);
      const url = buildCalendarUrl(start, end);
      window.open(url, '_blank');
    });
  });
}

// ---- Utilities ----
function formatTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDuration(minutes) {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}時間${m}分` : `${h}時間`;
  }
  return `${minutes}分`;
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}

function hideError() {
  errorEl.classList.add('hidden');
}

function showInfo(msg) {
  const el = $('#info-msg');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideInfo() {
  const el = $('#info-msg');
  el.classList.add('hidden');
}
