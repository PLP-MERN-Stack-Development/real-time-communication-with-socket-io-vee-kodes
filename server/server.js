// server.js - Main server file for Socket.io chat application

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store connected users and messages
const users = {};
const channels = {
  general: [],
  tech: [],
  random: [],
};
const privateMessages = {}; // Store private conversations between users
const typingUsers = {};

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle user joining
  socket.on('user_join', (username) => {
    users[socket.id] = {
      username,
      id: socket.id,
      online: true,
      channels: [], // No default channel - user chooses to join
    };

    io.emit('user_list', Object.values(users));
    io.emit('user_joined', { username, id: socket.id });

    // Notify other users about new user
    socket.broadcast.emit('new_message_notification', {
      title: 'User Joined',
      body: `${username} joined the chat`,
    });

    console.log(`${username} joined the chat`);
  });

  // Handle channel joining (optional feature)
  socket.on('join_channel', (channel) => {
    const user = users[socket.id];
    if (!user) return;

    if (!user.channels.includes(channel)) {
      user.channels.push(channel);
      socket.join(channel);
      // Send previous messages for that channel
      socket.emit('channel_history', channels[channel] || []);

      // Notify others in the channel that user joined
      socket.to(channel).emit('channel_user_joined', { username: user.username, id: socket.id });
    }
  });

  // Handle channel leaving
  socket.on('leave_channel', (channel) => {
    const user = users[socket.id];
    if (!user) return;

    const index = user.channels.indexOf(channel);
    if (index > -1) {
      user.channels.splice(index, 1);
      socket.leave(channel);

      // Notify others in the channel that user left
      socket.to(channel).emit('channel_user_left', { username: user.username, id: socket.id });
    }
  });

  // Handle channel messages (only for users who joined the channel)
  socket.on('send_channel_message', ({ message, channel }) => {
    const user = users[socket.id];
    if (!user || !user.channels.includes(channel)) return;

    const msgData = {
      id: Date.now(),
      sender: user.username,
      senderId: socket.id,
      message,
      timestamp: new Date().toISOString(),
      channel,
      isPrivate: false,
    };

    // Store channel messages
    if (!channels[channel]) channels[channel] = [];
    channels[channel].push(msgData);

    // Emit only to users in that channel
    io.to(channel).emit('receive_channel_message', msgData);

    // Send notification to other users in channel
    socket.to(channel).emit('new_message_notification', {
      title: `New message in ${channel}`,
      body: `${user.username}: ${message}`,
      channel,
    });
  });

  // Handle typing indicator
  socket.on('typing', (isTyping) => {
    if (users[socket.id]) {
      const username = users[socket.id].username;

      if (isTyping) {
        typingUsers[socket.id] = username;
      } else {
        delete typingUsers[socket.id];
      }

      io.emit('typing_users', Object.values(typingUsers));
    }
  });

  // Handle private messages (main core functionality)
  socket.on('private_message', ({ to, message }) => {
    const sender = users[socket.id];
    if (!sender) return;

    const recipient = Object.values(users).find(u => u.id === to);
    if (!recipient) return;

    // Create conversation key (sorted usernames for consistency)
    const conversationKey = [sender.username, recipient.username].sort().join('_');

    const msgData = {
      id: Date.now(),
      sender: sender.username,
      senderId: socket.id,
      recipient: recipient.username,
      recipientId: to,
      message,
      timestamp: new Date().toISOString(),
      isPrivate: true,
      conversationKey,
    };

    // Store private messages
    if (!privateMessages[conversationKey]) {
      privateMessages[conversationKey] = [];
    }
    privateMessages[conversationKey].push(msgData);

    // Send to both sender and recipient
    socket.to(to).emit('private_message', msgData);
    socket.emit('private_message', msgData);

    // Send notification to recipient
    socket.to(to).emit('new_message_notification', {
      title: 'New Private Message',
      body: `${sender.username}: ${message}`,
      from: sender.username,
    });
  });

  // Get private conversation history
  socket.on('get_private_history', (withUser) => {
    const user = users[socket.id];
    if (!user) return;

    const conversationKey = [user.username, withUser].sort().join('_');
    const history = privateMessages[conversationKey] || [];
    socket.emit('private_history', { withUser, messages: history });
  });

  // Handle file sharing
  socket.on('share_file', (fileData) => {
    const user = users[socket.id];
    if (!user) return;

    const fileMessage = {
      id: Date.now(),
      sender: user.username,
      senderId: socket.id,
      fileName: fileData.fileName,
      fileUrl: fileData.fileUrl,
      fileType: fileData.fileType,
      timestamp: new Date().toISOString(),
      isFile: true,
    };

    // Store in channel messages
    if (!channels[user.channel]) channels[user.channel] = [];
    channels[user.channel].push(fileMessage);

    io.to(user.channel).emit('file_shared', fileMessage);
  });

  // Handle message reactions
  socket.on('react_message', ({ messageId, reaction }) => {
    const user = users[socket.id];
    if (!user) return;

    // Find message in channels
    let messageFound = false;
    for (const channel in channels) {
      const msgIndex = channels[channel].findIndex(msg => msg.id === messageId);
      if (msgIndex !== -1) {
        const msg = channels[channel][msgIndex];
        if (!msg.reactions) msg.reactions = {};
        if (!msg.reactions[reaction]) msg.reactions[reaction] = [];
        if (!msg.reactions[reaction].includes(user.username)) {
          msg.reactions[reaction].push(user.username);
        }
        io.to(channel).emit('update_reactions', { messageId, reactions: msg.reactions });
        messageFound = true;
        break;
      }
    }

    // Also check private messages
    if (!messageFound) {
      for (const conversationKey in privateMessages) {
        const msgIndex = privateMessages[conversationKey].findIndex(msg => msg.id === messageId);
        if (msgIndex !== -1) {
          const msg = privateMessages[conversationKey][msgIndex];
          if (!msg.reactions) msg.reactions = {};
          if (!msg.reactions[reaction]) msg.reactions[reaction] = [];
          if (!msg.reactions[reaction].includes(user.username)) {
            msg.reactions[reaction].push(user.username);
          }
          // Send to both users in the conversation
          const [user1, user2] = conversationKey.split('_');
          const recipientSocket = Object.values(users).find(u => u.username === (user.username === user1 ? user2 : user1));
          if (recipientSocket) {
            socket.to(recipientSocket.id).emit('update_reactions', { messageId, reactions: msg.reactions });
          }
          socket.emit('update_reactions', { messageId, reactions: msg.reactions });
          break;
        }
      }
    }
  });

  // Handle removing reactions
  socket.on('remove_reaction', ({ messageId, reaction }) => {
    const user = users[socket.id];
    if (!user) return;

    // Find message in channels
    let messageFound = false;
    for (const channel in channels) {
      const msgIndex = channels[channel].findIndex(msg => msg.id === messageId);
      if (msgIndex !== -1) {
        const msg = channels[channel][msgIndex];
        if (msg.reactions && msg.reactions[reaction]) {
          const index = msg.reactions[reaction].indexOf(user.username);
          if (index > -1) {
            msg.reactions[reaction].splice(index, 1);
            if (msg.reactions[reaction].length === 0) {
              delete msg.reactions[reaction];
            }
          }
        }
        io.to(channel).emit('update_reactions', { messageId, reactions: msg.reactions });
        messageFound = true;
        break;
      }
    }

    // Also check private messages
    if (!messageFound) {
      for (const conversationKey in privateMessages) {
        const msgIndex = privateMessages[conversationKey].findIndex(msg => msg.id === messageId);
        if (msgIndex !== -1) {
          const msg = privateMessages[conversationKey][msgIndex];
          if (msg.reactions && msg.reactions[reaction]) {
            const index = msg.reactions[reaction].indexOf(user.username);
            if (index > -1) {
              msg.reactions[reaction].splice(index, 1);
              if (msg.reactions[reaction].length === 0) {
                delete msg.reactions[reaction];
              }
            }
          }
          // Send to both users in the conversation
          const [user1, user2] = conversationKey.split('_');
          const recipientSocket = Object.values(users).find(u => u.username === (user.username === user1 ? user2 : user1));
          if (recipientSocket) {
            socket.to(recipientSocket.id).emit('update_reactions', { messageId, reactions: msg.reactions });
          }
          socket.emit('update_reactions', { messageId, reactions: msg.reactions });
          break;
        }
      }
    }
  });

  // Handle message read receipts
  socket.on('message_read', (messageId) => {
    const user = users[socket.id];
    if (!user) return;

    // Find message and add read receipt
    for (const channel in channels) {
      const msg = channels[channel].find(m => m.id === messageId);
      if (msg) {
        if (!msg.readBy) msg.readBy = [];
        if (!msg.readBy.includes(user.username)) {
          msg.readBy.push(user.username);
        }
        io.to(channel).emit('message_read_update', msg);
        break;
      }
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      user.online = false; // mark user offline
      io.emit('user_left', { username: user.username, id: socket.id });

      // Notify other users about user leaving
      socket.broadcast.emit('new_message_notification', {
        title: 'User Left',
        body: `${user.username} left the chat`,
      });

      console.log(`${user.username} left the chat`);

      delete typingUsers[socket.id];
      delete users[socket.id];
    }

    io.emit('user_list', Object.values(users));
    io.emit('typing_users', Object.values(typingUsers));
  });
});

// API routes
app.get('/api/channels', (req, res) => {
  res.json(Object.keys(channels));
});

app.get('/api/users', (req, res) => {
  res.json(Object.values(users));
});

// File upload route
const multer = require('multer');
const upload = multer({ dest: 'public/uploads/' });

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({
    fileName: req.file.originalname,
    fileUrl,
    fileType: req.file.mimetype,
  });
});

// Root route
app.get('/', (req, res) => {
  res.send('Socket.io Chat Server is running');
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };
