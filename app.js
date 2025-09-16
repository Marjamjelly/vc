// Simple PeerJS voice chat app for GitHub Pages

let peer = null;
let call = null;
let localStream = null;
let currentRoom = '';
let isMuted = false;

const roomForm = document.getElementById('room-form');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const chatUI = document.getElementById('chat-ui');
const roomLabel = document.getElementById('room-label');
const leaveBtn = document.getElementById('leave-btn');
const statusDiv = document.getElementById('status');
const muteBtn = document.getElementById('mute-btn');
const unmuteBtn = document.getElementById('unmute-btn');

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
}

function getRoomId() {
  return roomInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);
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
  peer = new Peer(undefined, {
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    secure: true
  });
  peer.on('open', (id) => {
    // Try to connect to existing room "host", or become host if first
    connectToRoom(roomId, id);
  });
  peer.on('call', (incomingCall) => {
    // Someone is calling: answer and set up audio
    incomingCall.answer(localStream);
    setupCall(incomingCall);
  });
  peer.on('error', (err) => {
    setStatus('Peer error: ' + err);
    joinBtn.disabled = false;
  });
};

function connectToRoom(roomId, myPeerId) {
  currentRoom = roomId;
  roomLabel.textContent = 'Room: ' + roomId;
  showChatUI(true);
  setStatus('Looking for peers...');
  // Use roomId as a "host" peer; others will try to call that peer
  if (myPeerId.startsWith(roomId)) {
    // Prevent collision: randomize if peerjs assigned us the same id as the room
    myPeerId = roomId + '-' + Math.random().toString(36).substr(2, 6);
  }
  // Try to connect as "host" or "client"
  if (myPeerId === roomId) {
    // Host: wait for calls
    setStatus('Room created. Waiting for others...');
  } else {
    // Try to call the host
    const callToHost = peer.call(roomId, localStream);
    setupCall(callToHost);
  }
  muteBtn.style.display = '';
  muteBtn.disabled = false;
  unmuteBtn.style.display = 'none';
}

function setupCall(peerCall) {
  call = peerCall;
  call.on('stream', (remoteStream) => {
    // Play remote audio
    let audio = document.getElementById('remote-audio');
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'remote-audio';
      audio.autoplay = true;
      document.body.appendChild(audio);
    }
    audio.srcObject = remoteStream;
    setStatus('Voice chat connected!');
  });
  call.on('close', () => {
    setStatus('Peer disconnected.');
    cleanup();
  });
  call.on('error', (err) => {
    setStatus('Voice connection error.');
    cleanup();
  });
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
  if (call) {
    call.close();
    call = null;
  }
  if (peer) {
    peer.destroy();
    peer = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  let audio = document.getElementById('remote-audio');
  if (audio) {
    audio.srcObject = null;
    audio.remove();
  }
  isMuted = false;
}

window.onbeforeunload = cleanup;
resetUI();
