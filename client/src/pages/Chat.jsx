// Chat.jsx
import { useState, useRef, useEffect } from "react";
import { useSocket } from "../socket/socket";
import { useNavigate } from "react-router-dom";


const Chat = () => {
  const {
    socket,
    messages,
    users,
    typingUsers,
    sendMessage,
    sendPrivateMessage,
    shareFile,
    reactToMessage,
    removeReaction,
    markAsRead,
    setTyping,
    disconnect,
  } = useSocket();

  const navigate = useNavigate();

  const [message, setMessage] = useState("");
  const [recipient, setRecipient] = useState("all");
  const [selectedChannel, setSelectedChannel] = useState(null); 
  const [joinedChannels, setJoinedChannels] = useState([]);
  const [privateChats, setPrivateChats] = useState({});
  const [activeChat, setActiveChat] = useState("users"); // "users", "channel:{name}", "dm:{username}"
  const [unreadCounts, setUnreadCounts] = useState({});
  const [channelUnreadCounts, setChannelUnreadCounts] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const fileInputRef = useRef(null);
  const username = localStorage.getItem("username");

  // Debug logging to ensure each browser has its own username
  useEffect(() => {
    console.log(`Chat component mounted for user: ${username}`);
    console.log(`Current activeChat: ${activeChat}`);
  }, [username, activeChat]);

  let typingTimeout;

  const handleSend = (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    if (activeChat.startsWith("dm:")) {
      const dmUser = activeChat.split(":")[1];
      const recipientUser = users.find(u => u.username === dmUser);
      if (recipientUser) {
        sendPrivateMessage(recipientUser.id, message);
      }
    } else if (activeChat.startsWith("channel:")) {
      const channel = activeChat.split(":")[1];
      socket.emit('send_channel_message', { message, channel });
    }
    setMessage("");
  };

  const startDM = (withUser) => {
    setActiveChat(`dm:${withUser}`);
    socket.emit('get_private_history', withUser);
    // Reset unread count when opening DM
    setUnreadCounts(prev => ({ ...prev, [withUser]: 0 }));
  };

  const joinChannel = (channel) => {
    if (!joinedChannels.includes(channel)) {
      setJoinedChannels(prev => [...prev, channel]);
      socket.emit('join_channel', channel);
      // Reset unread count when joining
      setChannelUnreadCounts(prev => ({ ...prev, [channel]: 0 }));
    }
    setActiveChat(`channel:${channel}`);
  };

  const leaveChannel = (channel) => {
    setJoinedChannels(prev => prev.filter(c => c !== channel));
    socket.emit('leave_channel', channel);
    if (activeChat === `channel:${channel}`) {
      setActiveChat("users");
    }
  };

  const handleChannelChange = (channel) => {
    setSelectedChannel(channel);
    // Emit join_channel event
    socket.emit('join_channel', channel);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:5000/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      shareFile({
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        fileType: data.fileType,
      });
    } catch (error) {
      console.error('File upload failed:', error);
    }
  };

  const handleReaction = (messageId, reaction) => {
    // Toggle reaction - if user already reacted, remove it; otherwise add it
    const currentMessages = getCurrentMessages();
    const msg = currentMessages.find(m => m.id === messageId);
    const hasReacted = msg?.reactions?.[reaction]?.includes(username);

    if (hasReacted) {
      // Remove reaction
      removeReaction(messageId, reaction);
    } else {
      // Add reaction
      reactToMessage(messageId, reaction);
    }
  };

  const handleMarkAsRead = (messageId) => {
    markAsRead(messageId);
  };

  // Get current chat messages
  const getCurrentMessages = () => {
    if (activeChat.startsWith("dm:")) {
      const dmUser = activeChat.split(":")[1];
      return privateChats[dmUser] || [];
    } else if (activeChat.startsWith("channel:")) {
      const channel = activeChat.split(":")[1];
      return messages.filter(msg => msg.channel === channel);
    }
    return [];
  };

  const currentMessages = getCurrentMessages();
  const filteredMessages = currentMessages.filter(msg =>
    msg.message?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    msg.sender?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleLogout = () => {
    disconnect();
    localStorage.removeItem("username");
    navigate("/");
  };

  // Handle private message received and unread counts
  useEffect(() => {
    const handlePrivateMessage = (msg) => {
      const otherUser = msg.sender === username ? msg.recipient : msg.sender;
      setPrivateChats(prev => ({
        ...prev,
        [otherUser]: [...(prev[otherUser] || []), msg]
      }));

      // Increment unread count if not currently viewing this DM
      if (activeChat !== `dm:${otherUser}`) {
        setUnreadCounts(prev => ({
          ...prev,
          [otherUser]: (prev[otherUser] || 0) + 1
        }));
      }
    };

    const handlePrivateHistory = ({ withUser, messages: historyMessages }) => {
      setPrivateChats(prev => ({
        ...prev,
        [withUser]: historyMessages
      }));
    };

    const handleChannelMessage = (msg) => {
      // Increment unread count if not currently viewing this channel
      if (activeChat !== `channel:${msg.channel}`) {
        setChannelUnreadCounts(prev => ({
          ...prev,
          [msg.channel]: (prev[msg.channel] || 0) + 1
        }));
      }
    };

    const handleChannelUserJoined = (user) => {
      // Add join notification to current channel if viewing it
      if (activeChat.startsWith("channel:")) {
        const channel = activeChat.split(":")[1];
        setMessages(prev => [
          ...prev,
          {
            id: Date.now(),
            system: true,
            message: `${user.username} joined #${channel}`,
            timestamp: new Date().toISOString(),
            type: 'join',
            channel: channel
          },
        ]);
      }
    };

    const handleChannelUserLeft = (user) => {
      // Add leave notification to current channel if viewing it
      if (activeChat.startsWith("channel:")) {
        const channel = activeChat.split(":")[1];
        setMessages(prev => [
          ...prev,
          {
            id: Date.now(),
            system: true,
            message: `${user.username} left #${channel}`,
            timestamp: new Date().toISOString(),
            type: 'leave',
            channel: channel
          },
        ]);
      }
    };

    socket.on('private_message', handlePrivateMessage);
    socket.on('private_history', handlePrivateHistory);
    socket.on('receive_channel_message', handleChannelMessage);
    socket.on('channel_user_joined', handleChannelUserJoined);
    socket.on('channel_user_left', handleChannelUserLeft);

    return () => {
      socket.off('private_message', handlePrivateMessage);
      socket.off('private_history', handlePrivateHistory);
      socket.off('receive_channel_message', handleChannelMessage);
      socket.off('channel_user_joined', handleChannelUserJoined);
      socket.off('channel_user_left', handleChannelUserLeft);
    };
  }, [username, activeChat]);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setMessage(value);
    setTyping(value.length > 0);

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => setTyping(false), 1500);
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-100 p-2 md:p-4 gap-2 md:gap-4">
      {/* SIDEBAR: Users and Channels */}
      <div className="w-full lg:w-80 bg-white rounded-xl shadow-md p-3 md:p-4">
        <h3 className="font-semibold mb-3 text-gray-800 text-sm md:text-base">Chat</h3>
        <div className="space-y-2 mb-4">
          {users
            .filter(u => u.username !== username)
            .map(user => (
              <button
                key={user.id}
                onClick={() => startDM(user.username)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  activeChat === `dm:${user.username}`
                    ? 'bg-blue-100 border-l-4 border-blue-500'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${user.online ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                    <span className="font-medium">{user.username}</span>
                  </div>
                  {unreadCounts[user.username] > 0 && (
                    <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full min-w-5 text-center">
                      {unreadCounts[user.username]}
                    </span>
                  )}
                </div>
              </button>
            ))}
        </div>

        <h3 className="font-semibold mb-3 text-gray-800 text-sm md:text-base">Channels</h3>
        <div className="space-y-2">
          {['general', 'tech', 'blog'].map(channel => {
            const isJoined = joinedChannels.includes(channel);
            return (
              <div key={channel} className="flex items-center gap-2">
                <button
                  onClick={() => isJoined ? setActiveChat(`channel:${channel}`) : joinChannel(channel)}
                  className={`flex-1 text-left p-3 rounded-lg transition-colors ${
                    activeChat === `channel:${channel}`
                      ? 'bg-blue-100 border-l-4 border-blue-500'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">#</span>
                      <span className="font-medium">{channel}</span>
                      {isJoined && <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">Joined</span>}
                    </div>
                    {channelUnreadCounts[channel] > 0 && (
                      <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full min-w-5 text-center">
                        {channelUnreadCounts[channel]}
                      </span>
                    )}
                  </div>
                </button>
                {isJoined && (
                  <button
                    onClick={() => leaveChannel(channel)}
                    className="text-red-500 hover:text-red-700 px-3 py-1 rounded hover:bg-red-50 transition-colors"
                    title="Leave channel"
                  >
                    Leave
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT: Chat Section */}
      <div className="flex flex-col flex-1 bg-white rounded-xl shadow-md p-3 md:p-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
          <h2 className="text-base md:text-lg font-semibold text-gray-800">
            {username && `Welcome, ${username}`}
            {activeChat.startsWith("dm:") && ` - DM with ${activeChat.split(":")[1]}`}
            {activeChat.startsWith("channel:") && ` - Channel #${activeChat.split(":")[1]}`}
          </h2>
          <button
            onClick={handleLogout}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors self-start sm:self-auto"
          >
            Logout
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search messages..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-2 border rounded mb-2"
        />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto border rounded-lg p-2 md:p-3 bg-gray-50 mb-2 min-h-0 max-h-96 md:max-h-none">
          {activeChat === "users" ? (
            <div className="text-center text-gray-500 mt-8">
              <p className="text-lg mb-2">👋 Welcome to the Chat App!</p>
              <p>Select a user to start a private conversation or join a channel.</p>
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="text-center text-gray-500 mt-8">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            filteredMessages.map((msg) => (
              <div key={msg.id} className="mb-2 p-1 md:p-2 border-b border-gray-200">
                {msg.system ? (
                  <span className={`text-gray-400 italic ${
                    msg.type === 'leave' ? 'text-gray-500 font-medium' :
                    msg.type === 'join' ? 'text-green-600 font-medium' : ''
                  }`}>
                    {msg.message}
                  </span>
                ) : msg.isFile ? (
                  <div>
                    <span className="font-bold text-blue-600">{msg.sender}:</span>{" "}
                    <a href={`http://localhost:5000${msg.fileUrl}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
                      {msg.fileName}
                    </a>
                    <span className="text-xs text-gray-400 ml-2">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className={`font-bold ${msg.sender === username ? "text-blue-600" : "text-gray-900"}`}>
                      {msg.sender === username ? "You" : msg.sender}:
                    </span>{" "}
                    <span>{msg.message}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </span>
                    {msg.readBy && msg.readBy.length > 0 && (
                      <span className="text-xs text-green-500 ml-2">
                        Read by: {msg.readBy.join(', ')}
                      </span>
                    )}
                    {/* Reactions */}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {msg.reactions && Object.entries(msg.reactions).map(([reaction, users]) => (
                        <button
                          key={reaction}
                          onClick={() => handleReaction(msg.id, reaction)}
                          className={`text-xs px-2 py-1 rounded transition-colors ${
                            users.includes(username)
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                          }`}
                          title={`Reacted by: ${users.join(', ')}`}
                        >
                          {reaction} {users.length}
                        </button>
                      ))}
                      {/* Quick reaction buttons */}
                      <div className="flex gap-1 ml-2">
                        {['👍', '❤️', '😂', '😮', '😢', '😡'].map(emoji => (
                          <button
                            key={emoji}
                            onClick={() => handleReaction(msg.id, emoji)}
                            className={`text-xs px-1 py-0.5 rounded hover:bg-gray-200 transition-colors ${
                              msg.reactions?.[emoji]?.includes(username) ? 'bg-blue-200' : ''
                            }`}
                            title="Add reaction"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => handleMarkAsRead(msg.id)}
                        className="text-xs bg-blue-200 hover:bg-blue-300 px-2 py-1 rounded ml-2 transition-colors"
                      >
                        Mark Read
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <p className="text-sm text-gray-500 mb-1">
            {typingUsers.join(", ")}{" "}
            {typingUsers.length > 1 ? "are" : "is"} typing...
          </p>
        )}

        {/* Message input - only show when a chat is active */}
        {activeChat !== "users" && (
          <form onSubmit={handleSend} className="flex flex-col gap-2">
            <input
              type="text"
              value={message}
              onChange={handleInputChange}
              placeholder={`Message ${activeChat.startsWith("dm:") ? activeChat.split(":")[1] : "#" + activeChat.split(":")[1]}...`}
              className="w-full p-3 border rounded text-sm md:text-base"
            />

            <div className="flex gap-2 justify-end">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current.click()}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors"
                title="Share file"
              >
                📎 File
              </button>

              <button
                type="submit"
                className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 transition-colors"
              >
                Send
              </button>
            </div>
          </form>
        )}
      </div>

    </div>
  );
};

export default Chat;
