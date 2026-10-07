// ========== State ==========
let peer = null;
let myId = null;
let myName = "";
let myMemberId = loadMemberIdentity();
let connections = {};
let activePeerId = null;
let mediaStream = null;
let currentCall = null;
let callTimerInterval = null;
let callSeconds = 0;
let isMuted = false;
let isCameraOff = false;
let pendingCall = null;
let isVideoCall = false;
let typingTimeout = null;
let myStatus = null; // { text, image, time, expires }
let statuses = {};   // peerId -> status
let friends = [];    // [{ id, name, peerId, lastSeen }]
let groups = loadGroups();
let appSettings = loadSettings();
let myPicture = appSettings.picture;
let profilePictureDraft = myPicture;
let currentGroupId = null;
let groupPictureData = "";
let editGroupPictureData = "";

// ========== DOM ==========
const loginScreen = document.getElementById("login-screen");
const app = document.getElementById("app");
const joinBtn = document.getElementById("join-btn");
const settingsNameInput = document.getElementById("settings-name-input");
const myNameEl = document.getElementById("my-name");
const myIdEl = document.getElementById("my-id");
const myAvatar = document.getElementById("my-avatar");
const copyIdBtn = document.getElementById("copy-id-btn");
const remoteIdInput = document.getElementById("remote-id-input");
const connectBtn = document.getElementById("connect-btn");
const chatList = document.getElementById("chat-list");
const emptyState = document.getElementById("empty-state");
const chatView = document.getElementById("chat-view");
const peerNameEl = document.getElementById("peer-name");
const peerStatusEl = document.getElementById("peer-status");
const peerAvatar = document.getElementById("peer-avatar");
const messagesEl = document.getElementById("messages");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const fileInput = document.getElementById("file-input");
const voiceCallBtn = document.getElementById("voice-call-btn");
const videoCallBtn = document.getElementById("video-call-btn");
const hangupBtn = document.getElementById("hangup-btn");
const callOverlay = document.getElementById("call-overlay");
const callAvatar = document.getElementById("call-avatar");
const callName = document.getElementById("call-name");
const callStatus = document.getElementById("call-status");
const callTimer = document.getElementById("call-timer");
const muteBtn = document.getElementById("mute-btn");
const cameraBtn = document.getElementById("camera-btn");
const endCallBtn = document.getElementById("end-call-btn");
const remoteVideo = document.getElementById("remote-video");
const localVideo = document.getElementById("local-video");
const incomingCall = document.getElementById("incoming-call");
const incomingAvatar = document.getElementById("incoming-avatar");
const incomingName = document.getElementById("incoming-name");
const incomingType = document.getElementById("incoming-type");
const acceptCallBtn = document.getElementById("accept-call");
const rejectCallBtn = document.getElementById("reject-call");
const logoutBtn = document.getElementById("logout-btn");
const typingIndicator = document.getElementById("typing-indicator");
const backBtn = document.getElementById("back-btn");
const sidebar = document.querySelector(".sidebar");
const friendsList = document.getElementById("friends-list");
const friendNameInput = document.getElementById("friend-name-input");
const groupList = document.getElementById("group-list");
const settingsBtn = document.getElementById("settings-btn");
const newGroupBtn = document.getElementById("new-group-btn");
const editChatBtn = document.getElementById("edit-chat-btn");

// ========== Helpers ==========
function getInitial(name) { return (name || "?").charAt(0).toUpperCase(); }
function formatTime() { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function formatTimer(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return m + ":" + s;
}
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}
function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}
function isMobile() { return window.innerWidth <= 700; }
function playNotificationSound() {
  if (!appSettings.sounds) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 800; gain.gain.value = 0.1;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.3);
  } catch(e) {}
}

// ========== Login ==========
joinBtn.addEventListener("click", startApp);

function startApp() {
  myName = localStorage.getItem("saimasiya_name") || "Anonymous";
  localStorage.setItem("saimasiya_name", myName);
  applySettings();
  loginScreen.classList.add("hidden");
  app.classList.remove("hidden");
  myNameEl.textContent = myName;
  setAvatar(myAvatar, myName, myPicture);

  peer = new Peer({
    debug: 1,
    config: { iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ]}
  });

  peer.on("open", id => {
    myId = id;
    const previousId = localStorage.getItem("saimasiya_peer_id");
    localStorage.setItem("saimasiya_peer_id", id);
    Object.values(groups).forEach(group => {
      const self = group.members.find(member => member.memberId === myMemberId || (!member.memberId && member.peerId === previousId));
      if (self) { self.peerId = myId; self.memberId = myMemberId; self.name = myName; }
    });
    saveGroups();
    myIdEl.textContent = id;
    myIdEl.title = id;
    renderStatusBar();
    renderGroupList();
  });
  peer.on("connection", handleIncomingDataConnection);
  peer.on("call", handleIncomingCall);
  peer.on("error", err => {
    console.error(err);
    if (err.type !== "peer-unavailable") alert("Error: " + err.type);
  });
}

// ========== Connect ==========
connectBtn.addEventListener("click", () => {
  const rid = remoteIdInput.value.trim();
  if (!rid || rid === myId) return;
  const fname = (friendNameInput && friendNameInput.value.trim()) || rid.slice(0, 8);
  addFriend(rid, fname);
  connectToPeer(rid);
  remoteIdInput.value = "";
  if (friendNameInput) friendNameInput.value = "";
});
remoteIdInput.addEventListener("keydown", e => { if (e.key === "Enter") connectBtn.click(); });

function connectToPeer(remoteId) {
  if (!connections[remoteId] || !connections[remoteId].conn.open) ensurePeerConnection(remoteId);
  if (connections[remoteId] && connections[remoteId].conn.open) {
    switchToChat(remoteId);
  } else if (connections[remoteId]) {
    connections[remoteId].openOnConnect = true;
  }
}

function ensurePeerConnection(remoteId) {
  if (!remoteId || remoteId === myId || !peer || peer.destroyed) return;
  if (connections[remoteId] && (connections[remoteId].conn.open || connections[remoteId].connecting)) return;
  const pending = connections[remoteId] && connections[remoteId].pending || [];
  delete connections[remoteId];
  setupDataConnection(peer.connect(remoteId, { reliable: true }), remoteId);
  connections[remoteId].pending = pending;
}

function setupDataConnection(conn, displayName) {
  const peerId = conn.peer;
  const pending = connections[peerId] && connections[peerId].pending || [];
  connections[peerId] = { conn, name: displayName, messages: [], typing: false, connecting: true };
  connections[peerId].pending = pending;

  conn.on("open", () => {
    if (!connections[peerId] || connections[peerId].conn !== conn) return;
    connections[peerId].connecting = false;
    conn.send({ type: "hello", name: myName, memberId: myMemberId, picture: myPicture });
    if (myStatus && myStatus.expires > Date.now()) {
      conn.send({ type: "status", status: myStatus });
    }
    // Load previous chat history
    const history = loadChatHistory(peerId);
    if (history.length && connections[peerId].messages.length === 0) {
      connections[peerId].messages = history;
    }
    sendGroupMetadataToPeer(peerId);
    connections[peerId].pending.splice(0).forEach(packet => conn.send(packet));
    renderChatList();
    renderGroupList();
    renderStatusBar();
    renderFriendsList();
    if (!currentGroupId || connections[peerId].openOnConnect) switchToChat(peerId);
    connections[peerId].openOnConnect = false;
  });
  conn.on("data", data => handleData(peerId, data));
  conn.on("close", () => {
    if (connections[peerId]) {
      if (connections[peerId].conn !== conn) return;
      connections[peerId].connecting = false;
      connections[peerId].name = (connections[peerId].name || "").replace(" (offline)","") + " (offline)";
      renderChatList();
      if (activePeerId === peerId) peerStatusEl.textContent = "Disconnected";
    }
  });
  conn.on("error", () => {
    if (connections[peerId] && connections[peerId].conn === conn) connections[peerId].connecting = false;
  });
}

function handleIncomingDataConnection(conn) {
  setupDataConnection(conn, conn.peer);
}

function handleData(peerId, data) {
  const chat = connections[peerId];
  if (!chat) return;

  if (data.type === "group-meta" && data.group) {
    mergeGroupMetadata(data.group, peerId);
  }
  else if (data.type === "group-message" && data.groupId && data.message) {
    receiveGroupMessage(peerId, data);
  }
  else if (data.type === "hello") {
    const savedFriend = friends.find(friend => friend.peerId === peerId);
    const remotePicture = isValidAvatar(data.picture) ? data.picture : "";
    chat.name = savedFriend && savedFriend.customName ? savedFriend.name : (data.name || peerId);
    chat.picture = savedFriend && (savedFriend.customPicture || (savedFriend.customName && savedFriend.picture))
      ? savedFriend.picture
      : remotePicture;
    addFriend(peerId, chat.name, data.memberId);
    const friend = friends.find(item => item.peerId === peerId);
    if (friend) {
      friend.remotePicture = remotePicture;
      saveFriends();
      renderFriendsList();
    }
    updateGroupMemberRoute(peerId, data.memberId, data.name);
    renderChatList();
    renderFriendsList();
    if (activePeerId === peerId) {
      peerNameEl.textContent = chat.name;
      setAvatar(peerAvatar, chat.name, chat.picture);
    }
  }
  else if (data.type === "message") {
    addMessage(peerId, { text: data.text, from: "in", time: data.time || formatTime(), status: "received" });
    if (activePeerId === peerId && document.hasFocus()) chat.conn.send({ type: "read" });
    if (activePeerId !== peerId || document.hidden) playNotificationSound();
  }
  else if (data.type === "file") {
    addMessage(peerId, { type: "file", name: data.name, size: data.size, mime: data.mime, data: data.data, from: "in", time: data.time || formatTime() });
    if (activePeerId !== peerId || document.hidden) playNotificationSound();
  }
  else if (data.type === "typing") {
    chat.typing = data.isTyping;
    if (activePeerId === peerId) typingIndicator.classList.toggle("hidden", !data.isTyping);
  }
  else if (data.type === "read") {
    chat.messages.forEach(m => { if (m.from === "out") m.status = "read"; });
    if (activePeerId === peerId) renderMessages();
  }
  else if (data.type === "status") {
    if (data.status && data.status.expires > Date.now()) {
      statuses[peerId] = data.status;
    } else {
      delete statuses[peerId];
    }
    renderStatusBar();
  }
}

// ========== Chat UI ==========
function renderChatList() {
  chatList.innerHTML = "";
  Object.keys(connections).forEach(id => {
    const chat = connections[id];
    const last = chat.messages[chat.messages.length - 1];
    const preview = last ? (last.type === "file" ? "📎 " + last.name : last.text) : "New chat";
    const item = document.createElement("div");
    item.className = "chat-item" + (id === activePeerId ? " active" : "");
    const avatar = document.createElement("div");
    avatar.className = "avatar small";
    setAvatar(avatar, chat.name, chat.picture);
    const info = document.createElement("div");
    info.innerHTML = `<div class="name">${escapeHtml(chat.name)}</div><div class="preview">${escapeHtml(preview)}</div>`;
    item.append(avatar, info);
    item.onclick = () => switchToChat(id);
    chatList.appendChild(item);
  });
}

function renderGroupList() {
  if (!groupList) return;
  groupList.innerHTML = "";
  Object.values(groups).forEach(group => {
    const last = group.messages[group.messages.length - 1];
    const item = document.createElement("div");
    item.className = "chat-item" + (currentGroupId === group.id ? " active" : "");
    const avatar = document.createElement("div");
    avatar.className = "avatar small";
    setAvatar(avatar, group.name, group.picture);
    const info = document.createElement("div");
    info.innerHTML = `<div class="name">${escapeHtml(group.name)}</div><div class="preview">${escapeHtml(last ? (last.type === "file" ? "📎 " + last.name : last.text) : `${group.members.length} members`)}</div>`;
    item.append(avatar, info);
    item.onclick = () => switchToGroup(group.id);
    groupList.appendChild(item);
  });
}

function switchToChat(peerId) {
  currentGroupId = null;
  activePeerId = peerId;
  const chat = connections[peerId];
  if (!chat) return;
  emptyState.classList.add("hidden");
  chatView.classList.remove("hidden");
  peerNameEl.textContent = chat.name;
  setAvatar(peerAvatar, chat.name, chat.picture);
  peerStatusEl.textContent = chat.conn.open ? "Online" : "Offline";
  editChatBtn.classList.remove("hidden");
  voiceCallBtn.classList.remove("hidden");
  videoCallBtn.classList.remove("hidden");
  chat.messages.forEach(m => { if (m.from === "in") m.status = "read"; });
  if (chat.conn.open) chat.conn.send({ type: "read" });
  typingIndicator.classList.toggle("hidden", !chat.typing);
  renderMessages();
  renderChatList();
  renderGroupList();
  messageInput.focus();
  if (isMobile()) sidebar.classList.add("hidden-mobile");
}

function switchToGroup(groupId) {
  const group = groups[groupId];
  if (!group) return;
  currentGroupId = groupId;
  activePeerId = null;
  emptyState.classList.add("hidden");
  chatView.classList.remove("hidden");
  peerNameEl.textContent = group.name;
  setAvatar(peerAvatar, group.name, group.picture);
  const online = group.members.filter(member => member.peerId !== myId && connections[member.peerId] && connections[member.peerId].conn.open).length;
  peerStatusEl.textContent = `${group.members.length} members · ${online} online`;
  editChatBtn.classList.remove("hidden");
  voiceCallBtn.classList.add("hidden");
  videoCallBtn.classList.add("hidden");
  hangupBtn.classList.add("hidden");
  typingIndicator.classList.add("hidden");
  renderMessages();
  renderGroupList();
  messageInput.focus();
  if (isMobile()) sidebar.classList.add("hidden-mobile");
}

function renderMessages() {
  messagesEl.innerHTML = "";
  const group = currentGroupId && groups[currentGroupId];
  const chat = group || connections[activePeerId];
  if (!chat) return;
  chat.messages.forEach(msg => {
    const div = document.createElement("div");
    div.className = "message " + msg.from;
    if (msg.type === "file") {
      div.classList.add("file");
      const isImg = msg.mime && msg.mime.startsWith("image/");
      const sender = msg.senderName ? `<div class="message-sender">${escapeHtml(msg.senderName)}</div>` : "";
      if (isImg) {
        div.innerHTML = `${sender}<img class="preview" src="${escapeHtml(msg.data)}" alt="${escapeHtml(msg.name)}"/>
          <a href="${escapeHtml(msg.data)}" download="${escapeHtml(msg.name)}">${escapeHtml(msg.name)}</a>
          <div class="time">${escapeHtml(msg.time)}</div>`;
      } else {
        div.innerHTML = `${sender}<div class="file-icon">📄</div>
          <a href="${escapeHtml(msg.data)}" download="${escapeHtml(msg.name)}">${escapeHtml(msg.name)}</a>
          <div class="time">${escapeHtml(msg.time)} • ${formatBytes(msg.size)}</div>`;
      }
    } else {
      let ticks = "";
      if (msg.from === "out") {
        ticks = msg.status === "read" ? '<span class="ticks read">✓✓</span>' : '<span class="ticks">✓</span>';
      }
      div.innerHTML = `${msg.senderName ? `<div class="message-sender">${escapeHtml(msg.senderName)}</div>` : ""}<div>${escapeHtml(msg.text)}</div><div class="time">${escapeHtml(msg.time)}${ticks}</div>`;
    }
    if (msg.from === "in" && msg.senderName) div.dataset.sender = msg.senderName;
    messagesEl.appendChild(div);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addMessage(peerId, msg) {
  if (!connections[peerId]) return;
  connections[peerId].messages.push(msg);
  if (peerId === activePeerId) renderMessages();
  renderChatList();
  saveChatHistory(peerId);
}

function setAvatar(element, name, picture) {
  const validPicture = isValidAvatar(picture) ? picture : "";
  element.textContent = validPicture ? "" : getInitial(name);
  element.style.backgroundImage = validPicture ? `url("${validPicture}")` : "";
  element.classList.toggle("has-picture", !!validPicture);
}

function isValidAvatar(value) {
  return typeof value === "string" && value.length < 400000 && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/i.test(value);
}

function sendToPeer(peerId, packet) {
  const chat = connections[peerId];
  if (chat && chat.conn.open) {
    chat.conn.send(packet);
    return;
  }
  ensurePeerConnection(peerId);
  if (connections[peerId]) connections[peerId].pending.push(packet);
}

function sendGroupMetadataToPeer(peerId) {
  Object.values(groups).forEach(group => {
    if (group.members.some(member => member.peerId === peerId)) {
      sendToPeer(peerId, { type: "group-meta", group: groupMetadata(group) });
    }
  });
}

function groupMetadata(group) {
  return {
    id: group.id,
    name: group.name,
    picture: group.picture || "",
    members: group.members,
    updatedAt: group.updatedAt || Date.now()
  };
}

function sendGroupPacket(group, packet, exceptPeerId) {
  group.members.forEach(member => {
    if (member.memberId !== myMemberId && member.peerId !== myId && member.peerId !== exceptPeerId) sendToPeer(member.peerId, packet);
  });
}

function mergeGroupMetadata(incoming, senderPeerId) {
  if (typeof incoming.id !== "string" || incoming.id.length > 200 || typeof incoming.name !== "string" || !Array.isArray(incoming.members)) return;
  const members = incoming.members.filter(member => member && typeof member.peerId === "string");
  if (!members.some(member => member.memberId === myMemberId || member.peerId === myId) || !members.some(member => member.peerId === senderPeerId)) return;
  const existing = groups[incoming.id];
  const updatedAt = Number(incoming.updatedAt) || Date.now();
  if (existing && updatedAt <= (existing.updatedAt || 0)) return;
  groups[incoming.id] = {
    id: incoming.id,
    name: incoming.name.slice(0, 40) || "Group chat",
    picture: isValidAvatar(incoming.picture) ? incoming.picture : "",
    members: members.map(member => ({
      peerId: member.memberId === myMemberId ? myId : member.peerId,
      memberId: typeof member.memberId === "string" ? member.memberId : "",
      name: String(member.name || member.peerId).slice(0, 40)
    })),
    messages: existing ? existing.messages : [],
    updatedAt
  };
  saveGroups();
  renderGroupList();
  if (currentGroupId === incoming.id) switchToGroup(incoming.id);
  members.forEach(member => {
    if (member.peerId !== myId && member.peerId !== senderPeerId) {
      sendToPeer(member.peerId, { type: "group-meta", group: groupMetadata(groups[incoming.id]) });
    }
  });
}

function updateGroupMemberRoute(peerId, memberId, name) {
  if (!memberId) return;
  let changed = false;
  Object.values(groups).forEach(group => {
    const member = group.members.find(item => item.memberId === memberId || item.peerId === peerId);
    if (member && (member.peerId !== peerId || member.memberId !== memberId || member.name !== name)) {
      member.peerId = peerId;
      member.memberId = memberId;
      member.name = name || member.name;
      group.updatedAt = Math.max(Date.now(), (group.updatedAt || 0) + 1);
      sendGroupPacket(group, { type: "group-meta", group: groupMetadata(group) });
      changed = true;
    }
  });
  if (changed) saveGroups();
}

function receiveGroupMessage(senderPeerId, packet) {
  const group = groups[packet.groupId];
  const message = packet.message;
  if (!group || !group.members.some(member => member.peerId === senderPeerId) || !message.id) return;
  if (group.messages.some(existing => existing.id === message.id)) return;
  if (message.type === "message" && (typeof message.text !== "string" || message.text.length > 10000)) return;
  if (message.type === "file" && (typeof message.name !== "string" || typeof message.data !== "string" || message.data.length > 21 * 1024 * 1024 || !/^data:[a-z0-9.+-]+\/[a-z0-9.+-]*;base64,[A-Za-z0-9+/]+=*$/i.test(message.data))) return;
  if (message.type !== "message" && message.type !== "file") return;
  const sender = group.members.find(member => member.peerId === senderPeerId);
  const received = {
    id: String(message.id).slice(0, 240),
    type: message.type,
    text: message.type === "message" ? message.text : undefined,
    name: message.type === "file" ? message.name.slice(0, 255) : undefined,
    size: message.type === "file" ? Number(message.size) || 0 : undefined,
    mime: message.type === "file" ? String(message.mime || "") : undefined,
    data: message.type === "file" ? message.data : undefined,
    senderId: senderPeerId,
    senderName: sender ? sender.name : "Member",
    time: String(message.time || formatTime()).slice(0, 40),
    from: "in"
  };
  group.messages.push(received);
  group.messages = group.messages.slice(-200);
  saveGroups();
  renderGroupList();
  if (currentGroupId === group.id) renderMessages();
  else if (document.hidden || currentGroupId !== group.id) playNotificationSound();
  sendGroupPacket(group, packet, senderPeerId);
}

function createGroup() {
  const name = document.getElementById("group-name-input").value.trim();
  const peerIds = parsePeerIds(document.getElementById("group-members-input").value);
  if (!name) { alert("Enter a group name."); return; }
  if (!myId) { alert("Wait for your Peer ID to connect, then create the group."); return; }
  if (!peerIds.length) { alert("Enter at least one friend's Peer ID."); return; }
  const members = [{ peerId: myId, memberId: myMemberId, name: myName }];
  peerIds.forEach(peerId => {
    const friend = friends.find(item => item.peerId === peerId);
    members.push({ peerId, memberId: friend && friend.memberId || "", name: friend ? friend.name : peerId.slice(0, 8) });
  });
  const id = `${myId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const group = { id, name: name.slice(0, 40), picture: groupPictureData, members, messages: [], updatedAt: Date.now() };
  groups[id] = group;
  saveGroups();
  document.getElementById("group-modal").classList.add("hidden");
  document.getElementById("group-name-input").value = "";
  document.getElementById("group-members-input").value = "";
  groupPictureData = "";
  document.getElementById("group-picture-preview").innerHTML = "";
  sendGroupPacket(group, { type: "group-meta", group: groupMetadata(group) });
  renderGroupList();
  switchToGroup(id);
}

function parsePeerIds(value) {
  return [...new Set(value.split(/[\s,;]+/).map(id => id.trim()).filter(id => id && id !== myId))];
}

function editCurrentGroup() {
  const group = groups[currentGroupId];
  const chat = activePeerId && connections[activePeerId];
  if (!group && !chat) return;
  document.getElementById("edit-chat-title").textContent = group ? "Edit group" : "Edit chat";
  document.getElementById("edit-group-members-field").classList.toggle("hidden", !group);
  document.getElementById("edit-group-name-input").value = group ? group.name : chat.name;
  document.getElementById("edit-group-members-input").value = "";
  const picture = group ? group.picture : chat.picture;
  document.getElementById("edit-group-picture-preview").innerHTML = picture ? `<img src="${picture}" alt="Chat picture preview">` : "";
  editGroupPictureData = picture || "";
  document.getElementById("edit-chat-modal").classList.remove("hidden");
}

function saveCurrentGroup() {
  const group = groups[currentGroupId];
  const name = document.getElementById("edit-group-name-input").value.trim();
  if (!name) { alert("Enter a group name."); return; }
  if (!group) {
    const chat = connections[activePeerId];
    if (!chat) return;
    chat.name = name.slice(0, 40);
    chat.picture = editGroupPictureData;
    const friend = friends.find(item => item.peerId === activePeerId);
    if (friend) {
      friend.name = chat.name;
      friend.picture = chat.picture;
      friend.customName = true;
      friend.customPicture = !!chat.picture;
      saveFriends();
      renderFriendsList();
    }
    document.getElementById("edit-chat-modal").classList.add("hidden");
    switchToChat(activePeerId);
    return;
  }
  parsePeerIds(document.getElementById("edit-group-members-input").value).forEach(peerId => {
    if (!group.members.some(member => member.peerId === peerId || (friend && friend.memberId && member.memberId === friend.memberId))) {
      const friend = friends.find(item => item.peerId === peerId);
      group.members.push({ peerId, memberId: friend && friend.memberId || "", name: friend ? friend.name : peerId.slice(0, 8) });
    }
  });
  group.name = name.slice(0, 40);
  group.picture = editGroupPictureData;
  group.updatedAt = Math.max(Date.now(), (group.updatedAt || 0) + 1);
  saveGroups();
  sendGroupPacket(group, { type: "group-meta", group: groupMetadata(group) });
  document.getElementById("edit-chat-modal").classList.add("hidden");
  switchToGroup(group.id);
}

function readGroupPicture(file, previewId, updateValue) {
  if (!file) return;
  if (!file.type.startsWith("image/")) { alert("Choose an image file."); return; }
  const reader = new FileReader();
  reader.onerror = () => alert("Could not read that image.");
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => alert("Could not open that image.");
    image.onload = () => {
      const scale = Math.min(1, 256 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", 0.82);
      updateValue(data);
      document.getElementById(previewId).innerHTML = `<img src="${data}" alt="Group picture preview">`;
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

// ========== Send + Typing ==========
sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
messageInput.addEventListener("input", () => {
  if (!activePeerId) return;
  const chat = connections[activePeerId];
  if (!chat || !chat.conn.open) return;
  chat.conn.send({ type: "typing", isTyping: true });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => chat.conn.send({ type: "typing", isTyping: false }), 1500);
});

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  if (currentGroupId) {
    const group = groups[currentGroupId];
    if (!group) return;
    const message = { id: `${myId}-${Date.now()}-${Math.random().toString(36).slice(2)}`, type: "message", text, time: formatTime(), senderId: myId, senderName: myName, from: "out" };
    group.messages.push(message);
    group.messages = group.messages.slice(-200);
    saveGroups();
    sendGroupPacket(group, { type: "group-message", groupId: group.id, message });
    messageInput.value = "";
    renderMessages();
    renderGroupList();
    return;
  }
  if (!activePeerId) return;
  const chat = connections[activePeerId];
  if (!chat || !chat.conn.open) return;
  const msg = { type: "message", text, time: formatTime(), id: Date.now() };
  chat.conn.send(msg);
  chat.conn.send({ type: "typing", isTyping: false });
  addMessage(activePeerId, { text, from: "out", time: msg.time, status: "sent" });
  messageInput.value = "";
}

// ========== Files ==========
fileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file || (!activePeerId && !currentGroupId)) return;
  if (file.size > 15 * 1024 * 1024) { alert("Max 15 MB"); return; }
  if (currentGroupId) {
    const group = groups[currentGroupId];
    const reader = new FileReader();
    reader.onload = () => {
      const message = { id: `${myId}-${Date.now()}-${Math.random().toString(36).slice(2)}`, type: "file", name: file.name, size: file.size, mime: file.type, data: reader.result, time: formatTime(), senderId: myId, senderName: myName, from: "out" };
      group.messages.push(message);
      group.messages = group.messages.slice(-200);
      saveGroups();
      sendGroupPacket(group, { type: "group-message", groupId: group.id, message });
      renderMessages();
      renderGroupList();
    };
    reader.readAsDataURL(file);
    fileInput.value = "";
    return;
  }
  const chat = connections[activePeerId];
  if (!chat || !chat.conn.open) return;
  const reader = new FileReader();
  reader.onload = () => {
    const payload = { type: "file", name: file.name, size: file.size, mime: file.type, data: reader.result, time: formatTime() };
    chat.conn.send(payload);
    addMessage(activePeerId, { type: "file", name: file.name, size: file.size, mime: file.type, data: reader.result, from: "out", time: payload.time });
  };
  reader.readAsDataURL(file);
  fileInput.value = "";
});

// ========== Voice & Video Calls ==========
if (voiceCallBtn) voiceCallBtn.addEventListener("click", () => startCall(false));
if (videoCallBtn) videoCallBtn.addEventListener("click", () => startCall(true));
if (endCallBtn) endCallBtn.addEventListener("click", endCall);
if (hangupBtn) hangupBtn.addEventListener("click", endCall);
if (muteBtn) muteBtn.addEventListener("click", toggleMute);
if (cameraBtn) cameraBtn.addEventListener("click", toggleCamera);
if (acceptCallBtn) acceptCallBtn.addEventListener("click", acceptIncomingCall);
if (rejectCallBtn) rejectCallBtn.addEventListener("click", rejectIncomingCall);

async function getLocalStream(video = false) {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Camera and microphone access is unavailable. Use HTTPS or localhost in a supported browser.");
    }
    if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: video ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } : false
    });
    return mediaStream;
  } catch (err) {
    alert(err.message && err.message.startsWith("Camera and microphone access")
      ? err.message
      : (video ? "Camera/microphone access is unavailable. Check browser permissions and try again." : "Microphone access is unavailable. Check browser permissions and try again."));
    throw err;
  }
}

async function startCall(video = false) {
  if (!activePeerId || currentCall) return;
  if (!peer || peer.destroyed) { alert("Your connection is not ready yet. Please try again."); return; }
  if (!connections[activePeerId] || !connections[activePeerId].conn.open) { alert("Connect to this friend before starting a call."); return; }
  isVideoCall = video;
  let mediaReady = false;
  try {
    const stream = await getLocalStream(video);
    mediaReady = true;
    currentCall = peer.call(activePeerId, stream, { metadata: { video, name: myName } });
    if (!currentCall) throw new Error("The call could not be created.");
    const chat = connections[activePeerId];
    showCallUI(chat ? chat.name : activePeerId, video ? "Video calling…" : "Calling…", video, activePeerId);
    if (video && localVideo) { localVideo.srcObject = stream; localVideo.classList.remove("hidden"); }
    currentCall.on("stream", remoteStream => {
      playRemoteStream(remoteStream, video);
      callStatus.textContent = "Connected";
      startCallTimer();
    });
    currentCall.on("close", endCallCleanup);
    currentCall.on("error", () => endCallCleanup());
  } catch (e) {
    console.error("Could not start call", e);
    endCallCleanup();
    if (mediaReady) alert("Could not start the call. Check your connection and try again.");
  }
}

function handleIncomingCall(call) {
  pendingCall = call;
  const meta = call.metadata || {};
  isVideoCall = !!meta.video;
  const peerId = call.peer;
  const name = connections[peerId] ? connections[peerId].name : (meta.name || peerId);
  incomingName.textContent = name;
  const friend = friends.find(item => item.peerId === peerId);
  setAvatar(incomingAvatar, name, friend && (friend.picture || friend.remotePicture));
  if (incomingType) incomingType.textContent = isVideoCall ? "Video call…" : "Voice call…";
  incomingCall.classList.remove("hidden");
  playNotificationSound();
}

async function acceptIncomingCall() {
  if (!pendingCall) return;
  incomingCall.classList.add("hidden");
  try {
    const stream = await getLocalStream(isVideoCall);
    pendingCall.answer(stream);
    currentCall = pendingCall;
    pendingCall = null;
    const peerId = currentCall.peer;
    const name = connections[peerId] ? connections[peerId].name : peerId;
    showCallUI(name, "Connecting…", isVideoCall, peerId);
    if (isVideoCall && localVideo) { localVideo.srcObject = stream; localVideo.classList.remove("hidden"); }
    currentCall.on("stream", s => {
      playRemoteStream(s, isVideoCall);
      callStatus.textContent = "Connected";
      startCallTimer();
    });
    currentCall.on("close", endCallCleanup);
    currentCall.on("error", () => endCallCleanup());
  } catch (e) {
    console.error("Could not answer call", e);
    rejectIncomingCall();
  }
}

function rejectIncomingCall() {
  if (pendingCall) { pendingCall.close(); pendingCall = null; }
  incomingCall.classList.add("hidden");
}

function showCallUI(name, status, video, peerId) {
  callName.textContent = name;
  const chat = peerId && connections[peerId];
  const friend = peerId && friends.find(item => item.peerId === peerId);
  setAvatar(callAvatar, name, chat && chat.picture || friend && (friend.picture || friend.remotePicture));
  callStatus.textContent = status;
  callTimer.textContent = "00:00";
  callOverlay.classList.remove("hidden");
  if (hangupBtn) hangupBtn.classList.remove("hidden");
  if (voiceCallBtn) voiceCallBtn.classList.add("hidden");
  if (videoCallBtn) videoCallBtn.classList.add("hidden");
  if (video) {
    if (remoteVideo) remoteVideo.classList.remove("hidden");
    if (localVideo) localVideo.classList.remove("hidden");
    callAvatar.style.display = "none";
  } else {
    if (remoteVideo) remoteVideo.classList.add("hidden");
    if (localVideo) localVideo.classList.add("hidden");
    callAvatar.style.display = "flex";
  }
  if (cameraBtn) cameraBtn.style.display = video ? "flex" : "none";
  isCameraOff = false; isMuted = false;
  if (muteBtn) muteBtn.textContent = "🔇";
  if (cameraBtn) cameraBtn.textContent = "📷";
}

function playRemoteStream(stream, video) {
  if (video && remoteVideo) {
    remoteVideo.srcObject = stream;
    remoteVideo.classList.remove("hidden");
  } else {
    let audio = document.getElementById("remote-audio");
    if (!audio) {
      audio = document.createElement("audio");
      audio.id = "remote-audio";
      audio.autoplay = true;
      document.body.appendChild(audio);
    }
    audio.srcObject = stream;
  }
}

function startCallTimer() {
  callSeconds = 0;
  callTimerInterval = setInterval(() => {
    callSeconds++;
    callTimer.textContent = formatTimer(callSeconds);
  }, 1000);
}

function endCall() {
  if (currentCall) currentCall.close();
  endCallCleanup();
}

function endCallCleanup() {
  if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
  currentCall = null; isVideoCall = false;
  callOverlay.classList.add("hidden");
  if (hangupBtn) hangupBtn.classList.add("hidden");
  const directChatActive = !!activePeerId && !currentGroupId;
  if (voiceCallBtn) voiceCallBtn.classList.toggle("hidden", !directChatActive);
  if (videoCallBtn) videoCallBtn.classList.toggle("hidden", !directChatActive);
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  if (remoteVideo) remoteVideo.srcObject = null;
  if (localVideo) localVideo.srcObject = null;
  const audio = document.getElementById("remote-audio");
  if (audio) audio.srcObject = null;
}

function toggleMute() {
  if (!mediaStream) return;
  isMuted = !isMuted;
  mediaStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  if (muteBtn) muteBtn.textContent = isMuted ? "🔊" : "🔇";
}

function toggleCamera() {
  if (!mediaStream) return;
  isCameraOff = !isCameraOff;
  mediaStream.getVideoTracks().forEach(t => t.enabled = !isCameraOff);
  if (cameraBtn) cameraBtn.textContent = isCameraOff ? "🚫" : "📷";
  if (localVideo) localVideo.style.opacity = isCameraOff ? "0.3" : "1";
}

// ========== STATUS / STORIES ==========
function renderStatusBar() {
  const bar = document.getElementById("status-bar");
  if (!bar) return;
  bar.innerHTML = "";

  // My status
  const myItem = document.createElement("div");
  myItem.className = "status-item my-status";
  myItem.innerHTML = `
    <div class="status-ring ${myStatus && myStatus.expires > Date.now() ? "has-status" : ""}">
      <div class="avatar">${getInitial(myName)}</div>
      <span class="add-icon">+</span>
    </div>
    <div class="status-name">My Status</div>
  `;
  myItem.onclick = openStatusCreator;
  bar.appendChild(myItem);

  // Friends' statuses
  Object.keys(statuses).forEach(pid => {
    const st = statuses[pid];
    if (!st || st.expires < Date.now()) return;
    const name = connections[pid] ? connections[pid].name : pid;
    const item = document.createElement("div");
    item.className = "status-item";
    item.innerHTML = `
      <div class="status-ring has-status">
        <div class="avatar">${getInitial(name)}</div>
      </div>
      <div class="status-name">${escapeHtml(name.split(" ")[0])}</div>
    `;
    item.onclick = () => viewStatus(pid, name, st);
    bar.appendChild(item);
  });
}

function openStatusCreator() {
  document.getElementById("status-modal").classList.remove("hidden");
  document.getElementById("status-text").value = "";
  document.getElementById("status-preview").innerHTML = "";
  document.getElementById("status-file").value = "";
}

function closeStatusCreator() {
  document.getElementById("status-modal").classList.add("hidden");
}

function postStatus() {
  const text = document.getElementById("status-text").value.trim();
  const preview = document.getElementById("status-preview");
  const img = preview.querySelector("img");
  const imageData = img ? img.src : null;

  if (!text && !imageData) {
    alert("Add text or an image");
    return;
  }

  myStatus = {
    text: text || "",
    image: imageData,
    time: Date.now(),
    expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  };

  // Broadcast to all connected peers
  Object.values(connections).forEach(c => {
    if (c.conn && c.conn.open) {
      c.conn.send({ type: "status", status: myStatus });
    }
  });

  closeStatusCreator();
  renderStatusBar();
  alert("Status posted! Friends who are connected can see it.");
}

function viewStatus(pid, name, st) {
  const viewer = document.getElementById("status-viewer");
  const content = document.getElementById("status-viewer-content");
  content.innerHTML = "";
  if (st.image) {
    content.innerHTML += `<img src="${st.image}" class="status-full-img"/>`;
  }
  if (st.text) {
    content.innerHTML += `<div class="status-full-text">${escapeHtml(st.text)}</div>`;
  }
  content.innerHTML += `<div class="status-meta">${escapeHtml(name)} • ${new Date(st.time).toLocaleTimeString()}</div>`;
  viewer.classList.remove("hidden");
}

function closeStatusViewer() {
  document.getElementById("status-viewer").classList.add("hidden");
}

// Status file input
document.addEventListener("change", e => {
  if (e.target.id === "status-file") {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      document.getElementById("status-preview").innerHTML = `<img src="${reader.result}"/>`;
    };
    reader.readAsDataURL(file);
  }
});

// ========== Misc ==========
if (copyIdBtn) copyIdBtn.addEventListener("click", () => {
  if (!myId) return;
  navigator.clipboard.writeText(myId).then(() => {
    copyIdBtn.textContent = "✅";
    setTimeout(() => copyIdBtn.textContent = "📋", 1500);
  });
});

if (logoutBtn) logoutBtn.addEventListener("click", () => {
  if (peer) peer.destroy();
  location.reload();
});

if (settingsBtn) settingsBtn.addEventListener("click", openSettings);
if (newGroupBtn) newGroupBtn.addEventListener("click", () => document.getElementById("group-modal").classList.remove("hidden"));
if (document.getElementById("create-group-btn")) document.getElementById("create-group-btn").addEventListener("click", createGroup);
if (document.getElementById("cancel-group-btn")) document.getElementById("cancel-group-btn").addEventListener("click", () => document.getElementById("group-modal").classList.add("hidden"));
if (editChatBtn) editChatBtn.addEventListener("click", editCurrentGroup);
if (document.getElementById("save-group-btn")) document.getElementById("save-group-btn").addEventListener("click", saveCurrentGroup);
if (document.getElementById("cancel-edit-chat-btn")) document.getElementById("cancel-edit-chat-btn").addEventListener("click", () => document.getElementById("edit-chat-modal").classList.add("hidden"));
if (document.getElementById("group-picture-input")) document.getElementById("group-picture-input").addEventListener("change", event => readGroupPicture(event.target.files[0], "group-picture-preview", value => groupPictureData = value));
if (document.getElementById("edit-group-picture-input")) document.getElementById("edit-group-picture-input").addEventListener("change", event => readGroupPicture(event.target.files[0], "edit-group-picture-preview", value => editGroupPictureData = value));
if (document.getElementById("save-settings-btn")) document.getElementById("save-settings-btn").addEventListener("click", saveSettings);
if (document.getElementById("cancel-settings-btn")) document.getElementById("cancel-settings-btn").addEventListener("click", () => document.getElementById("settings-modal").classList.add("hidden"));
if (settingsNameInput) settingsNameInput.addEventListener("input", () => {
  const name = settingsNameInput.value.trim();
  if (name) localStorage.setItem("saimasiya_name", name.slice(0, 20));
});
if (document.getElementById("settings-picture-input")) document.getElementById("settings-picture-input").addEventListener("change", event => readGroupPicture(event.target.files[0], "settings-picture-preview", value => profilePictureDraft = value));
if (document.getElementById("remove-profile-picture-btn")) document.getElementById("remove-profile-picture-btn").addEventListener("click", () => {
  profilePictureDraft = "";
  document.getElementById("settings-picture-preview").innerHTML = "";
  document.getElementById("settings-picture-input").value = "";
});

if (backBtn) backBtn.addEventListener("click", () => {
  chatView.classList.add("hidden");
  emptyState.classList.remove("hidden");
  if (isMobile()) sidebar.classList.remove("hidden-mobile");
  activePeerId = null;
  currentGroupId = null;
  renderChatList();
  renderGroupList();
});

messagesEl.addEventListener("click", e => {
  if (e.target.tagName === "IMG" && e.target.classList.contains("preview")) {
    window.open(e.target.src, "_blank");
  }
});

// PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// ========== FRIENDS SYSTEM (localStorage) ==========
function loadGroups() {
  try {
    const saved = JSON.parse(localStorage.getItem("saimasiya_groups") || "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved)
      .filter(([id, group]) => group && group.id === id && Array.isArray(group.members))
      .map(([id, group]) => [id, {
        ...group,
        name: String(group.name || "Group chat").slice(0, 40),
        picture: isValidAvatar(group.picture) ? group.picture : "",
        messages: Array.isArray(group.messages) ? group.messages.slice(-200) : []
      }]));
  } catch {
    return {};
  }
}

function saveGroups() {
  try {
    localStorage.setItem("saimasiya_groups", JSON.stringify(groups));
  } catch (error) {
    console.error("Could not save group chats", error);
    alert("Could not save group chats. Your device storage may be full.");
  }
}

function loadSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem("saimasiya_settings") || "{}");
    const colors = { green: "#00a884", blue: "#4c9aff", purple: "#b388ff" };
    const theme = ["green", "blue", "purple"].includes(settings.theme) ? settings.theme : "green";
    return {
      theme,
      color: /^#[0-9a-f]{6}$/i.test(settings.color) ? settings.color : colors[theme],
      mode: settings.mode === "light" ? "light" : "dark",
      picture: isValidAvatar(settings.picture) ? settings.picture : "",
      sounds: settings.sounds !== false
    };
  } catch {
    return { theme: "green", color: "#00a884", mode: "dark", picture: "", sounds: true };
  }
}

function loadMemberIdentity() {
  let memberId = localStorage.getItem("saimasiya_member_id");
  if (!memberId) {
    memberId = `member-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("saimasiya_member_id", memberId);
  }
  return memberId;
}

function applySettings() {
  const themes = {
    green: { accent: "#00a884", bubble: "#005c4b" },
    blue: { accent: "#4c9aff", bubble: "#174b78" },
    purple: { accent: "#b388ff", bubble: "#553584" }
  };
  const theme = themes[appSettings.theme] || themes.green;
  const color = /^#[0-9a-f]{6}$/i.test(appSettings.color) ? appSettings.color : theme.accent;
  const rgb = [1, 3, 5].map(index => Math.round(parseInt(color.slice(index, index + 2), 16) * 0.45));
  const bubble = "#" + rgb.map(channel => channel.toString(16).padStart(2, "0")).join("");
  document.documentElement.dataset.mode = appSettings.mode === "light" ? "light" : "dark";
  document.documentElement.style.setProperty("--accent", color);
  document.documentElement.style.setProperty("--bubble-out", bubble);
  document.querySelector('meta[name="theme-color"]').content = color;
}

function openSettings() {
  document.getElementById("settings-name-input").value = myName || localStorage.getItem("saimasiya_name") || "";
  profilePictureDraft = myPicture;
  document.getElementById("settings-color-input").value = appSettings.color;
  document.getElementById("settings-mode-input").value = appSettings.mode;
  document.getElementById("settings-picture-preview").innerHTML = myPicture ? `<img src="${myPicture}" alt="Profile picture preview">` : "";
  document.getElementById("settings-sounds-input").checked = appSettings.sounds;
  document.getElementById("settings-modal").classList.remove("hidden");
}

function saveSettings() {
  const name = document.getElementById("settings-name-input").value.trim();
  if (!name) { alert("Enter your display name."); return; }
  myName = name.slice(0, 20);
  appSettings = {
    theme: appSettings.theme,
    color: document.getElementById("settings-color-input").value,
    mode: document.getElementById("settings-mode-input").value,
    picture: profilePictureDraft,
    sounds: document.getElementById("settings-sounds-input").checked
  };
  myPicture = profilePictureDraft;
  localStorage.setItem("saimasiya_name", myName);
  localStorage.setItem("saimasiya_settings", JSON.stringify(appSettings));
  applySettings();
  myNameEl.textContent = myName;
  setAvatar(myAvatar, myName, myPicture);
  if (peer) {
    Object.values(connections).forEach(chat => {
      if (chat.conn.open) chat.conn.send({ type: "hello", name: myName, memberId: myMemberId, picture: myPicture });
    });
    Object.values(groups).forEach(group => {
      const self = group.members.find(member => member.memberId === myMemberId || member.peerId === myId);
      if (self) self.name = myName;
      group.updatedAt = Math.max(Date.now(), (group.updatedAt || 0) + 1);
      sendGroupPacket(group, { type: "group-meta", group: groupMetadata(group) });
    });
    saveGroups();
  }
  document.getElementById("settings-modal").classList.add("hidden");
}

function loadFriends() {
  try {
    friends = JSON.parse(localStorage.getItem("saimasiya_friends") || "[]");
  } catch {
    friends = [];
  }
  renderFriendsList();
}

function saveFriends() {
  localStorage.setItem("saimasiya_friends", JSON.stringify(friends));
}

function addFriend(peerId, name, memberId) {
  if (!peerId || peerId === myId) return;
  const existing = friends.find(f => f.peerId === peerId);
  if (existing) {
    if (!existing.customName) existing.name = name || existing.name;
    if (memberId) existing.memberId = memberId;
    existing.lastSeen = Date.now();
  } else {
    friends.push({
      id: Date.now().toString(),
      peerId,
      memberId: memberId || "",
      name: name || peerId.slice(0, 8),
      lastSeen: Date.now()
    });
  }
  saveFriends();
  renderFriendsList();
}

function removeFriend(peerId) {
  friends = friends.filter(f => f.peerId !== peerId);
  saveFriends();
  renderFriendsList();
}

function renderFriendsList() {
  if (!friendsList) return;
  friendsList.innerHTML = "";
  if (friends.length === 0) {
    friendsList.innerHTML = '<div style="padding:0.75rem 1rem;color:var(--text-muted);font-size:0.8rem;">No friends yet. Add one above.</div>';
    return;
  }
  friends.forEach(f => {
    const isOnline = !!connections[f.peerId] && connections[f.peerId].conn && connections[f.peerId].conn.open;
    const item = document.createElement("div");
    item.className = "chat-item";
    const avatar = document.createElement("div");
    avatar.className = "avatar small";
    setAvatar(avatar, f.name, f.picture || f.remotePicture);
    const dot = document.createElement("span");
    dot.className = isOnline ? "online-dot" : "offline-dot";
    const info = document.createElement("div");
    info.style.cssText = "flex:1;min-width:0;";
    info.innerHTML = `<div class="name">${escapeHtml(f.name)}</div><div class="preview">${isOnline ? "Online" : "Offline"}</div>`;
    const actions = document.createElement("div");
    actions.className = "friend-actions";
    const chatButton = document.createElement("button");
    chatButton.title = "Chat";
    chatButton.textContent = "💬";
    chatButton.onclick = event => { event.stopPropagation(); connectToPeer(f.peerId); };
    const removeButton = document.createElement("button");
    removeButton.className = "remove-friend";
    removeButton.title = "Remove";
    removeButton.textContent = "✕";
    removeButton.onclick = event => { event.stopPropagation(); removeFriend(f.peerId); };
    actions.append(chatButton, removeButton);
    item.append(avatar, dot, info, actions);
    item.onclick = () => connectToPeer(f.peerId);
    friendsList.appendChild(item);
  });
}

// Load friends on start
loadFriends();

// Also save chat history lightly
function saveChatHistory(peerId) {
  if (!connections[peerId]) return;
  try {
    const key = "saimasiya_chat_" + peerId;
    const msgs = connections[peerId].messages.slice(-100); // last 100
    localStorage.setItem(key, JSON.stringify(msgs));
  } catch (e) {}
}

function loadChatHistory(peerId) {
  try {
    const key = "saimasiya_chat_" + peerId;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

applySettings();
