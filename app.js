// Multi-user PeerJS voice chat for GitHub Pages (mesh, up to 4+ people)

let peer = null;
let localStream = null;
let peers = {}; // peerId: {call, conn}
let roomPeers = []; // peerIds in room
let isMuted = false;
let myPeerId = null;
let currentRoom = '';

const roomForm = document.getElementById('room-form');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const chatUI = document.getElementById('chat-ui');
const roomLabel = document.getElementById('room-label');
const leaveBtn = document.getElementById('leave-btn');
const statusDiv = document.getElementById('status');
const muteBtn = document.getElementById('mute-btn');
const unmuteBtn = document.getElementById('unmute-btn');
const peersList = document.getElementById('peers-list');

function setStatus(msg) {
  statusDiv.textContent = msg;
}

function showChatUI(show) {
  chatUI.style.display = show ? '' : 'none';
  roomForm.style.display = show ? 'none' : '';
}

function resetUI() {
  showChatUI(false);
  setStatus('');
  muteBtn.style.display = 'none';
  unmuteBtn.style.display = 'none';
  peersList.innerHTML = '';
}

function getRoomId() {
  return roomInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);
}

function updatePeersList() {
  peersList.innerHTML = '';
  let allPeers = [myPeerId].concat(roomPeers.filter(pid => pid !== myPeerId));
  allPeers.forEach(pid => {
    let li = document.createElement('li');
    li.textContent = (pid === myPeerId ? '(You) ' : '') + pid;
    peersList.appendChild(li);
  });
}

joinBtn.onclick = async function () {
  const roomId = getRoomId();
  if (!roomId) {
    alert('Enter a room name or code.');
    return;
  }
  joinBtn.disabled = true;
  setStatus('Requesting microphone access...');
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    setStatus('Microphone access denied.');
    joinBtn.disabled = false;
    return;
  }
  setStatus('Connecting...');
  // Use roomId as prefix for easier finding in PeerJS cloud
  myPeerId = roomId + '-' + Math.random().toString(36).substr(2, 6);
  peer = new Peer(myPeerId, {
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    secure: true
  });

  peer.on('open', (id) => {
    currentRoom = roomId;
    roomLabel.textContent = 'Room: ' + roomId;
    showChatUI(true);
    setStatus('Connected to PeerJS server, joining room...');
    joinRoom();
    muteBtn.style.display = '';
    muteBtn.disabled = false;
    unmuteBtn.style.display = 'none';
  });

  peer.on('call', (incomingCall) => {
    incomingCall.answer(localStream);
    setupCall(incomingCall.peer, incomingCall);
  });

  peer.on('connection', (conn) => {
    conn.on('data', (data) => handlePeerMessage(conn.peer, data));
  });

  peer.on('error', (err) => {
    setStatus('Peer error: ' + err.type);
    joinBtn.disabled = false;
  });
};

function joinRoom() {
  // Find other peers in room (prefix-based discovery)
  fetch(`https://0.peerjs.com/peers`).then(r => r.json()).then(list => {
    // Find all peers with our roomId prefix
    roomPeers = list.filter(pid => pid.startsWith(currentRoom + '-') && pid !== myPeerId);
    updatePeersList();
    // Connect to each peer: open data channel and media call
    roomPeers.forEach(pid => {
      if (peers[pid]) return;
      // Data connection
      let conn = peer.connect(pid, { reliable: false });
      conn.on('open', () => {
        conn.on('data', (data) => handlePeerMessage(pid, data));
        // Announce ourselves
        conn.send({ type: 'join', peerId: myPeerId });
      });
      // Voice call
      let call = peer.call(pid, localStream);
      setupCall(pid, call);
      peers[pid] = { call, conn };
    });
    // Tell existing peers to announce themselves back (for late joiners)
    setTimeout(() => {
      broadcast({ type: 'announce', peerId: myPeerId });
    }, 500);
    setStatus('Connected to room. Talk away!');
  }).catch(() => {
    setStatus('Failed to discover peers. Try again.');
    joinBtn.disabled = false;
  });
}

function handlePeerMessage(from, data) {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'join' && data.peerId && data.peerId !== myPeerId) {
    // New peer joined, add to list and connect back if not already
    if (!roomPeers.includes(data.peerId)) {
      roomPeers.push(data.peerId);
      updatePeersList();
    }
    if (!peers[data.peerId]) {
      // Open data channel and call back
      let conn = peer.connect(data.peerId, { reliable: false });
      conn.on('open', () => {
        conn.on('data', (msg) => handlePeerMessage(data.peerId, msg));
        conn.send({ type: 'announce', peerId: myPeerId });
      });
      let call = peer.call(data.peerId, localStream);
      setupCall(data.peerId, call);
      peers[data.peerId] = { call, conn };
    }
  } else if (data.type === 'announce' && data.peerId && data.peerId !== myPeerId) {
    // Announce presence
    if (!roomPeers.includes(data.peerId)) {
      roomPeers.push(data.peerId);
      updatePeersList();
    }
  }
}

function broadcast(msg) {
  Object.values(peers).forEach(({conn}) => {
    if (conn && conn.open) conn.send(msg);
  });
}

function setupCall(pid, peerCall) {
  if (!peers[pid]) peers[pid] = {};
  peers[pid].call = peerCall;
  peerCall.on('stream', (remoteStream) => {
    let audioId = 'remote-audio-' + pid;
    let audio = document.getElementById(audioId);
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = audioId;
      audio.autoplay = true;
      document.body.appendChild(audio);
    }
    audio.srcObject = remoteStream;
    setStatus('Connected to ' + pid);
    if (!roomPeers.includes(pid)) {
      roomPeers.push(pid);
      updatePeersList();
    }
  });
  peerCall.on('close', () => {
    removePeer(pid);
    setStatus('Peer ' + pid + ' disconnected.');
  });
  peerCall.on('error', (err) => {
    removePeer(pid);
    setStatus('Voice connection error with ' + pid);
  });
}

function removePeer(pid) {
  if (peers[pid]) {
    if (peers[pid].call) peers[pid].call.close();
    if (peers[pid].conn) peers[pid].conn.close();
    let audio = document.getElementById('remote-audio-' + pid);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
    }
    delete peers[pid];
  }
  roomPeers = roomPeers.filter(x => x !== pid);
  updatePeersList();
}

muteBtn.onclick = function () {
  if (localStream) {
    localStream.getAudioTracks().forEach(track => track.enabled = false);
    isMuted = true;
    muteBtn.style.display = 'none';
    unmuteBtn.style.display = '';
    setStatus('Muted.');
  }
};
unmuteBtn.onclick = function () {
  if (localStream) {
    localStream.getAudioTracks().forEach(track => track.enabled = true);
    isMuted = false;
    muteBtn.style.display = '';
    unmuteBtn.style.display = 'none';
    setStatus('Unmuted.');
  }
};

leaveBtn.onclick = function () {
  cleanup();
  resetUI();
  joinBtn.disabled = false;
  roomInput.value = '';
};

function cleanup() {
  Object.keys(peers).forEach(pid => removePeer(pid));
  if (peer) {
    peer.destroy();
    peer = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  isMuted = false;
  myPeerId = null;
  currentRoom = '';
}

window.onbeforeunload = cleanup;
resetUI();
