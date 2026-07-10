import React, { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { FaSearch, FaArrowLeft } from "react-icons/fa";
import { API_BASE_URL } from "../config";
import "../styles/ChatApp.css";

const BACKEND_URL = API_BASE_URL;
const AVATAR_COLOR_COUNT = 8;
const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

// ---- Pure helpers (no component state) ------------------------------

// Consistent, good-looking avatar color per username instead of a random one.
function getAvatarColorClass(name) {
  if (!name) return "avatar-0";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `avatar-${Math.abs(hash) % AVATAR_COLOR_COUNT}`;
}

function isSameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function formatDayLabel(dateInput) {
  const date = new Date(dateInput);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function formatTime(dateInput) {
  return new Date(dateInput).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isPersistedMessageId(id) {
  return typeof id === "string" && OBJECT_ID_REGEX.test(id);
}

function isSameUser(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function ChatApp() {
  const navigate = useNavigate();

  const [socket, setSocket] = useState(null);
  const [message, setMessage] = useState("");
  // Per-conversation message cache: { [conversationKey]: { items, hasMore, loading, loaded } }.
  // Replaces the old single "load everything up front" array — each
  // conversation's history is fetched (and paginated) only once it's
  // actually opened.
  const [conversationCache, setConversationCache] = useState({});
  // Lightweight last-message-per-conversation summary for the sidebar,
  // populated separately from full history — see getConversationPreviews.
  const [previews, setPreviews] = useState({});
  const [typingUsers, setTypingUsers] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("all");
  const [username, setUsername] = useState("");
  const [userStatus, setUserStatus] = useState({});
  const [showPicker, setShowPicker] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState("");
  const [onlineUsers, setOnlineUsers] = useState({});
  const [previewMedia, setPreviewMedia] = useState(null);
  const [previewType, setPreviewType] = useState("");
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [unreadCounts, setUnreadCounts] = useState({});
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [swipedContactKey, setSwipedContactKey] = useState(null);
  const [contactMenuFor, setContactMenuFor] = useState(null);
  const [infoModalFor, setInfoModalFor] = useState(null);
  const [showArchivedList, setShowArchivedList] = useState(false);
  const [archivedChats, setArchivedChats] = useState({});
  const [mutedChats, setMutedChats] = useState({});
  const [lockedChats, setLockedChats] = useState({});
  const [favoriteChats, setFavoriteChats] = useState({});
  const [deletedChats, setDeletedChats] = useState({});
  // The message currently being replied to (shows a bar above the composer).
  const [replyingTo, setReplyingTo] = useState(null);
  // Which message is being edited inline, and its in-progress text.
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState("");
  // Which message's quick-reaction palette is currently open.
  const [reactionPickerFor, setReactionPickerFor] = useState(null);
  // Bumped only when the open conversation should actually scroll to the
  // bottom (new message arrived/sent, or a conversation was just opened) —
  // kept separate from "messages changed" so loading OLDER messages
  // (which prepends to the top) never yanks the view back down.
  const [scrollTick, setScrollTick] = useState(0);

  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const selectedUserRef = useRef(selectedUser);
  const pendingOlderLoadRef = useRef(false);
  const prevScrollHeightRef = useRef(0);
  const touchStartXRef = useRef(null);
  const touchDeltaXRef = useRef(0);
  const { logout } = useAuth();

  // Keep a ref in sync so the socket handlers (registered once on mount)
  // always know which conversation is currently open, without needing to
  // re-subscribe every time the user switches contacts.
  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  // Patches a single message wherever it lives in the cache — reactions and
  // edits can arrive for a message in any conversation, not just the one
  // currently open, so this scans every cached conversation rather than
  // assuming it's always the active one.
  const updateMessageInCache = (messageId, updater) => {
    setConversationCache((prev) => {
      const updated = {};
      for (const key of Object.keys(prev)) {
        updated[key] = {
          ...prev[key],
          items: prev[key].items.map((m) => (m._id === messageId ? updater(m) : m)),
        };
      }
      return updated;
    });
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedName = localStorage.getItem("username");

    if (!token || !storedName) {
      navigate("/login");
      return;
    }

    setUsername(storedName);

    const newSocket = io(BACKEND_URL, { query: { token } });
    setSocket(newSocket);

    // If the token is invalid or stale (e.g. the server was restarted with
    // a different JWT_SECRET after this token was issued), Socket.IO's
    // auth middleware rejects the handshake. Without this, that failure
    // was silent — the app just never connected. Now it clears the bad
    // token and sends the user back to log in for a fresh one.
    newSocket.on("connect_error", (err) => {
      console.error("Socket connection failed:", err.message);
      if (err.message === "Authentication error") {
        newSocket.disconnect(); // stop it from retrying with the same bad token
        localStorage.removeItem("token");
        navigate("/login");
      }
    });

    newSocket.emit("user-login");
    newSocket.emit("join"); // server derives identity from the JWT, not this call

    fetch(`${BACKEND_URL}/api/users/all`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) {
          navigate("/login");
          return [];
        }
        return res.json();
      })
      .then((data) => {
        const filtered = data.filter((u) => u.username !== storedName);
        setUsers(filtered);
      });

    newSocket.emit("getConversationPreviews");
    newSocket.emit("getMessages", { conversationKey: "all" });

    newSocket.on("chatMessage", (data) => {
      const { sender, receiver } = data;
      if (
        receiver === "all" ||
        sender === storedName ||
        receiver === storedName
      ) {
        const convoKey =
          receiver === "all" ? "all" : sender === storedName ? receiver : sender;

        // Always update the sidebar preview, even for conversations that
        // haven't been opened yet.
        setPreviews((prev) => ({
          ...prev,
          [convoKey]: {
            message: data.message,
            media: data.media,
            sender: data.sender,
            createdAt: data.createdAt,
          },
        }));

        // Only append to the full message list if that conversation has
        // actually been loaded — otherwise there's nothing to append to,
        // and it'll load fresh (already up to date) the first time it's opened.
        setConversationCache((prev) => {
          const existing = prev[convoKey];
          if (!existing?.loaded) return prev;
          return {
            ...prev,
            [convoKey]: { ...existing, items: [...existing.items, data] },
          };
        });

        if (convoKey === selectedUserRef.current) {
          setScrollTick((t) => t + 1);
        }

        // Bump the unread badge for whichever conversation this belongs to,
        // unless that conversation is the one currently open on screen.
        if (sender !== storedName && convoKey !== selectedUserRef.current) {
          setUnreadCounts((prev) => ({
            ...prev,
            [convoKey]: (prev[convoKey] || 0) + 1,
          }));
        }
      }
    });

    newSocket.on("previousMessages", ({ conversationKey, messages: page, hasMore }) => {
      setConversationCache((prev) => {
        const existing = prev[conversationKey];
        // If this conversation was already loaded, this response is an
        // older page requested via "Load earlier messages" — prepend it.
        // Otherwise it's the first page — set it directly.
        const isContinuation = Boolean(existing?.loaded);
        const items = isContinuation ? [...page, ...existing.items] : page;
        return {
          ...prev,
          [conversationKey]: { items, hasMore, loading: false, loaded: true },
        };
      });

      if (conversationKey === selectedUserRef.current) {
        if (pendingOlderLoadRef.current) {
          // Restore scroll position so prepending older messages doesn't
          // yank the view — see loadOlderMessages for where this is set.
          pendingOlderLoadRef.current = false;
          requestAnimationFrame(() => {
            const container = messagesContainerRef.current;
            if (container) {
              container.scrollTop = container.scrollHeight - prevScrollHeightRef.current;
            }
          });
        } else {
          setScrollTick((t) => t + 1);
        }
      }
    });

    newSocket.on("conversationPreviews", (data) => {
      setPreviews((prev) => ({ ...prev, ...data }));
    });

    newSocket.on("messageReactionUpdated", ({ messageId, reactions }) => {
      updateMessageInCache(messageId, (m) => ({ ...m, reactions }));
    });

    newSocket.on("messageEdited", ({ messageId, message, edited }) => {
      updateMessageInCache(messageId, (m) => ({ ...m, message, edited }));
    });

    newSocket.on("initial-user-status", setUserStatus);

    newSocket.on("user-status", (data) => {
      setUserStatus((prev) => ({
        ...prev,
        [data.userId]: data.status,
      }));
    });

    newSocket.on("onlineUsers", (users) => {
      setOnlineUsers(users);
    });

    newSocket.on("user-typing", ({ username: typingName }) => {
      if (typingName !== storedName) {
        setTypingUsers([typingName]);
      }
    });

    newSocket.on("stop-typing", ({ username: typingName }) => {
      if (typingName !== storedName) {
        setTypingUsers([]);
      }
    });

    return () => newSocket.disconnect();
  }, [navigate]);

  // Fixed a pre-existing event name mismatch here: the server has always
  // broadcast "messageDeleted" (singular), but this listener was subscribed
  // to "messagesDeleted" (plural) — so a delete never actually removed the
  // message from other people's screens in real time, only your own local
  // optimistic state until you reloaded.
  useEffect(() => {
    if (!socket) return;

    socket.on("messageDeleted", ({ ids }) => {
      setConversationCache((prev) => {
        const updated = {};
        for (const key of Object.keys(prev)) {
          updated[key] = {
            ...prev[key],
            items: prev[key].items.filter((msg) => !ids.includes(msg._id)),
          };
        }
        return updated;
      });
    });

    return () => socket.off("messageDeleted");
  }, [socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [scrollTick, typingUsers]);

  //----------------------inptchange-----------------------
  const handleInputChange = (e) => {
    const text = e.target.value;
    setMessage(text);

    if (text !== "") {
      socket?.emit("typing", { username });

      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket?.emit("stop-typing", { username });
      }, 1000);
    } else {
      socket?.emit("stop-typing", { username });
    }
  };

  //--------------handlefileupload------------------
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const type = file.type.split("/")[0]; // image, video, audio
    const localUrl = URL.createObjectURL(file);

    setPreviewType(type);
    setPreviewMedia(localUrl);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "chatapp_media_upload");

    try {
      const response = await fetch(
        "https://api.cloudinary.com/v1_1/dbhafx1li/auto/upload",
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();
      setMediaUrl(data.secure_url);
      setMediaType(type);
    } catch (error) {
      console.error("Upload error:", error);
    }
  };

  //-------------------deleteMessage-------------------
  const handleDeleteMessages = () => {
    if (selectedMessages.length === 0) return;

    const selectedSet = new Set(selectedMessages);
    setConversationCache((prev) => {
      const existing = prev[selectedUser];
      if (!existing) return prev;

      return {
        ...prev,
        [selectedUser]: {
          ...existing,
          items: existing.items.filter(
            (msg, index) => !selectedSet.has(msg._id || msg.id || `local-${index}`)
          ),
        },
      };
    });

    const persistedIds = selectedMessages.filter(isPersistedMessageId);
    if (socket && persistedIds.length > 0) {
      socket.emit("deleteMessages", { ids: persistedIds });
    }

    setSelectedMessages([]);
  };

  // ------------------handlesend---------------------
  const handleSend = () => {
    if ((message.trim() || mediaUrl) && socket) {
      const newMsg = {
        _id: Date.now().toString(), // temporary id, replaced once the server echoes back
        message: message.trim(),
        sender: username,
        receiver: selectedUser,
        to: selectedUser,
        media: mediaUrl,
        mediaType: mediaType,
        createdAt: new Date().toISOString(), // shown immediately, before the round-trip
        replyTo: replyingTo,
        reactions: [],
        edited: false,
      };

      socket.emit("chatMessage", newMsg);

      setConversationCache((prev) => {
        const existing = prev[selectedUser] || {
          items: [],
          hasMore: false,
          loading: false,
          loaded: true,
        };
        return {
          ...prev,
          [selectedUser]: { ...existing, items: [...existing.items, newMsg] },
        };
      });
      setPreviews((prev) => ({
        ...prev,
        [selectedUser]: {
          message: newMsg.message,
          media: newMsg.media,
          sender: username,
          createdAt: newMsg.createdAt,
        },
      }));
      setScrollTick((t) => t + 1);

      setMessage("");
      setMediaUrl("");
      setMediaType("");
      setPreviewMedia(null);
      setShowPicker(false);
      setReplyingTo(null);
    }
  };

  // ----------------reactions, replies, edit, single delete -----------------
  const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

  const handleReact = (messageId, emoji) => {
    socket?.emit("reactToMessage", { messageId, emoji });
    setReactionPickerFor(null);
  };

  const handleStartReply = (msg) => {
    setReplyingTo({
      messageId: msg._id,
      sender: msg.sender,
      message: msg.message,
      mediaType: msg.mediaType,
    });
  };

  const handleStartEdit = (msg) => {
    setEditingMessageId(msg._id);
    setEditingText(msg.message);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText("");
  };

  const handleSaveEdit = () => {
    if (!editingMessageId) return;
    const trimmed = editingText.trim();
    if (!trimmed) return;

    socket?.emit("editMessage", { messageId: editingMessageId, newText: trimmed });
    // Optimistic update so it feels instant — the server's own broadcast
    // (which includes the sender) will confirm it moments later.
    updateMessageInCache(editingMessageId, (m) => ({ ...m, message: trimmed, edited: true }));
    handleCancelEdit();
  };

  const handleDeleteSingle = (messageId) => {
    setConversationCache((prev) => {
      const existing = prev[selectedUser];
      if (!existing) return prev;
      return {
        ...prev,
        [selectedUser]: {
          ...existing,
          items: existing.items.filter((msg) => (msg._id || msg.id) !== messageId),
        },
      };
    });

    if (isPersistedMessageId(messageId)) {
      socket?.emit("deleteMessages", { ids: [messageId] });
    }
  };

  //--------------------handlelogout------------------
  const handleLogout = () => {
    if (socket) {
      socket.disconnect();
    }
    logout();
    setTimeout(() => navigate("/login"), 0);
  };

  // ----------------emojipicker-----------------
  const toggleEmojiPicker = () => setShowPicker(!showPicker);

  const addEmoji = (emoji) => {
    setMessage((prev) => prev + emoji.native);
  };

  // ----------------contact selection (desktop + mobile slide) -----------------
  const handleSelectUser = (key) => {
    setSelectedUser(key);
    setUnreadCounts((prev) => ({ ...prev, [key]: 0 }));
    setMobileChatOpen(true);
    setSwipedContactKey(null);
    setContactMenuFor(null);

    // Fetch the first page only the first time a conversation is opened —
    // after that it's already cached, so switching back to it is instant
    // and doesn't re-hit the server.
    if (!conversationCache[key]?.loaded) {
      setConversationCache((prev) => ({
        ...prev,
        [key]: prev[key] || { items: [], hasMore: false, loading: true, loaded: false },
      }));
      socket?.emit("getMessages", { conversationKey: key });
    }
  };

  const handleContactTouchStart = (e) => {
    if (!e.touches || e.touches.length !== 1) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchDeltaXRef.current = 0;
  };

  const handleContactTouchMove = (e) => {
    if (touchStartXRef.current == null || !e.touches || e.touches.length !== 1) return;
    touchDeltaXRef.current = e.touches[0].clientX - touchStartXRef.current;
  };

  const handleContactTouchEnd = (conversationKey) => {
    const delta = touchDeltaXRef.current;
    touchStartXRef.current = null;
    touchDeltaXRef.current = 0;

    if (delta < -45) {
      setSwipedContactKey(conversationKey);
      return;
    }
    if (delta > 30 && swipedContactKey === conversationKey) {
      setSwipedContactKey(null);
    }
  };

  const setFlagForConversation = (setter, conversationKey) => {
    setter((prev) => ({ ...prev, [conversationKey]: !prev[conversationKey] }));
  };

  const clearChatByKey = (conversationKey) => {
    setConversationCache((prev) => ({
      ...prev,
      [conversationKey]: {
        items: [],
        hasMore: false,
        loading: false,
        loaded: true,
      },
    }));
    setPreviews((prev) => {
      const next = { ...prev };
      delete next[conversationKey];
      return next;
    });
    setUnreadCounts((prev) => ({ ...prev, [conversationKey]: 0 }));
    if (selectedUser === conversationKey) {
      setSelectedMessages([]);
    }
  };

  const deleteChatByKey = (conversationKey) => {
    clearChatByKey(conversationKey);
    setDeletedChats((prev) => ({ ...prev, [conversationKey]: true }));
    setArchivedChats((prev) => ({ ...prev, [conversationKey]: false }));
    if (selectedUser === conversationKey) {
      setSelectedUser("all");
      setMobileChatOpen(false);
    }
  };

  const archiveChatByKey = (conversationKey) => {
    setArchivedChats((prev) => ({ ...prev, [conversationKey]: true }));
    setSwipedContactKey(null);
    if (selectedUser === conversationKey) {
      setSelectedUser("all");
      setMobileChatOpen(false);
    }
  };

  const handleMenuAction = (action, conversationKey, usernameLabel) => {
    switch (action) {
      case "mute":
        setFlagForConversation(setMutedChats, conversationKey);
        break;
      case "contact-info":
        setInfoModalFor(conversationKey);
        break;
      case "lock-chat":
        setFlagForConversation(setLockedChats, conversationKey);
        break;
      case "add-to-fav":
        setFlagForConversation(setFavoriteChats, conversationKey);
        break;
      case "clear-chat":
        clearChatByKey(conversationKey);
        break;
      case "delete-chat":
        deleteChatByKey(conversationKey);
        break;
      default:
        break;
    }
    setContactMenuFor(null);
    setSwipedContactKey(null);
  };

  // ----------------pagination: load the next page of OLDER messages -----------------
  const loadOlderMessages = () => {
    const cache = conversationCache[selectedUser];
    if (!cache || cache.loading || !cache.hasMore || cache.items.length === 0) return;

    const oldest = cache.items[0];
    const container = messagesContainerRef.current;

    // Remember how tall the message list was before we prepend older
    // content, so we can restore the same visual scroll position once the
    // new (taller) list renders — otherwise the view jumps disorientingly.
    prevScrollHeightRef.current = container ? container.scrollHeight : 0;
    pendingOlderLoadRef.current = true;

    setConversationCache((prev) => ({
      ...prev,
      [selectedUser]: { ...prev[selectedUser], loading: true },
    }));

    socket?.emit("getMessages", {
      conversationKey: selectedUser,
      before: oldest.createdAt || oldest.timestamp,
    });
  };

  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const allContacts = [
    {
      key: "all",
      label: "Global Chat",
      preview: previews.all,
      previewFallback: `${Object.keys(onlineUsers).length} online`,
      isOnline: true,
      avatarType: "global",
    },
    ...filteredUsers.map((user) => ({
      key: user.username,
      label: user.username,
      preview: previews[user.username],
      previewFallback: "No messages yet",
      isOnline: userStatus[user.username] === "online",
      avatarType: "user",
    })),
  ].filter((contact) => !deletedChats[contact.key]);

  const visibleContacts = allContacts.filter((contact) =>
    showArchivedList ? Boolean(archivedChats[contact.key]) : !archivedChats[contact.key]
  );
  const archivedCount = allContacts.filter((contact) => archivedChats[contact.key]).length;

  const currentCache = conversationCache[selectedUser];
  const messages = currentCache?.items || [];

  const selectedChatLabel =
    selectedUser === "all" ? "Global Chat" : selectedUser;
  const selectedChatStatus =
    selectedUser === "all"
      ? `${Object.keys(onlineUsers).length} online now`
      : userStatus[selectedUser] || "offline";
  const infoContact = allContacts.find((contact) => contact.key === infoModalFor) || null;

  // Build the message list with date dividers + consecutive-message grouping
  // computed inline (cheap for the message volumes this app deals with).
  let lastDateLabel = null;
  let lastSender = null;
  const renderedMessages = [];

  messages.forEach((msg, index) => {
    const id = msg._id || msg.id || `local-${index}`;
    const mine = isSameUser(msg.sender, username);
    const timestamp = msg.createdAt || msg.timestamp || Date.now();
    const dayLabel = formatDayLabel(timestamp);
    const isGrouped = !mine && lastSender === msg.sender && lastDateLabel === dayLabel;

    if (dayLabel !== lastDateLabel) {
      renderedMessages.push(
        <div className="wa-date-divider" key={`divider-${dayLabel}-${index}`}>
          <span>{dayLabel}</span>
        </div>
      );
    }

    const isEditing = editingMessageId === id;

    renderedMessages.push(
      <article
        key={id}
        className={`wa-message-row ${mine ? "mine" : "theirs"} ${isGrouped ? "grouped" : ""}`}
      >

        <label className="wa-select-msg" title="Select message">
          <input
            type="checkbox"
            checked={selectedMessages.includes(id)}
            onChange={() => {
              setSelectedMessages((prev) =>
                prev.includes(id)
                  ? prev.filter((msgId) => msgId !== id)
                  : [...prev, id]
              );
            }}
          />
        </label>

        {/* Hover toolbar: react, reply, and (mine-only) edit/delete */}
        <div className="wa-msg-actions">
          <button title="React" onClick={() => setReactionPickerFor(reactionPickerFor === id ? null : id)}>
            😊
          </button>
          <button title="Reply" onClick={() => handleStartReply(msg)}>
            ↩️
          </button>
          {mine && !msg.media && (
            <button title="Edit" onClick={() => handleStartEdit(msg)}>
              ✏️
            </button>
          )}
          {mine && (
            <button title="Delete for everyone" onClick={() => handleDeleteSingle(id)}>
              🗑️
            </button>
          )}
        </div>

        {reactionPickerFor === id && (
          <div className="wa-quick-reactions">
            {QUICK_REACTIONS.map((emoji) => (
              <button key={emoji} onClick={() => handleReact(id, emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div className="wa-message-bubble">
          {selectedUser === "all" && !mine && !isGrouped && (
            <div className="wa-message-sender">{msg.sender}</div>
          )}

          {msg.replyTo && (
            <div className="wa-reply-preview">
              <span className="wa-reply-sender">{msg.replyTo.sender}</span>
              <span className="wa-reply-snippet">
                {msg.replyTo.message || (msg.replyTo.mediaType ? "📎 Attachment" : "")}
              </span>
            </div>
          )}

          {isEditing ? (
            <div className="wa-edit-box">
              <textarea
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                rows={2}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveEdit();
                  }
                  if (e.key === "Escape") handleCancelEdit();
                }}
              />
              <div className="wa-edit-actions">
                <button className="wa-edit-cancel" onClick={handleCancelEdit}>
                  Cancel
                </button>
                <button className="wa-edit-save" onClick={handleSaveEdit}>
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              {msg.message && <p>{msg.message}</p>}

              {msg.media && (
                <div className="wa-media">
                  {msg.mediaType === "image" ? (
                    <img src={msg.media} alt="uploaded" />
                  ) : msg.mediaType === "video" ? (
                    <video controls src={msg.media} />
                  ) : msg.mediaType === "audio" ? (
                    <audio controls src={msg.media}></audio>
                  ) : (
                    <a href={msg.media} target="_blank" rel="noreferrer">
                      View File
                    </a>
                  )}
                </div>
              )}

              {msg.reactions && msg.reactions.length > 0 && (
                <div className="wa-reactions">
                  {Object.entries(
                    msg.reactions.reduce((acc, r) => {
                      (acc[r.emoji] ||= []).push(r.username);
                      return acc;
                    }, {})
                  ).map(([emoji, whoReacted]) => (
                    <button
                      key={emoji}
                      className={`wa-reaction-pill ${whoReacted.includes(username) ? "mine" : ""}`}
                      onClick={() => handleReact(id, emoji)}
                    >
                      {emoji} {whoReacted.length}
                    </button>
                  ))}
                </div>
              )}

              <div className="wa-message-footer">
                {msg.edited && <span className="wa-edited-tag">edited</span>}
                <span className="wa-message-time">{formatTime(timestamp)}</span>
                {mine && <span className="wa-tick">✓</span>}
              </div>
            </>
          )}
        </div>
      </article>
    );

    lastDateLabel = dayLabel;
    lastSender = msg.sender;
  });

  return (
    <div className="wa-shell">
      <div className={`wa-app ${mobileChatOpen ? "mobile-chat-open" : ""}`}>
        <aside className="wa-sidebar">
          <div className="wa-sidebar-header">
            <div>
              <p className="wa-label">Signed in as</p>
              <h2>{username}</h2>
            </div>
            <button className="wa-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>

          <div className="wa-search">
            <FaSearch />
            <input
              type="text"
              placeholder="Search conversations"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="wa-contact-list">
            <button
              type="button"
              className={`wa-archived-toggle ${showArchivedList ? "active" : ""}`}
              onClick={() => {
                setShowArchivedList((prev) => !prev);
                setSwipedContactKey(null);
                setContactMenuFor(null);
              }}
            >
              {showArchivedList ? "Back to Chats" : `Archived (${archivedCount})`}
            </button>

            {visibleContacts.map((contact) => {
              const unread = unreadCounts[contact.key] || 0;
              const isGlobal = contact.key === "all";
              const lastMsg = contact.preview;
              const swipeOpen = swipedContactKey === contact.key;
              const menuOpen = contactMenuFor === contact.key;

              return (
                <div
                  key={contact.key}
                  className={`wa-contact-swipe ${swipeOpen ? "revealed" : ""} ${menuOpen ? "menu-open" : ""}`}
                  onTouchStart={handleContactTouchStart}
                  onTouchMove={handleContactTouchMove}
                  onTouchEnd={() => handleContactTouchEnd(contact.key)}
                >
                  <div className="wa-contact-actions-rail">
                    {!archivedChats[contact.key] ? (
                      <button
                        type="button"
                        className="wa-contact-action archive"
                        onClick={() => archiveChatByKey(contact.key)}
                      >
                        Archived
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="wa-contact-action archive"
                        onClick={() => {
                          setArchivedChats((prev) => ({ ...prev, [contact.key]: false }));
                          setSwipedContactKey(null);
                        }}
                      >
                        Unarchive
                      </button>
                    )}
                    <button
                      type="button"
                      className="wa-contact-action more"
                      onClick={() => {
                        setContactMenuFor(contact.key);
                        setSwipedContactKey(null);
                      }}
                    >
                      ⋯ More
                    </button>
                  </div>

                  <div className={`wa-contact-row ${menuOpen ? "menu-open" : ""} ${!isGlobal ? "has-contact-menu" : ""}`}>
                    <button
                      className={`wa-contact ${selectedUser === contact.key ? "active" : ""}`}
                      onClick={() => {
                        handleSelectUser(contact.key);
                      }}
                    >
                      {isGlobal ? (
                        <span className="wa-avatar global">#</span>
                      ) : (
                        <span className={`wa-avatar ${getAvatarColorClass(contact.label)}`}>
                          {contact.label?.slice(0, 1).toUpperCase()}
                          <span className={`wa-presence-dot ${contact.isOnline ? "online" : ""}`}></span>
                        </span>
                      )}

                      <span className="wa-contact-body">
                        <span className="wa-contact-top">
                          <strong>
                            {contact.label}
                            {favoriteChats[contact.key] ? " ★" : ""}
                            {lockedChats[contact.key] ? " 🔒" : ""}
                          </strong>
                          {lastMsg && (
                            <span className="wa-contact-time">
                              {formatTime(lastMsg.createdAt || lastMsg.timestamp || Date.now())}
                            </span>
                          )}
                        </span>
                        <span className="wa-contact-bottom">
                          <span className="wa-contact-preview">
                            {mutedChats[contact.key] ? "🔕 " : ""}
                            {lastMsg
                              ? lastMsg.message || (lastMsg.media ? "📎 Attachment" : "")
                              : contact.previewFallback}
                          </span>
                          {unread > 0 && selectedUser !== contact.key && (
                            <span className="wa-unread-badge">{unread}</span>
                          )}
                        </span>
                      </span>
                    </button>

                    {!isGlobal && (
                      <span className="wa-contact-menu-slot">
                        <button
                          type="button"
                          className={`wa-contact-menu-trigger ${menuOpen ? "active" : ""}`}
                          aria-label={`Open actions for ${contact.label}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setContactMenuFor((prev) => (prev === contact.key ? null : contact.key));
                            setSwipedContactKey(null);
                          }}
                        >
                          ⋮
                        </button>

                        {menuOpen && (
                          <div className="wa-contact-inline-menu">
                            <button onClick={() => handleMenuAction("contact-info", contact.key, contact.label)}>
                              Info
                            </button>
                            <button onClick={() => handleMenuAction("lock-chat", contact.key, contact.label)}>
                              {lockedChats[contact.key] ? "Unlock Chat" : "Lock Chat"}
                            </button>
                            <button onClick={() => handleMenuAction("add-to-fav", contact.key, contact.label)}>
                              {favoriteChats[contact.key] ? "Remove Favourite" : "Add to Favourites"}
                            </button>
                            <button onClick={() => handleMenuAction("clear-chat", contact.key, contact.label)}>
                              Clear Chat
                            </button>
                            <button
                              className="danger"
                              onClick={() => handleMenuAction("delete-chat", contact.key, contact.label)}
                            >
                              Delete Chat
                            </button>
                          </div>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {visibleContacts.length === 0 && (
              <div className="wa-empty-contacts">No contacts match "{searchQuery}"</div>
            )}
          </div>
        </aside>

        <section className="wa-main">
          <header className="wa-chat-header">
            <div className="wa-chat-header-left">
              <button className="wa-back-btn" onClick={() => setMobileChatOpen(false)}>
                <FaArrowLeft />
              </button>
              <div>
                <h3>{selectedChatLabel}</h3>
                <p className={`wa-chat-status ${selectedChatStatus === "online" ? "online" : ""}`}>
                  {selectedChatStatus}
                </p>
              </div>
            </div>
            {selectedMessages.length > 0 && (
              <button className="wa-delete" onClick={handleDeleteMessages}>
                Delete {selectedMessages.length}
              </button>
            )}
          </header>

          <div className="wa-messages" ref={messagesContainerRef}>
            {currentCache?.hasMore && (
              <div className="wa-load-more">
                <button onClick={loadOlderMessages} disabled={currentCache.loading}>
                  {currentCache.loading ? "Loading…" : "Load earlier messages"}
                </button>
              </div>
            )}

            {messages.length === 0 ? (
              currentCache?.loading ? (
                <div className="wa-empty-chat">Loading messages…</div>
              ) : (
                <div className="wa-empty-chat">No messages yet — say hi 👋</div>
              )
            ) : (
              renderedMessages
            )}

            {typingUsers.length > 0 && (
              <div className="wa-typing">
                {typingUsers.join(", ")} is typing
                <span className="wa-typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </div>
            )}
            <div ref={messagesEndRef}></div>
          </div>

          {previewMedia && (
            <div className="wa-preview">
              {previewType === "image" ? (
                <img src={previewMedia} alt="preview" />
              ) : previewType === "video" ? (
                <video src={previewMedia} controls />
              ) : previewType === "audio" ? (
                <audio src={previewMedia} controls />
              ) : (
                <p>File ready to upload</p>
              )}
            </div>
          )}

          {replyingTo && (
            <div className="wa-reply-bar">
              <div>
                <span className="wa-reply-bar-sender">Replying to {replyingTo.sender}</span>
                <span className="wa-reply-bar-snippet">
                  {replyingTo.message ||
                    (replyingTo.mediaType ? "📎 Attachment" : "")}
                </span>
              </div>
              <button onClick={() => setReplyingTo(null)} aria-label="Cancel reply">
                ✕
              </button>
            </div>
          )}

          <div className="wa-composer">
            <button className="wa-icon-btn" onClick={toggleEmojiPicker} type="button">
              😊
            </button>

            {showPicker && (
              <div className="wa-emoji-picker">
                <Picker data={data} onEmojiSelect={addEmoji} />
              </div>
            )}

            <label htmlFor="fileInput" className="wa-icon-btn" title="Attach">
              📎
            </label>
            <input
              id="fileInput"
              type="file"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
              style={{ display: "none" }}
              onChange={handleFileUpload}
            />

            <input
              value={message}
              onChange={handleInputChange}
              placeholder={`Message ${selectedChatLabel}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
            />

            <button
              className="wa-send"
              onClick={handleSend}
              disabled={!message.trim() && !mediaUrl}
            >
              Send
            </button>
          </div>
        </section>
      </div>

      {infoContact && (
        <div className="wa-info-modal-backdrop" onClick={() => setInfoModalFor(null)}>
          <div className="wa-info-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wa-info-modal-top">
              {infoContact.key === "all" ? (
                <span className="wa-avatar global">#</span>
              ) : (
                <span className={`wa-avatar ${getAvatarColorClass(infoContact.label)}`}>
                  {infoContact.label?.slice(0, 1).toUpperCase()}
                  <span className={`wa-presence-dot ${infoContact.isOnline ? "online" : ""}`}></span>
                </span>
              )}

              <div>
                <h4>{infoContact.label}</h4>
                <p>
                  {infoContact.key === "all"
                    ? `${Object.keys(onlineUsers).length} online now`
                    : infoContact.isOnline
                      ? "online"
                      : userStatus[infoContact.key] || "offline"}
                </p>
              </div>
            </div>

            <div className="wa-info-grid">
              <div>
                <span>Chat Type</span>
                <strong>{infoContact.key === "all" ? "Global" : "Direct Message"}</strong>
              </div>
              <div>
                <span>Favourites</span>
                <strong>{favoriteChats[infoContact.key] ? "Added" : "Not added"}</strong>
              </div>
              <div>
                <span>Lock Status</span>
                <strong>{lockedChats[infoContact.key] ? "Locked" : "Unlocked"}</strong>
              </div>
              <div>
                <span>Last Preview</span>
                <strong>
                  {infoContact.preview
                    ? infoContact.preview.message || (infoContact.preview.media ? "Attachment" : "Empty")
                    : infoContact.previewFallback}
                </strong>
              </div>
            </div>

            <button className="wa-info-close" onClick={() => setInfoModalFor(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatApp;
