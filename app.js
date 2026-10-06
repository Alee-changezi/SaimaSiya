// ========== State ==========
let peer = null;
let myId = null;
let myName = "";
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

// ========== DOM ==========
const loginScreen = document.getElementById("login-screen");
const app = document.getElementById("app");
const usernameInput = document.getElementById("username-input");
const joinBtn = document.getElementById("join-btn");
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
usernameInput.addEventListener("keydown", e => { if (e.key === "Enter") startApp(); });

function startApp() {
  myName = usernameInput.value.trim() || "Anonymous";
  if (!myName) return;
  loginScreen.classList.add("hidden");
  app.classList.remove("hidden");
  myNameEl.textContent = myName;
  myAvatar.textContent = getInitial(myName);

  peer = new Peer({
    debug: 1,
    config: { iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ]}
  });

  peer.on("open", id => {
    myId = id;
    myIdEl.textContent = id;
    myIdEl.title = id;
    renderStatusBar();
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
  if (connections[remoteId]) { switchToChat(remoteId); return; }
  const conn = peer.connect(remoteId, { reliable: true });
  setupDataConnection(conn, remoteId);
}

function setupDataConnection(conn, displayName) {
  const peerId = conn.peer;
  connections[peerId] = { conn, name: displayName, messages: [], typing: false };

  conn.on("open", () => {
    conn.send({ type: "hello", name: myName });
    if (myStatus && myStatus.expires > Date.now()) {
      conn.send({ type: "status", status: myStatus });
    }
    // Load previous chat history
    const history = loadChatHistory(peerId);
    if (history.length && connections[peerId].messages.length === 0) {
      connections[peerId].messages = history;
    }
    renderChatList();
    renderStatusBar();
    renderFriendsList();
    switchToChat(peerId);
  });
  conn.on("data", data => handleData(peerId, data));
  conn.on("close", () => {
    if (connections[peerId]) {
      connections[peerId].name = (connections[peerId].name || "").replace(" (offline)","") + " (offline)";
      renderChatList();
      if (activePeerId === peerId) peerStatusEl.textContent = "Disconnected";
    }
  });
}

function handleIncomingDataConnection(conn) {
  setupDataConnection(conn, conn.peer);
}

function handleData(peerId, data) {
  const chat = connections[peerId];
  if (!chat) return;

  if (data.type === "hello") {
    chat.name = data.name || peerId;
    addFriend(peerId, chat.name);
    renderChatList();
    renderFriendsList();
    if (activePeerId === peerId) {
      peerNameEl.textContent = chat.name;
      peerAvatar.textContent = getInitial(chat.name);
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
    item.innerHTML = `<div class="avatar small">${getInitial(chat.name)}</div>
      <div><div class="name">${escapeHtml(chat.name)}</div>
      <div class="preview">${escapeHtml(preview)}</div></div>`;
    item.onclick = () => switchToChat(id);
    chatList.appendChild(item);
  });
}

function switchToChat(peerId) {
  activePeerId = peerId;
  const chat = connections[peerId];
  if (!chat) return;
  emptyState.classList.add("hidden");
  chatView.classList.remove("hidden");
  peerNameEl.textContent = chat.name;
  peerAvatar.textContent = getInitial(chat.name);
  peerStatusEl.textContent = chat.conn.open ? "Online" : "Offline";
  chat.messages.forEach(m => { if (m.from === "in") m.status = "read"; });
  if (chat.conn.open) chat.conn.send({ type: "read" });
  typingIndicator.classList.toggle("hidden", !chat.typing);
  renderMessages();
  renderChatList();
  messageInput.focus();
  if (isMobile()) sidebar.classList.add("hidden-mobile");
}

function renderMessages() {
  messagesEl.innerHTML = "";
  const chat = connections[activePeerId];
  if (!chat) return;
  chat.messages.forEach(msg => {
    const div = document.createElement("div");
    div.className = "message " + msg.from;
    if (msg.type === "file") {
      div.classList.add("file");
      const isImg = msg.mime && msg.mime.startsWith("image/");
      if (isImg) {
        div.innerHTML = `<img class="preview" src="${msg.data}" alt="${escapeHtml(msg.name)}"/>
          <a href="${msg.data}" download="${escapeHtml(msg.name)}">${escapeHtml(msg.name)}</a>
          <div class="time">${msg.time}</div>`;
      } else {
        div.innerHTML = `<div class="file-icon">📄</div>
          <a href="${msg.data}" download="${escapeHtml(msg.name)}">${escapeHtml(msg.name)}</a>
          <div class="time">${msg.time} • ${formatBytes(msg.size)}</div>`;
      }
    } else {
      let ticks = "";
      if (msg.from === "out") {
        ticks = msg.status === "read" ? '<span class="ticks read">✓✓</span>' : '<span class="ticks">✓</span>';
      }
      div.innerHTML = `<div>${escapeHtml(msg.text)}</div><div class="time">${msg.time}${ticks}</div>`;
    }
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
  if (!text || !activePeerId) return;
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
  if (!file || !activePeerId) return;
  if (file.size > 15 * 1024 * 1024) { alert("Max 15 MB"); return; }
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
    if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: video ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } : false
    });
    return mediaStream;
  } catch (err) {
    alert(video ? "Camera/Mic access denied" : "Microphone access denied");
    throw err;
  }
}

async function startCall(video = false) {
  if (!activePeerId || currentCall) return;
  isVideoCall = video;
  try {
    const stream = await getLocalStream(video);
    currentCall = peer.call(activePeerId, stream, { metadata: { video, name: myName } });
    const chat = connections[activePeerId];
    showCallUI(chat ? chat.name : activePeerId, video ? "Video calling…" : "Calling…", video);
    if (video && localVideo) { localVideo.srcObject = stream; localVideo.classList.remove("hidden"); }
    currentCall.on("stream", remoteStream => {
      playRemoteStream(remoteStream, video);
      callStatus.textContent = "Connected";
      startCallTimer();
    });
    currentCall.on("close", endCallCleanup);
    currentCall.on("error", () => endCallCleanup());
  } catch (e) { console.error(e); }
}

function handleIncomingCall(call) {
  pendingCall = call;
  const meta = call.metadata || {};
  isVideoCall = !!meta.video;
  const peerId = call.peer;
  const name = connections[peerId] ? connections[peerId].name : (meta.name || peerId);
  incomingName.textContent = name;
  incomingAvatar.textContent = getInitial(name);
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
    showCallUI(name, "Connected", isVideoCall);
    startCallTimer();
    if (isVideoCall && localVideo) { localVideo.srcObject = stream; localVideo.classList.remove("hidden"); }
    currentCall.on("stream", s => playRemoteStream(s, isVideoCall));
    currentCall.on("close", endCallCleanup);
  } catch (e) { rejectIncomingCall(); }
}

function rejectIncomingCall() {
  if (pendingCall) { pendingCall.close(); pendingCall = null; }
  incomingCall.classList.add("hidden");
}

function showCallUI(name, status, video) {
  callName.textContent = name;
  callAvatar.textContent = getInitial(name);
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
  if (voiceCallBtn) voiceCallBtn.classList.remove("hidden");
  if (videoCallBtn) videoCallBtn.classList.remove("hidden");
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

if (backBtn) backBtn.addEventListener("click", () => {
  chatView.classList.add("hidden");
  emptyState.classList.remove("hidden");
  if (isMobile()) sidebar.classList.remove("hidden-mobile");
  activePeerId = null;
  renderChatList();
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

function addFriend(peerId, name) {
  if (!peerId || peerId === myId) return;
  const existing = friends.find(f => f.peerId === peerId);
  if (existing) {
    existing.name = name || existing.name;
    existing.lastSeen = Date.now();
  } else {
    friends.push({
      id: Date.now().toString(),
      peerId,
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
    item.innerHTML = `
      <div class="avatar small">${getInitial(f.name)}</div>
      <span class="${isOnline ? "online-dot" : "offline-dot"}"></span>
      <div style="flex:1;min-width:0;">
        <div class="name">${escapeHtml(f.name)}</div>
        <div class="preview">${isOnline ? "Online" : "Offline"}</div>
      </div>
      <div class="friend-actions">
        <button title="Chat" onclick="event.stopPropagation(); connectToPeer('${f.peerId}')">💬</button>
        <button class="remove-friend" title="Remove" onclick="event.stopPropagation(); removeFriend('${f.peerId}')">✕</button>
      </div>
    `;
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
