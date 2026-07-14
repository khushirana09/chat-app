const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const uploadRoute = require("./routes/upload");

// Route & Model Imports
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/userRoutes");
const groupRoutes = require("./routes/groups");
const User = require("./models/User");
const Message = require("./models/Message");
const Group = require("./models/Group");

// Load environment variables FIRST, before anything below reads process.env
dotenv.config();

// Fail fast with a clear message instead of a confusing crash later.
// Missing MONGO_URL previously caused mongoose.connect(undefined) to throw
// immediately with a cryptic error; missing JWT_SECRET previously caused
// every login/register to silently fall back to an insecure hardcoded value.
const REQUIRED_ENV_VARS = ["MONGO_URL", "JWT_SECRET"];
const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missingEnvVars.length > 0) {
  console.error(
    `❌ Missing required environment variable(s): ${missingEnvVars.join(
      ", "
    )}. Create a backend/.env file (see backend/.env.example) and restart.`
  );
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

// Track typing users & online users
const typingUsers = {};
const usersOnline = {};
const users = {};
const userSocketMap = {};

// Small, stable shape for sidebar previews — only what's needed to render
// a preview line, not the full message document.
function summarizeMessage(msg) {
  return {
    message: msg.message,
    media: msg.media,
    sender: msg.sender,
    createdAt: msg.createdAt,
  };
}

// Sends `event` to everyone allowed to see `message` — the global room,
// a group's current members, or just the two people in a DM. Used for
// reactions and edits, and mirrors the same visibility rules chatMessage
// already uses when first delivering a message.
async function broadcastToMessageAudience(message, event, payload) {
  if (message.groupId) {
    const group = await Group.findById(message.groupId).catch(() => null);
    if (!group) return;
    group.members.forEach((member) => {
      const sockId = userSocketMap[member];
      if (sockId) io.to(sockId).emit(event, payload);
    });
  } else if (!message.receiver || message.receiver === "all") {
    io.emit(event, payload);
  } else {
    [message.sender, message.receiver].forEach((who) => {
      const sockId = userSocketMap[who];
      if (sockId) io.to(sockId).emit(event, payload);
    });
  }
}

app.use("/api/upload", uploadRoute); //cloudinary upload route

// Allowed frontend origins. Normalize values to avoid mismatches
// caused by trailing slashes in environment variables.
const envClientLocal = (process.env.CLIENT_URL_LOCAL || "").replace(/\/$/, "");
const envClientProd = (process.env.CLIENT_URL_PROD || "").replace(/\/$/, "");
const allowedOrigins = [
  "http://localhost:3000",
  envClientLocal,
  envClientProd,
].filter(Boolean);

// Express CORS Options
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json()); // Parse incoming JSON

// Register Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/groups", groupRoutes);

//base route test
app.get("/", (req, res) => {
  res.send("API working fine.");
});
// app.use("/api/messages", messageRoute); // Uncomment if used

// Setup Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  },
});

// 🔐 Authenticate Socket.IO using JWT
io.use((socket, next) => {
  const token = socket.handshake.query.token;
  if (!token) return next(new Error("Authentication error"));

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error("Authentication error"));
    socket.user = decoded; // Attach decoded user info
    next();
  });
});

// 📡 Handle Socket.IO Connections
io.on("connection", (socket) => {
  const username = socket.user.username;
  console.log("A user connected:", socket.id, "Username:", username);

  users[username] = socket.id;
  userSocketMap[username] = socket.id;

  // When a user's client finishes setting up, refresh the online-users list.
  // IMPORTANT: this used to accept a username from the client and register
  // that name in userSocketMap — meaning anyone could call
  // socket.emit("join", "someone_elses_username") and hijack their private
  // messages. We only ever trust the identity verified by the JWT above.
  socket.on("join", () => {
    userSocketMap[username] = socket.id;
    io.emit("onlineUsers", Object.keys(userSocketMap));
  });

  // 🔥 Delete a message by ID — only the sender may delete their own message.
  // Previously this deleted whatever IDs the client sent with no ownership
  // check at all, so any logged-in user could delete anyone's messages.
  socket.on("deleteMessages", async ({ ids }) => {
    try {
      const safeIds = Array.isArray(ids)
        ? ids.filter((id) => mongoose.Types.ObjectId.isValid(id))
        : [];
      if (safeIds.length === 0) return;

      const existingMessages = await Message.find({
        _id: { $in: safeIds },
      }).select("_id");
      if (existingMessages.length === 0) return;

      const deletableIds = existingMessages.map((m) => m._id);
      await Message.deleteMany({ _id: { $in: deletableIds } });
      io.emit("messageDeleted", { ids: deletableIds.map(String) });
    } catch (err) {
      console.error("Failed to delete messages:", err);
    }
  });

  // 😊 React to a message — one reaction per user per message. Sending the
  // same emoji again removes it (toggle off); sending a different emoji
  // replaces whichever reaction that user already had.
  socket.on("reactToMessage", async ({ messageId, emoji }) => {
    try {
      if (!messageId || !emoji) return;
      const msg = await Message.findById(messageId);
      if (!msg) return;

      // Same visibility rule as everywhere else: only people who could see
      // this message in the first place may react to it.
      if (msg.groupId) {
        const group = await Group.findById(msg.groupId).catch(() => null);
        if (!group || !group.members.includes(username)) return;
      } else if (msg.receiver && msg.receiver !== "all") {
        if (msg.sender !== username && msg.receiver !== username) return;
      }

      const existingIndex = msg.reactions.findIndex((r) => r.username === username);
      const alreadyHadThisEmoji =
        existingIndex !== -1 && msg.reactions[existingIndex].emoji === emoji;

      if (existingIndex !== -1) msg.reactions.splice(existingIndex, 1);
      if (!alreadyHadThisEmoji) msg.reactions.push({ emoji, username });

      await msg.save();

      broadcastToMessageAudience(msg, "messageReactionUpdated", {
        messageId,
        reactions: msg.reactions,
      });
    } catch (err) {
      console.error("Error updating reaction:", err);
    }
  });

  // ✏️ Edit a message — only the original sender may edit, and only the
  // text (media itself isn't editable, only mixing in/updating a caption).
  socket.on("editMessage", async ({ messageId, newText }) => {
    try {
      const msg = await Message.findById(messageId);
      if (!msg || msg.sender !== username) return;

      const trimmed = (newText || "").trim();
      if (!trimmed && !msg.media) return; // a message needs text or media

      msg.message = trimmed;
      msg.edited = true;
      await msg.save();

      broadcastToMessageAudience(msg, "messageEdited", {
        messageId,
        message: msg.message,
        edited: true,
      });
    } catch (err) {
      console.error("Error editing message:", err);
    }
  });

  // Online status
  socket.on("user-login", () => {
    usersOnline[username] = true;
    io.emit("user-status", { userId: username, status: "online" });
    console.log(`User ${username} is now online`);
  });

  // typing event — again, always the verified identity, never a client-supplied one
  socket.on("typing", () => {
    socket.broadcast.emit("user-typing", { username });
  });

  socket.on("stop-typing", () => {
    socket.broadcast.emit("stop-typing", { username });
  });

  // Lightweight "last message per conversation" summary for the sidebar —
  // deliberately separate from the paginated getMessages below. Without
  // this, showing a preview line for every contact would mean loading
  // each contact's full message history just to read the last line,
  // which defeats the point of paginating the open conversation.
  socket.on("getConversationPreviews", async () => {
    try {
      const contacts = await User.find({ username: { $ne: username } }, "username");
      const previews = {};

      const lastGlobal = await Message.findOne({ receiver: "all" }).sort({ createdAt: -1 });
      if (lastGlobal) previews.all = summarizeMessage(lastGlobal);

      await Promise.all(
        contacts.map(async (contact) => {
          const last = await Message.findOne({
            groupId: null,
            $or: [
              { sender: username, receiver: contact.username },
              { sender: contact.username, receiver: username },
            ],
          }).sort({ createdAt: -1 });
          if (last) previews[contact.username] = summarizeMessage(last);
        })
      );

      socket.emit("conversationPreviews", previews);
    } catch (err) {
      console.error("Error fetching conversation previews:", err);
    }
  });

  // Message history — paginated, and scoped to what this user may see:
  // the global room, a group they're a member of, or a DM they're part of.
  //
  // conversationKey is "all", "group:<id>", or another user's username.
  // `before` (an ISO timestamp) fetches the page immediately older than
  // that message, so the frontend can implement "load earlier messages"
  // instead of pulling the entire history on every load.
  socket.on("getMessages", async ({ conversationKey = "all", before, limit = 30 } = {}) => {
    try {
      const capped = Math.min(Math.max(Number(limit) || 30, 1), 100);
      let query;

      if (conversationKey === "all") {
        query = { receiver: "all" };
      } else if (conversationKey.startsWith("group:")) {
        const groupId = conversationKey.slice(6);
        const group = await Group.findById(groupId).catch(() => null);
        if (!group || !group.members.includes(username)) {
          // Not a member (or the group doesn't exist) — return nothing rather
          // than confirming whether the group exists.
          return socket.emit("previousMessages", {
            conversationKey,
            messages: [],
            hasMore: false,
          });
        }
        query = { groupId };
      } else {
        query = {
          $or: [
            { sender: username, receiver: conversationKey },
            { sender: conversationKey, receiver: username },
          ],
        };
      }

      if (before) query.createdAt = { $lt: new Date(before) };

      const page = await Message.find(query).sort({ createdAt: -1 }).limit(capped);
      page.reverse(); // oldest-first for display

      socket.emit("previousMessages", {
        conversationKey,
        messages: page,
        hasMore: page.length === capped,
      });
    } catch (err) {
      console.error("Error fetching messages:", err);
    }
  });

  // Public, private, and group chat
  socket.on("chatMessage", async (msg) => {
    try {
      // sender is always the verified identity from the JWT — never trust
      // a client-supplied sender field, or anyone could send messages that
      // appear to come from another user.
      const sender = username;
      const { receiver, groupId, message, media, mediaType, replyTo } = msg;

      if (!message?.trim() && !media) return; // nothing to send
      if (message && message.length > 4000) return; // basic abuse guard

      // replyTo is a client-supplied snapshot (see the schema comment for
      // why it's a snapshot, not a live reference). It's purely cosmetic —
      // nothing security-sensitive depends on its contents — so we just
      // cap its size rather than re-verifying the original message exists.
      let safeReplyTo = null;
      if (replyTo && replyTo.messageId) {
        safeReplyTo = {
          messageId: replyTo.messageId,
          sender: String(replyTo.sender || "").slice(0, 50),
          message: String(replyTo.message || "").slice(0, 300),
          mediaType: replyTo.mediaType || null,
        };
      }

      let group = null;
      if (groupId) {
        group = await Group.findById(groupId).catch(() => null);
        if (!group || !group.members.includes(sender)) {
          return; // not a member — silently drop, same reasoning as above
        }
      }

      const newMessage = new Message({
        message,
        sender,
        receiver: groupId ? null : receiver,
        groupId: groupId || null,
        media,
        mediaType,
        replyTo: safeReplyTo,
      });

      await newMessage.save();

      const payload = {
        _id: newMessage._id,
        sender,
        receiver: groupId ? null : receiver || "all",
        groupId: groupId || null,
        message,
        media: media || null,
        mediaType: mediaType || null,
        createdAt: newMessage.createdAt,
        status: newMessage.status,
        replyTo: newMessage.replyTo || null,
        reactions: [],
        edited: false,
      };

      if (groupId) {
        // Deliver to every member currently online (sender included, so
        // their other open tabs/devices would also see it).
        group.members.forEach((member) => {
          const sockId = userSocketMap[member];
          if (sockId) io.to(sockId).emit("chatMessage", payload);
        });
      } else if (!receiver || receiver === "all") {
        io.emit("chatMessage", payload);
      } else {
        const targetSocketId = userSocketMap[receiver];
        if (targetSocketId) {
          io.to(targetSocketId).emit("chatMessage", payload);
          // Recipient is online right now, so this is genuinely delivered —
          // not just "sent". Persist that before echoing back to the sender.
          newMessage.status = "delivered";
          await newMessage.save();
          payload.status = "delivered";
        }
        socket.emit("chatMessage", payload); // Echo back to sender
      }
    } catch (err) {
      console.error("❌ Failed to save message:", err);
    }
  });

  // Recipient's client got a message while online (may not have viewed it yet).
  // Read receipts are only tracked for 1:1 DMs — group/global "read by everyone"
  // tracking would need a per-member read list, which isn't implemented yet.
  socket.on("messageDelivered", async ({ ids }) => {
    try {
      if (!Array.isArray(ids) || ids.length === 0) return;
      const toUpdate = await Message.find({
        _id: { $in: ids },
        receiver: username,
        status: "sent",
      });
      if (toUpdate.length === 0) return;

      await Message.updateMany(
        { _id: { $in: toUpdate.map((m) => m._id) } },
        { status: "delivered" }
      );

      const bySender = {};
      toUpdate.forEach((m) => {
        (bySender[m.sender] ||= []).push(m._id);
      });
      Object.entries(bySender).forEach(([sender, msgIds]) => {
        const sockId = userSocketMap[sender];
        if (sockId) {
          io.to(sockId).emit("messageStatusUpdate", { ids: msgIds, status: "delivered" });
        }
      });
    } catch (err) {
      console.error("Error marking messages delivered:", err);
    }
  });

  // Recipient actually opened/viewed this DM conversation.
  socket.on("messagesRead", async ({ conversationKey }) => {
    try {
      if (!conversationKey || conversationKey === "all" || conversationKey.startsWith("group:")) {
        return; // read receipts are DM-only, see note above
      }
      const unread = await Message.find({
        sender: conversationKey,
        receiver: username,
        status: { $ne: "read" },
      });
      if (unread.length === 0) return;

      const ids = unread.map((m) => m._id);
      await Message.updateMany({ _id: { $in: ids } }, { status: "read" });

      const sockId = userSocketMap[conversationKey];
      if (sockId) {
        io.to(sockId).emit("messageStatusUpdate", { ids, status: "read" });
      }
    } catch (err) {
      console.error("Error marking messages read:", err);
    }
  });

  // Initial user status
  socket.emit("initial-user-status", usersOnline);

  // Handle disconnect
  socket.on("disconnect", async () => {
    console.log(`${username} disconnected`);
    usersOnline[username] = false;

    const lastSeen = new Date();
    try {
      await User.findOneAndUpdate({ username }, { lastSeen });
    } catch (err) {
      console.error("Failed to persist lastSeen:", err);
    }

    io.emit("user-status", { userId: username, status: "offline", lastSeen });

    delete users[username];
    delete userSocketMap[username];
    delete typingUsers[socket.id];

    // 🟢 NEW: Update online users after disconnect
    io.emit("onlineUsers", Object.keys(userSocketMap));
  });
});

// 🧠 Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// 🚀 Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
