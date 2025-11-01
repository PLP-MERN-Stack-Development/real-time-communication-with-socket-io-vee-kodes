// socket.js - Socket.io client setup

import { io } from 'socket.io-client';
import { useEffect, useState } from 'react';

// Socket.io connection URL
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

// Create socket instance
export const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

// Custom hook for using socket.io
export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [lastMessage, setLastMessage] = useState(null);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);

  // Connect to socket server
  const connect = (username) => {
    socket.connect();
    if (username) {
      socket.emit('user_join', username);
    }
  };

  // Disconnect from socket server
  const disconnect = () => {
    socket.disconnect();
  };

  // Send a message
  const sendMessage = (data) => {
    socket.emit('send_message', data);
  };

  // Send a private message
  const sendPrivateMessage = (to, message) => {
    socket.emit('private_message', { to, message });
  };

  // Share file or image
  const shareFile = (fileData) => {
    socket.emit('share_file', fileData);
  };

  // React to a message
  const reactToMessage = (messageId, reaction) => {
    socket.emit('react_message', { messageId, reaction });
  };

  // Remove reaction from a message
  const removeReaction = (messageId, reaction) => {
    socket.emit('remove_reaction', { messageId, reaction });
  };

  // Mark message as read
  const markAsRead = (messageId) => {
    socket.emit('message_read', messageId);
  };

  // Set typing status
  const setTyping = (isTyping) => {
    socket.emit('typing', isTyping);
  };

  // Socket event listeners
  useEffect(() => {
    // Connection events
    const onConnect = () => {
      setIsConnected(true);
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    // Message events
    const onReceiveMessage = (message) => {
      setLastMessage(message);
      setMessages((prev) => [...prev, message]);
    };

    const onReceiveChannelMessage = (message) => {
      setLastMessage(message);
      setMessages((prev) => [...prev, message]);
    };

    const onPrivateMessage = (message) => {
      setLastMessage(message);
      // Private messages are handled in Chat.jsx useEffect
    };

    // Task 3: File and Reaction Events
    const onFileShared = (fileMessage) => {
      setMessages((prev) => [...prev, fileMessage]);
    };

    const onUpdateReactions = ({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, reactions } : msg
        )
      );
    };

    const onMessageReadUpdate = (message) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === message.id ? { ...msg, readBy: message.readBy } : msg
        )
      );
    };

    // User events
    const onUserList = (userList) => {
      setUsers(userList);
    };

    const onUserJoined = (user) => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          system: true,
          message: `${user.username} joined the chat`,
          timestamp: new Date().toISOString(),
          type: 'join', // Add type for join styling
        },
      ]);
    };

    const onUserLeft = (user) => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          system: true,
          message: `${user.username} left the chat`,
          timestamp: new Date().toISOString(),
          type: 'leave', // Add type for greyed styling
        },
      ]);
    };

    // Typing events
    const onTypingUsers = (users) => {
      setTypingUsers(users);
    };

    // Task 4: Notifications
    const onNewMessageNotification = (notif) => {
      setNotifications((prev) => [...prev, notif]);

      // Play notification sound
      const audio = new Audio('/notification.mp3');
      audio.play().catch(e => console.log('Audio play failed:', e));

      // Browser notification
      if (Notification.permission === 'granted') {
        new Notification(notif.title, { body: notif.body });
      }
    };

    // Handle channel history
    const onChannelHistory = (history) => {
      setMessages(history);
    };

    // Register event listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('receive_message', onReceiveMessage);
    socket.on('receive_channel_message', onReceiveChannelMessage);
    socket.on('private_message', onPrivateMessage);
    socket.on('file_shared', onFileShared);
    socket.on('update_reactions', onUpdateReactions);
    socket.on('message_read_update', onMessageReadUpdate);
    socket.on('user_list', onUserList);
    socket.on('user_joined', onUserJoined);
    socket.on('user_left', onUserLeft);
    socket.on('typing_users', onTypingUsers);
    socket.on('new_message_notification', onNewMessageNotification);
    socket.on('channel_history', onChannelHistory);

    // Request browser notification permission
    if (Notification.permission !== 'granted') {
      Notification.requestPermission();
    }

    // Clean up event listeners
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('receive_message', onReceiveMessage);
      socket.off('receive_channel_message', onReceiveChannelMessage);
      socket.off('private_message', onPrivateMessage);
      socket.off('file_shared', onFileShared);
      socket.off('update_reactions', onUpdateReactions);
      socket.off('message_read_update', onMessageReadUpdate);
      socket.off('user_list', onUserList);
      socket.off('user_joined', onUserJoined);
      socket.off('user_left', onUserLeft);
      socket.off('typing_users', onTypingUsers);
      socket.off('new_message_notification', onNewMessageNotification);
      socket.off('channel_history', onChannelHistory);
    };
  }, []);

  return {
    socket,
    isConnected,
    lastMessage,
    messages,
    users,
    typingUsers,
    notifications,
    connect,
    disconnect,
    sendMessage,
    sendPrivateMessage,
    shareFile,
    reactToMessage,
    markAsRead,
    setTyping,
  };
};

export default socket;
