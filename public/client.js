const socket = io();

const USER_COLORS = [
  '#e3f2fd', '#f3e5f5', '#e8f5e9', '#fff3e0', '#fce4ec',
  '#e0f2f1', '#f1f8e9', '#ede7f6', '#e1f5fe', '#fff8e1'
];

const userColorMap = {};
let colorIndex = 0;

function getUserColor(username) {
  if (!userColorMap[username]) {
    userColorMap[username] = USER_COLORS[colorIndex % USER_COLORS.length];
    colorIndex++;
  }
  return userColorMap[username];
}

let currentUser = null;
let currentParty = null;
let customAvatarData = null;
let newAvatarData = null;

function getAvatarImageUrl(avatar) {
  if (!avatar) return '';
  
  if (avatar.type === 'layered' && avatar.layers && avatar.layers.base) {
    const baseMap = {
      'f1': 'light',
      'f2': 'medium', 
      'f3': 'tan',
      'f4': 'dark'
    };
    
    const baseName = baseMap[avatar.layers.base] || avatar.layers.base;
    return `assets/avatars/bases/body_${baseName}.png`;
  }
  
  if (avatar.type === 'custom') {
    return avatar.imageUrl || avatar.imageData || '';
  }
  
  return '';
}

const screens = {
  login: document.getElementById('login-screen'),
  register: document.getElementById('register-screen'),
  profile: document.getElementById('profile-screen'),
  main: document.getElementById('main-screen'),
  party: document.getElementById('party-screen'),
  avatarSelect: document.getElementById('avatar-select-screen')
};

// CRITICAL: Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Loaded - Initializing...');
  
  setupFileUpload();
  setupChangeAvatarModal();
  setupEventListeners();
  setupReactions();
  setupTabs();
  setupPasswordCheck();
  setupChat();
  setupProfilePage(); // Setup biography handlers
});

// BIOGRAPHY SETUP - This must work with your HTML
function setupProfilePage() {
  console.log('Setting up profile page handlers...');
  
  const bioTextarea = document.getElementById('bio-textarea');
  const charCount = document.getElementById('bio-char-count');
  const saveBtn = document.getElementById('save-bio-btn');
  const goToPartyBtn = document.getElementById('go-to-party-btn');
  const profileLogout = document.getElementById('profile-logout-link');
  
  console.log('Found elements:', {
    bioTextarea: !!bioTextarea,
    saveBtn: !!saveBtn,
    charCount: !!charCount
  });
  
  // Character counter
  if (bioTextarea && charCount) {
    bioTextarea.addEventListener('input', () => {
      charCount.textContent = bioTextarea.value.length;
    });
  }
  
  // SAVE BUTTON HANDLER - CRITICAL PART
  if (saveBtn) {
    saveBtn.addEventListener('click', function(e) {
      e.preventDefault(); // Stop any default form submission
      e.stopPropagation(); // Stop event bubbling
      
      console.log('Save biography clicked!');
      
      if (!currentUser) {
        console.error('No current user!');
        showMessage('Error: Not logged in!', 'error');
        return;
      }
      
      if (!bioTextarea) {
        console.error('Textarea not found!');
        return;
      }
      
      const biography = bioTextarea.value.trim();
      console.log('Saving biography:', biography);
      console.log('User ID:', currentUser.userId);
      
      // Send to server
      socket.emit('save-biography', {
        userId: currentUser.userId,
        biography: biography
      });
      
      // Update local user object
      currentUser.biography = biography;
      
      // Show temporary "Saving..." status
      const statusEl = document.getElementById('save-bio-status');
      if (statusEl) {
        statusEl.textContent = 'Saving...';
        statusEl.className = 'save-status';
      }
    });
  } else {
    console.error('ERROR: save-bio-btn not found in DOM!');
  }
  
  if (goToPartyBtn) {
    goToPartyBtn.addEventListener('click', () => {
      showScreen('main');
      if (currentUser && currentUser.partyHistory) {
        displayRecentParties(currentUser.partyHistory);
      }
    });
  }
  
  if (profileLogout) {
    profileLogout.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }
}

// SOCKET HANDLERS FOR BIOGRAPHY
socket.on('biography-saved', (data) => {
  console.log('Biography saved successfully:', data);
  showMessage('Biography saved!', 'success');
  
  const statusEl = document.getElementById('save-bio-status');
  if (statusEl) {
    statusEl.textContent = '✓ Saved successfully!';
    statusEl.className = 'save-status saved';
    
    // Clear after 3 seconds
    setTimeout(() => {
      statusEl.textContent = '';
    }, 3000);
  }
});

socket.on('biography-error', (data) => {
  console.error('Biography save error:', data);
  showMessage(data.message, 'error');
  
  const statusEl = document.getElementById('save-bio-status');
  if (statusEl) {
    statusEl.textContent = '✗ ' + data.message;
    statusEl.className = 'save-status error';
  }
});

// LOGIN SUCCESS - LOAD BIOGRAPHY
socket.on('login-success', (data) => {
  console.log('Login success, received data:', data);
  
  currentUser = data;
  showMessage('Login successful!', 'success');
  
  // Update profile screen
  const profileUsername = document.getElementById('profile-username');
  const profileAvatar = document.getElementById('profile-avatar-img');
  const bioTextarea = document.getElementById('bio-textarea');
  const bioCharCount = document.getElementById('bio-char-count');
  
  if (profileUsername) profileUsername.textContent = data.username;
  if (profileAvatar && data.avatar) {
    profileAvatar.src = getAvatarImageUrl(data.avatar);
  }
  
  // LOAD SAVED BIOGRAPHY
  if (bioTextarea) {
    bioTextarea.value = data.biography || '';
    console.log('Loaded biography into textarea:', data.biography);
  }
  if (bioCharCount) {
    bioCharCount.textContent = (data.biography || '').length;
  }
  
  // Update main screen too
  document.getElementById('display-username').textContent = data.username;
  const avatarImg = document.getElementById('current-avatar-img');
  if (avatarImg && data.avatar) {
    avatarImg.src = getAvatarImageUrl(data.avatar);
  }
  
  // Show profile screen first
  showScreen('profile');
});

function setupPasswordCheck() {
  const password = document.getElementById('reg-password');
  const confirm = document.getElementById('reg-confirm-password');
  
  if (!password || !confirm) return;
  
  function checkMatch() {
    const matchDiv = document.getElementById('password-match-status');
    if (!matchDiv) return;
    
    if (confirm.value === '') {
      matchDiv.textContent = '';
      return;
    }
    
    if (password.value === confirm.value) {
      matchDiv.textContent = '✓ Passwords match!';
      matchDiv.style.color = '#27ae60';
    } else {
      matchDiv.textContent = '✗ Passwords do not match';
      matchDiv.style.color = '#c0392b';
    }
  }
  
  password.addEventListener('input', checkMatch);
  confirm.addEventListener('input', checkMatch);
}

function setupFileUpload() {
  const uploadBox = document.getElementById('upload-box');
  const fileInput = document.getElementById('custom-avatar');
  
  if (!uploadBox || !fileInput) return;
  
  uploadBox.addEventListener('click', () => {
    fileInput.click();
  });
  
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.match(/image\/png/)) {
      showMessage('Please upload a PNG file only!', 'error');
      fileInput.value = '';
      return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
      showMessage('File too large! Max 2MB.', 'error');
      fileInput.value = '';
      return;
    }
    
    try {
      const processedImage = await processImage(file);
      customAvatarData = processedImage;
      
      const previewDiv = document.getElementById('upload-preview');
      const previewImg = document.getElementById('preview-img');
      const uploadPlaceholder = document.getElementById('upload-placeholder');
      
      previewImg.src = processedImage;
      previewDiv.classList.remove('hidden');
      uploadPlaceholder.classList.add('hidden');
      uploadBox.classList.add('has-image');
      
      showMessage('Image uploaded successfully!', 'success');
    } catch (err) {
      console.error(err);
      showMessage('Error processing image. Try another.', 'error');
    }
  });
}

function setupChangeAvatarModal() {
  const changeBtn = document.getElementById('change-avatar-btn');
  const changeBtnMain = document.getElementById('change-avatar-btn-main');
  const modal = document.getElementById('change-avatar-modal');
  const cancelBtn = document.getElementById('cancel-change-btn');
  const saveBtn = document.getElementById('save-avatar-btn');
  const uploadBox = document.getElementById('change-upload-box');
  const fileInput = document.getElementById('change-avatar-input');
  
  const openModal = () => {
    const currentImg = document.getElementById('current-avatar-img') || document.getElementById('profile-avatar-img');
    const modalCurrent = document.getElementById('modal-current-avatar');
    if (currentImg && modalCurrent) {
      modalCurrent.src = currentImg.src;
    }
    
    newAvatarData = null;
    const previewDiv = document.getElementById('change-upload-preview');
    if (previewDiv) previewDiv.classList.add('hidden');
    const uploadPlaceholder = document.getElementById('change-upload-placeholder');
    if (uploadPlaceholder) uploadPlaceholder.classList.remove('hidden');
    if (uploadBox) uploadBox.classList.remove('has-image');
    if (fileInput) fileInput.value = '';
    
    if (modal) modal.classList.remove('hidden');
  };
  
  if (changeBtn) {
    changeBtn.addEventListener('click', openModal);
  }
  
  if (changeBtnMain) {
    changeBtnMain.addEventListener('click', openModal);
  }
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (modal) modal.classList.add('hidden');
    });
  }
  
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  }
  
  if (uploadBox) {
    uploadBox.addEventListener('click', () => {
      if (fileInput) fileInput.click();
    });
  }
  
  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      if (!file.type.match(/image\/png/)) {
        showMessage('Please upload a PNG file only!', 'error');
        return;
      }
      
      if (file.size > 2 * 1024 * 1024) {
        showMessage('File too large! Max 2MB.', 'error');
        return;
      }
      
      try {
        const processedImage = await processImage(file);
        newAvatarData = processedImage;
        
        const previewDiv = document.getElementById('change-upload-preview');
        const previewImg = document.getElementById('change-preview-img');
        const uploadPlaceholder = document.getElementById('change-upload-placeholder');
        
        if (previewImg) previewImg.src = processedImage;
        if (previewDiv) {
          previewDiv.classList.remove('hidden');
        }
        if (uploadPlaceholder) uploadPlaceholder.classList.add('hidden');
        uploadBox.classList.add('has-image');
        
        showMessage('New image ready! Click Save to update.', 'success');
      } catch (err) {
        showMessage('Error processing image. Try another.', 'error');
      }
    });
  }
  
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      if (!newAvatarData) {
        showMessage('Please select a new image first!', 'error');
        return;
      }
      
      socket.emit('update-avatar', {
        userId: currentUser.userId,
        imageData: newAvatarData
      });
    });
  }
}

socket.on('avatar-updated', (data) => {
  showMessage('Profile picture updated!', 'success');
  currentUser.avatar = data.avatar;
  
  const currentImg = document.getElementById('current-avatar-img');
  const profileImg = document.getElementById('profile-avatar-img');
  const newSrc = getAvatarImageUrl(data.avatar);
  
  if (currentImg) currentImg.src = newSrc;
  if (profileImg) profileImg.src = newSrc;
  
  const modal = document.getElementById('change-avatar-modal');
  if (modal) modal.classList.add('hidden');
});

function processImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const img = new Image();
    
    reader.onload = (e) => {
      img.src = e.target.result;
    };
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const size = 200;
      canvas.width = size;
      canvas.height = size;
      
      let sourceX, sourceY, sourceSize;
      
      if (img.width > img.height) {
        sourceSize = img.height;
        sourceX = (img.width - img.height) / 2;
        sourceY = 0;
      } else {
        sourceSize = img.width;
        sourceX = 0;
        sourceY = (img.height - img.width) / 2;
      }
      
      ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
      const dataUrl = canvas.toDataURL('image/png');
      resolve(dataUrl);
    };
    
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setupChat() {
  document.addEventListener('click', (e) => {
    if (e.target.id === 'send-btn' || e.target.closest('#send-btn')) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const chatInput = document.getElementById('chat-input');
      if (chatInput && document.activeElement === chatInput) {
        e.preventDefault();
        sendMessage();
      }
    }
  });
  
  document.addEventListener('input', (e) => {
    if (e.target.id === 'chat-input') {
      const charCount = document.querySelector('.char-count');
      if (charCount) {
        charCount.textContent = `${e.target.value.length}/500`;
      }
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    }
  });
}

function sendMessage() {
  const chatInput = document.getElementById('chat-input');
  if (!chatInput) return;
  
  const message = chatInput.value.trim();
  if (!message) return;
  
  let partyCode = currentParty;
  if (!partyCode) {
    const partyCodeEl = document.getElementById('current-party-code');
    partyCode = partyCodeEl ? partyCodeEl.textContent : null;
  }
  
  if (!partyCode) {
    showMessage('Error: Not in a party!', 'error');
    return;
  }
  
  socket.emit('send-message', {
    partyCode: partyCode,
    message: message
  });
  
  chatInput.value = '';
  chatInput.style.height = 'auto';
  const charCount = document.querySelector('.char-count');
  if (charCount) charCount.textContent = '0/500';
}

function displayMessage(data) {
  const chatMessages = document.getElementById('chat-messages');
  if (!chatMessages) return;
  
  const bubble = document.createElement('div');
  
  if (data.isOwn) {
    bubble.className = 'message-bubble own';
  } else if (data.username === 'System') {
    bubble.className = 'message-bubble system';
  } else {
    const userColor = getUserColor(data.username);
    bubble.className = 'message-bubble other';
    bubble.style.backgroundColor = userColor;
    bubble.style.borderColor = userColor;
    bubble.style.color = '#1d3f58';
  }
  
  const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  bubble.innerHTML = `
    <div class="message-header">${data.username} • ${time}</div>
    <div class="message-text">${escapeHtml(data.message)}</div>
  `;
  
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setupTabs() {
  const showRegister = document.getElementById('show-register');
  const showLogin = document.getElementById('show-login');
  
  if (showRegister) {
    showRegister.addEventListener('click', (e) => {
      e.preventDefault();
      showScreen('register');
    });
  }
  
  if (showLogin) {
    showLogin.addEventListener('click', (e) => {
      e.preventDefault();
      showScreen('login');
    });
  }
}

function showScreen(screenName) {
  Object.values(screens).forEach(screen => {
    if (screen) screen.classList.add('hidden');
  });
  if (screens[screenName]) screens[screenName].classList.remove('hidden');
}

function setupEventListeners() {
  const registerBtn = document.getElementById('create-account-btn');
  if (registerBtn) {
    registerBtn.addEventListener('click', createAccount);
  }
  
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', login);
  }
  
  const createPartyBtn = document.getElementById('create-party-btn');
  if (createPartyBtn) {
    createPartyBtn.addEventListener('click', () => {
      socket.emit('create-party');
    });
  }
  
  const joinPartyBtn = document.getElementById('join-party-btn');
  if (joinPartyBtn) {
    joinPartyBtn.addEventListener('click', () => {
      const code = document.getElementById('party-code').value.toUpperCase();
      if (code.length === 6) {
        socket.emit('join-party', { partyCode: code });
      } else {
        showMessage('Enter 6-letter code!', 'error');
      }
    });
  }
  
  const leavePartyBtn = document.getElementById('leave-party-btn');
  if (leavePartyBtn) {
    leavePartyBtn.addEventListener('click', () => {
      if (currentParty) {
        socket.emit('leave-party', { partyCode: currentParty });
      }
      
      currentParty = null;
      
      const membersList = document.getElementById('members-list');
      if (membersList) membersList.innerHTML = '';
      
      showScreen('main');
      
      if (currentUser && currentUser.partyHistory) {
        displayRecentParties(currentUser.partyHistory);
      }
      
      showMessage('Left the party', 'success');
    });
  }
  
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
  
  const usernameInput = document.getElementById('reg-username');
  if (usernameInput) {
    usernameInput.addEventListener('blur', () => {
      const username = usernameInput.value.trim();
      if (username.length >= 3) {
        socket.emit('check-username', { username });
      }
    });
  }
}

function logout() {
  currentUser = null;
  currentParty = null;
  customAvatarData = null;
  newAvatarData = null;
  
  Object.keys(userColorMap).forEach(key => delete userColorMap[key]);
  colorIndex = 0;
  
  const loginUsername = document.getElementById('login-username');
  const loginPassword = document.getElementById('login-password');
  if (loginUsername) loginUsername.value = '';
  if (loginPassword) loginPassword.value = '';
  
  showScreen('login');
  
  showMessage('Logged out successfully!', 'success');
}

function createAccount() {
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirmPassword = document.getElementById('reg-confirm-password').value;
  
  if (!username || username.length < 3) {
    showMessage('Username must be at least 3 characters!', 'error');
    return;
  }
  
  if (!password || password.length < 4) {
    showMessage('Password must be at least 4 characters!', 'error');
    return;
  }
  
  if (password !== confirmPassword) {
    showMessage('Passwords do not match!', 'error');
    return;
  }
  
  let avatarConfig = null;
  
  const configInput = document.getElementById('reg-avatar-config');
  if (configInput && configInput.value) {
    try {
      avatarConfig = JSON.parse(configInput.value);
    } catch (e) {
      console.error('Invalid avatar config:', e);
    }
  }
  
  if (!avatarConfig) {
    showMessage('Error loading default avatar!', 'error');
    return;
  }
  
  socket.emit('create-account', {
    username: username,
    password: password,
    avatarConfig: avatarConfig
  });
}

function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  
  if (!username || !password) {
    showMessage('Enter username and password!', 'error');
    return;
  }
  
  socket.emit('login', { username, password });
}

socket.on('username-status', (data) => {
  const statusEl = document.getElementById('username-status');
  if (statusEl) {
    statusEl.textContent = data.message;
    statusEl.className = data.available ? 'status-available' : 'status-taken';
  }
});

socket.on('account-created', (data) => {
  showMessage('Account created! Please login.', 'success');
  setTimeout(() => {
    showScreen('login');
  }, 1500);
});

socket.on('account-error', (data) => {
  showMessage(data.message, 'error');
});

socket.on('login-error', (data) => {
  showMessage(data.message, 'error');
});

socket.on('party-created', (data) => {
  currentParty = data.partyCode;
  document.getElementById('current-party-code').textContent = data.partyCode;
  showScreen('party');
  
  const chatMessages = document.getElementById('chat-messages');
  if (chatMessages) chatMessages.innerHTML = '';
  Object.keys(userColorMap).forEach(key => delete userColorMap[key]);
  colorIndex = 0;
  
  updateMembersList([{
    username: currentUser.username,
    avatar: currentUser.avatar,
    isHost: true
  }]);
  
  if (!currentUser.partyHistory) currentUser.partyHistory = [];
  currentUser.partyHistory = [data.partyCode, ...currentUser.partyHistory.filter(c => c !== data.partyCode)].slice(0, 4);
  
  showMessage(`Party created! Code: ${data.partyCode}`, 'success');
});

socket.on('chat-history', (data) => {
  const chatMessages = document.getElementById('chat-messages');
  if (!chatMessages) return;
  
  chatMessages.innerHTML = '';
  
  data.messages.forEach(msg => {
    displayMessage({
      username: msg.username,
      message: msg.message,
      timestamp: msg.timestamp,
      isOwn: msg.username === currentUser.username
    });
  });
  
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on('joined-party', (data) => {
  currentParty = data.partyCode;
  document.getElementById('current-party-code').textContent = data.partyCode;
  showScreen('party');
  
  Object.keys(userColorMap).forEach(key => delete userColorMap[key]);
  colorIndex = 0;
  
  updateMembersList(data.members);
  showMessage('Joined party!', 'success');
  
  if (!currentUser.partyHistory) currentUser.partyHistory = [];
  currentUser.partyHistory = [data.partyCode, ...currentUser.partyHistory.filter(c => c !== data.partyCode)].slice(0, 4);
  displayRecentParties(currentUser.partyHistory);
});

socket.on('player-joined', (data) => {
  showMessage(`${data.username} joined!`, 'success');
  addMemberToDisplay(data.username, data.avatar, false);
  
  displayMessage({
    username: 'System',
    message: `${data.username} joined the party!`,
    timestamp: new Date().toISOString(),
    isOwn: false
  });
});

socket.on('player-left', (data) => {
  showMessage(`${data.username} left`, 'error');
  removeMemberFromDisplay(data.username);
  
  displayMessage({
    username: 'System',
    message: `${data.username} left the party.`,
    timestamp: new Date().toISOString(),
    isOwn: false
  });
});

socket.on('new-message', (data) => {
  displayMessage(data);
});

socket.on('new-reaction', (data) => {
  showMessage(`${data.username} reacted ${data.emoji}`, 'success');
});

socket.on('error', (data) => {
  showMessage(data.message, 'error');
});

function displayRecentParties(partyHistory) {
  const container = document.getElementById('recent-parties');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (partyHistory.length === 0) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'block';
  
  const title = document.createElement('div');
  title.textContent = 'Recent Parties';
  title.style.cssText = 'font-weight: bold; color: #1d3f58; margin-bottom: 10px; font-size: 14px;';
  container.appendChild(title);
  
  const list = document.createElement('div');
  list.style.cssText = 'display: flex; flex-wrap: wrap; gap: 10px;';
  
  partyHistory.forEach(code => {
    const btn = document.createElement('button');
    btn.textContent = code;
    btn.className = 'btn-secondary';
    btn.style.cssText = 'padding: 8px 16px; font-size: 13px; width: auto; margin: 0;';
    btn.onclick = () => {
      socket.emit('rejoin-party', { partyCode: code });
    };
    list.appendChild(btn);
  });
  
  container.appendChild(list);
}

function setupReactions() {
  document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentParty) {
        socket.emit('send-reaction', { 
          partyCode: currentParty, 
          emoji: btn.textContent 
        });
      } else {
        showMessage('Join a party first!', 'error');
      }
    });
  });
}

function showMessage(text, type) {
  const box = document.getElementById('message-box');
  if (!box) return;
  box.textContent = text;
  box.className = type;
  box.classList.remove('hidden');
  
  setTimeout(() => {
    box.classList.add('hidden');
  }, 3000);
}

function updateMembersList(members) {
  const container = document.getElementById('members-list');
  if (!container) return;
  container.innerHTML = '';
  
  members.forEach(member => {
    addMemberToDisplay(member.username, member.avatar, member.isHost);
  });
}

function addMemberToDisplay(username, avatar, isHost) {
  const container = document.getElementById('members-list');
  if (!container) return;
  
  if (document.getElementById(`member-${username}`)) return;
  
  const card = document.createElement('div');
  card.className = 'member-card';
  card.id = `member-${username}`;
  
  const imageUrl = getAvatarImageUrl(avatar);
  
  card.innerHTML = `
    <img src="${imageUrl}" class="member-avatar-img" alt="${username}" onerror="this.src='assets/avatars/bases/body_light.png'">
    <div class="member-name">${username}</div>
    ${isHost ? '<span class="host-badge">HOST</span>' : ''}
  `;
  
  container.appendChild(card);
}

function removeMemberFromDisplay(username) {
  const element = document.getElementById(`member-${username}`);
  if (element) {
    element.remove();
  }
}