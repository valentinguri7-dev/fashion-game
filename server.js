const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*"
  }
});

const DB_FILE = './users.json';
let users = {};
let parties = {};

function loadUsers() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      users = JSON.parse(data);
      console.log(`Loaded ${Object.keys(users).length} users from database`);
    }
  } catch (err) {
    console.log('No existing database found, starting fresh');
    users = {};
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
    console.log('✓ Database saved successfully');
    return true;
  } catch (err) {
    console.error('✗ Error saving users:', err);
    return false;
  }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('Someone connected:', socket.id);
  
  socket.on('check-username', (data) => {
    const { username } = data;
    const existingUser = Object.values(users).find(u => u.username.toLowerCase() === username.toLowerCase());
    socket.emit('username-status', { 
      available: !existingUser,
      message: existingUser ? 'Username taken!' : 'Username available!'
    });
  });

  socket.on('create-account', (data) => {
    const { username, password, avatarConfig } = data;
    
    if (!username || username.length < 3) {
      socket.emit('account-error', { message: 'Username must be at least 3 characters!' });
      return;
    }
    
    if (!password || password.length < 4) {
      socket.emit('account-error', { message: 'Password must be at least 4 characters!' });
      return;
    }
    
    const existingUser = Object.values(users).find(u => u.username.toLowerCase() === username.toLowerCase());
    if (existingUser) {
      socket.emit('account-error', { message: 'Username already taken! Choose another.' });
      return;
    }
    
    let finalAvatarConfig;
    
    if (avatarConfig.type === 'layered') {
      if (!avatarConfig.layers || !avatarConfig.layers.base) {
        socket.emit('account-error', { message: 'Invalid avatar configuration!' });
        return;
      }
      
      const validBases = ['light', 'medium', 'tan', 'dark'];
      if (!validBases.includes(avatarConfig.layers.base)) {
        socket.emit('account-error', { message: 'Invalid avatar selection!' });
        return;
      }
      
      finalAvatarConfig = {
        type: 'layered',
        gender: avatarConfig.gender || 'female',
        layers: {
          base: avatarConfig.layers.base,
          hair: avatarConfig.layers.hair || null,
          top: avatarConfig.layers.top || null,
          bottom: avatarConfig.layers.bottom || null,
          shoes: avatarConfig.layers.shoes || null
        },
        colors: avatarConfig.colors || {}
      };
      
      console.log('Creating account with layered avatar:', avatarConfig.layers.base);
      
    } else if (avatarConfig.imageData) {
      try {
        const base64Data = avatarConfig.imageData.replace(/^data:image\/png;base64,/, '');
        const filename = `avatar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`;
        const filepath = path.join(uploadsDir, filename);
        
        fs.writeFileSync(filepath, base64Data, 'base64');
        
        finalAvatarConfig = {
          type: 'custom',
          imageUrl: `/uploads/${filename}`,
          base: 'CUSTOM'
        };
        
        console.log('Saved custom avatar:', filename);
      } catch (err) {
        console.error('Error saving avatar:', err);
        socket.emit('account-error', { message: 'Error saving avatar image!' });
        return;
      }
    } else {
      socket.emit('account-error', { message: 'Avatar configuration required!' });
      return;
    }
    
    const userId = 'user_' + Date.now();
    users[userId] = {
      id: userId,
      username: username,
      password: hashPassword(password),
      avatar: finalAvatarConfig,
      biography: '', // Initialize empty biography
      partyHistory: [], // Initialize empty party history
      createdAt: new Date().toISOString()
    };
    
    saveUsers();
    
    console.log('Account created:', username);
    socket.emit('account-created', { 
      success: true, 
      userId: userId,
      username: username 
    });
  });

  socket.on('update-avatar', (data) => {
    const { userId, imageData } = data;
    
    if (!userId || !imageData) {
      socket.emit('error', { message: 'Missing data!' });
      return;
    }
    
    const user = users[userId];
    if (!user) {
      socket.emit('error', { message: 'User not found!' });
      return;
    }
    
    try {
      if (user.avatar && user.avatar.imageUrl) {
        const oldFilename = path.basename(user.avatar.imageUrl);
        const oldPath = path.join(uploadsDir, oldFilename);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
          console.log('Deleted old avatar:', oldFilename);
        }
      }
      
      const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
      const filename = `avatar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`;
      const filepath = path.join(uploadsDir, filename);
      
      fs.writeFileSync(filepath, base64Data, 'base64');
      
      user.avatar = {
        type: 'custom',
        imageUrl: `/uploads/${filename}`,
        base: 'CUSTOM'
      };
      
      saveUsers();
      
      console.log('Updated avatar for:', user.username);
      socket.emit('avatar-updated', {
        success: true,
        avatar: user.avatar
      });
    } catch (err) {
      console.error('Error updating avatar:', err);
      socket.emit('error', { message: 'Error saving new avatar!' });
    }
  });

  // ==========================================
  // BIOGRAPHY SAVE HANDLER - CRITICAL FIX
  // ==========================================
  socket.on('save-biography', (data) => {
    console.log('==========================================');
    console.log('RECEIVED save-biography event');
    console.log('Data received:', data);
    console.log('==========================================');
    
    try {
      const { userId, biography } = data;
      
      if (!userId) {
        console.error('ERROR: No userId provided');
        socket.emit('biography-error', { message: 'User ID missing!' });
        return;
      }
      
      const user = users[userId];
      console.log('Looking for user ID:', userId);
      console.log('User found:', user ? 'YES' : 'NO');
      
      if (!user) {
        console.error('ERROR: User not found in database');
        socket.emit('biography-error', { message: 'User not found!' });
        return;
      }
      
      if (biography && biography.length > 200) {
        console.error('ERROR: Biography too long:', biography.length);
        socket.emit('biography-error', { message: 'Biography too long! Max 200 characters.' });
        return;
      }
      
      // Save the biography
      user.biography = biography ? biography.trim() : '';
      console.log('New biography set:', user.biography);
      
      // Save to database file
      const saveSuccess = saveUsers();
      console.log('Database save result:', saveSuccess ? 'SUCCESS' : 'FAILED');
      
      // Send success response back to client
      socket.emit('biography-saved', { 
        success: true, 
        biography: user.biography 
      });
      
      console.log('SUCCESS: Response sent to client');
      console.log('==========================================');
      
    } catch (err) {
      console.error('CRITICAL ERROR in save-biography handler:', err);
      socket.emit('biography-error', { message: 'Server error occurred!' });
    }
  });

  socket.on('login', (data) => {
    const { username, password } = data;
    
    if (!username || !password) {
      socket.emit('login-error', { message: 'Enter username and password!' });
      return;
    }
    
    const user = Object.values(users).find(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (!user) {
      socket.emit('login-error', { message: 'User not found!' });
      return;
    }
    
    if (user.password !== hashPassword(password)) {
      socket.emit('login-error', { message: 'Wrong password!' });
      return;
    }
    
    user.socketId = socket.id;
    user.partyId = null;
    
    console.log('User logged in:', user.username);
    console.log('Sending biography:', user.biography || '(empty)');
    
    socket.emit('login-success', {
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      biography: user.biography || '', // Send biography on login
      partyHistory: user.partyHistory || []
    });
  });

  socket.on('create-party', () => {
    const user = Object.values(users).find(u => u.socketId === socket.id);
    if (!user) return;
    
    const partyCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    parties[partyCode] = {
      host: socket.id,
      hostName: user.username,
      members: [socket.id],
      memberData: [{ 
        socketId: socket.id, 
        username: user.username, 
        avatar: user.avatar 
      }],
      createdAt: Date.now(),
      messages: []
    };
    
    user.partyId = partyCode;
    socket.join(partyCode);
    
    if (!user.partyHistory) {
      user.partyHistory = [];
    }
    user.partyHistory = [partyCode, ...user.partyHistory.filter(code => code !== partyCode)].slice(0, 4);
    saveUsers();
    
    socket.emit('party-created', { partyCode });
    console.log('Party created:', partyCode, 'by', user.username);
  });

  socket.on('join-party', (data) => {
    const { partyCode } = data;
    const user = Object.values(users).find(u => u.socketId === socket.id);
    
    if (!user) {
      socket.emit('error', { message: 'Login first!' });
      return;
    }
    
    if (!parties[partyCode]) {
      socket.emit('error', { message: 'Party not found!' });
      return;
    }
    
    if (parties[partyCode].members.length >= 20) {
      socket.emit('error', { message: 'Party is full!' });
      return;
    }
    
    parties[partyCode].members.push(socket.id);
    parties[partyCode].memberData.push({
      socketId: socket.id,
      username: user.username,
      avatar: user.avatar
    });
    
    user.partyId = partyCode;
    socket.join(partyCode);
    
    socket.to(partyCode).emit('player-joined', {
      username: user.username,
      avatar: user.avatar
    });
    
    const membersList = parties[partyCode].memberData.map(m => ({
      username: m.username,
      avatar: m.avatar,
      isHost: m.socketId === parties[partyCode].host
    }));
    
    socket.emit('chat-history', { 
      messages: parties[partyCode].messages 
    });
    
    socket.emit('joined-party', {
      partyCode,
      members: membersList
    });
    
    if (!user.partyHistory) {
      user.partyHistory = [];
    }
    user.partyHistory = [partyCode, ...user.partyHistory.filter(code => code !== partyCode)].slice(0, 4);
    saveUsers();
    
    console.log(user.username, 'joined party', partyCode);
  });

  socket.on('rejoin-party', (data) => {
    const { partyCode } = data;
    const user = Object.values(users).find(u => u.socketId === socket.id);
    
    if (!user) {
      socket.emit('error', { message: 'Login first!' });
      return;
    }
    
    if (!parties[partyCode]) {
      socket.emit('error', { message: 'Party no longer exists!' });
      return;
    }
    
    if (user.partyId === partyCode) {
      socket.emit('error', { message: 'Already in this party!' });
      return;
    }
    
    if (user.partyId && parties[user.partyId]) {
      parties[user.partyId].members = parties[user.partyId].members.filter(id => id !== socket.id);
      parties[user.partyId].memberData = parties[user.partyId].memberData.filter(m => m.socketId !== socket.id);
      socket.leave(user.partyId);
      socket.to(user.partyId).emit('player-left', { username: user.username });
    }
    
    parties[partyCode].members.push(socket.id);
    parties[partyCode].memberData.push({
      socketId: socket.id,
      username: user.username,
      avatar: user.avatar
    });
    
    user.partyId = partyCode;
    socket.join(partyCode);
    
    if (!user.partyHistory) {
      user.partyHistory = [];
    }
    user.partyHistory = [partyCode, ...user.partyHistory.filter(code => code !== partyCode)].slice(0, 4);
    saveUsers();
    
    socket.to(partyCode).emit('player-joined', {
      username: user.username,
      avatar: user.avatar
    });
    
    socket.emit('chat-history', { 
      messages: parties[partyCode].messages 
    });
    
    const membersList = parties[partyCode].memberData.map(m => ({
      username: m.username,
      avatar: m.avatar,
      isHost: m.socketId === parties[partyCode].host
    }));
    
    socket.emit('joined-party', {
      partyCode,
      members: membersList
    });
  });

  socket.on('leave-party', (data) => {
    const { partyCode } = data;
    const user = Object.values(users).find(u => u.socketId === socket.id);
    
    if (user && parties[partyCode]) {
      parties[partyCode].members = parties[partyCode].members.filter(id => id !== socket.id);
      parties[partyCode].memberData = parties[partyCode].memberData.filter(m => m.socketId !== socket.id);
      
      socket.to(partyCode).emit('player-left', { username: user.username });
      
      socket.leave(partyCode);
      
      user.partyId = null;
      
      if (parties[partyCode].members.length === 0) {
        delete parties[partyCode];
        console.log('Party deleted:', partyCode);
      }
      
      console.log(`${user.username} left party ${partyCode}`);
    }
  });

  socket.on('send-message', (data) => {
    const { partyCode, message } = data;
    const user = Object.values(users).find(u => u.socketId === socket.id);
    
    if (!user || !parties[partyCode]) return;
    
    const cleanMessage = message.trim();
    if (!cleanMessage || cleanMessage.length === 0) return;
    if (cleanMessage.length > 500) return;
    
    const messageData = {
      username: user.username,
      message: cleanMessage,
      timestamp: new Date().toISOString(),
      isOwn: false
    };
    
    parties[partyCode].messages.push(messageData);
    
    if (parties[partyCode].messages.length > 100) {
      parties[partyCode].messages.shift();
    }
    
    socket.to(partyCode).emit('new-message', messageData);
    socket.emit('new-message', { ...messageData, isOwn: true });
    
    console.log(`${user.username} in ${partyCode}: ${cleanMessage.substring(0, 50)}...`);
  });

  socket.on('send-reaction', (data) => {
    const { partyCode, emoji } = data;
    const user = Object.values(users).find(u => u.socketId === socket.id);
    
    if (parties[partyCode] && user) {
      socket.to(partyCode).emit('new-reaction', {
        username: user.username,
        emoji: emoji
      });
      
      socket.emit('new-reaction', {
        username: 'You',
        emoji: emoji
      });
    }
  });

  socket.on('disconnect', () => {
    const user = Object.values(users).find(u => u.socketId === socket.id);
    if (user && user.partyId && parties[user.partyId]) {
      parties[user.partyId].members = parties[user.partyId].members.filter(id => id !== socket.id);
      parties[user.partyId].memberData = parties[user.partyId].memberData.filter(m => m.socketId !== socket.id);
      
      socket.to(user.partyId).emit('player-left', { username: user.username });
      
      if (parties[user.partyId].members.length === 0) {
        delete parties[user.partyId];
      }
    }
    if (user) {
      delete user.socketId;
      delete user.partyId;
    }
  });
});

loadUsers();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});